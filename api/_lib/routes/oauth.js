import express, { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { workspaceOf } from '../auth.js'
import { appUrl } from '../assistantService.js'
import { NOTICE_VERSION, SCOPES, assistantEnabledForUser, tokenPrefixOf } from '../assistant.js'
import {
  ACCESS_TTL_S, CODE_TTL_S, REFRESH_TTL_DAYS, deriveAccessToken, deriveRefreshToken, generateAuthCode, generateClientId,
  grantedScopes, hashSecret, isAllowedRedirectUri, isValidChallenge, logOAuth, lockedRedirects, pkceMatches, redirectWith, resourceOk,
} from '../oauth.js'
import { killSwitch, screen } from './assistant.js'

// Login OAuth do fourbase para o ChatGPT (servidor MCP em /api/mcp). O fourbase é, ao mesmo tempo, o
// servidor de recursos (MCP) e o servidor de autorização:
//   descoberta  GET /.well-known/oauth-protected-resource  e  /.well-known/oauth-authorization-server
//   registro    POST /api/oauth/register            (o ChatGPT se registra sozinho, DCR; só endereços do ChatGPT)
//   autorizar   POST /api/oauth/authorize           (chamado pela tela /conectar, com o login normal do gestor)
//   token       POST /api/oauth/token               (código + PKCE → tokens; renovação com rotação)
// Códigos e tokens nunca são guardados: só o hash SHA-256. Cada autorização é uma "conexão"
// (linha de fourbase_api_tokens, kind='oauth') que o gestor vê e desliga na tela Assistente.
const router = Router()
export default router

export const resourceUrl = () => `${appUrl()}/api/mcp`
const issuer = () => appUrl()
const unavailable = (res) => res.status(503).json({ error: 'Configuração indisponível' })
const isActiveGestor = (u) => !!u && u.role === 'gestor' && u.status !== 'inactive'

// ---------- Descoberta ----------
const protectedResource = (req, res) => {
  if (!appUrl()) return unavailable(res)
  res.json({
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'fourbase',
  })
}
router.get('/.well-known/oauth-protected-resource', killSwitch, protectedResource)
router.get('/.well-known/oauth-protected-resource/api/mcp', killSwitch, protectedResource)

const authServerMetadata = (req, res) => {
  if (!appUrl()) return unavailable(res)
  res.json({
    issuer: issuer(),
    authorization_endpoint: `${appUrl()}/conectar`,
    token_endpoint: `${appUrl()}/api/oauth/token`,
    registration_endpoint: `${appUrl()}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SCOPES, 'offline_access'],
  })
}
router.get('/.well-known/oauth-authorization-server', killSwitch, authServerMetadata)
router.get('/.well-known/openid-configuration', killSwitch, authServerMetadata)

// ---------- Registro do aplicativo (DCR) ----------
// Quem registra é anônimo, mas um cliente registrado não dá acesso a nada: o código só volta para endereços
// do ChatGPT e só nasce depois que um gestor logado autoriza.
const regHits = new Map() // ip -> { start, count }
const regLimit = () => Number(process.env.OAUTH_REGISTER_LIMIT) || 30 // por IP e por hora (ajustável só para testes)
const REG_WINDOW_MS = 60 * 60 * 1000
function registrationAllowed(ip) {
  const now = Date.now()
  if (regHits.size > 5000) for (const [k, v] of regHits) if (now - v.start >= REG_WINDOW_MS) regHits.delete(k)
  const h = regHits.get(ip)
  if (!h || now - h.start >= REG_WINDOW_MS) { regHits.set(ip, { start: now, count: 1 }); return true }
  h.count += 1
  return h.count <= regLimit()
}

router.post('/api/oauth/register', killSwitch, asyncRoute(async (req, res) => {
  if (!registrationAllowed(req.ip)) return res.status(429).json({ error: 'invalid_request', error_description: 'Muitas tentativas' })
  const body = req.body || {}
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every((u) => isAllowedRedirectUri(u))) {
    logOAuth('register_recusado', { motivo: 'redirect_uri', enderecos: Array.isArray(uris) ? uris.slice(0, 5).map((u) => String(u).slice(0, 160)) : null, travado: lockedRedirects().length > 0 })
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'Endereço de retorno não permitido' })
  }
  // Cliente público sempre (PKCE no lugar de segredo). Se o pedido trouxer outro método de autenticação, não
  // recusamos: respondemos o que de fato vale ('none'), como a RFC 7591 permite — recusar quebraria o registro
  // de um cliente que só declara uma preferência.
  if (body.token_endpoint_auth_method != null && body.token_endpoint_auth_method !== 'none') {
    logOAuth('register_metodo_ajustado', { pedido: String(body.token_endpoint_auth_method).slice(0, 40) })
  }
  const name = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 100) : ''
  const client_id = generateClientId()
  const { error } = await supabase.from('fourbase_oauth_clients').insert({ client_id, client_name: name || null, redirect_uris: [...new Set(uris)] })
  if (error) throw error
  logOAuth('register_ok', { client_id, enderecos: [...new Set(uris)] })
  res.status(201).set('Cache-Control', 'no-store').json({
    client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name || undefined,
    redirect_uris: [...new Set(uris)], token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  })
}))

// ---------- Autorização (a tela /conectar chama aqui com o login do gestor) ----------
async function loadClient(clientId) {
  if (typeof clientId !== 'string' || !/^fbc_[A-Za-z0-9_-]{16,64}$/.test(clientId)) return null
  const { data } = await supabase.from('fourbase_oauth_clients').select('*').eq('client_id', clientId).maybeSingle()
  return data
}
// O endereço precisa ter sido registrado E ainda ser permitido hoje (a trava OAUTH_ALLOWED_REDIRECTS vale sobre apps
// registrados antes dela: um endereço de terceiros, mesmo já registrado, deixa de receber códigos).
const redirectAllowed = (client, uri) =>
  !!client && Array.isArray(client.redirect_uris) && client.redirect_uris.includes(uri) && isAllowedRedirectUri(uri)
const hostOf = (uri) => { try { return new URL(uri).host } catch { return '' } }

// A tela confere o pedido antes de mostrar o consentimento. Pedido inválido NUNCA redireciona (erro na tela).
router.get('/api/oauth/authorize/check', killSwitch, ...screen, asyncRoute(async (req, res) => {
  const client = await loadClient(req.query.client_id)
  if (!client || !redirectAllowed(client, req.query.redirect_uri)) {
    logOAuth('authorize_check_recusado', { client_id: String(req.query.client_id || '').slice(0, 80), destino: String(req.query.redirect_uri || '').slice(0, 160), cliente_existe: !!client })
    return res.status(400).json({ error: 'Pedido de conexão inválido. Volte ao ChatGPT e tente conectar de novo.' })
  }
  // destination: para onde o navegador volta depois do "Autorizo" — a tela mostra, para o gestor conferir
  res.json({ ok: true, client_name: client.client_name || 'ChatGPT', destination: hostOf(req.query.redirect_uri), notice_version: NOTICE_VERSION })
}))

router.post('/api/oauth/authorize', killSwitch, ...screen, asyncRoute(async (req, res) => {
  const b = req.body || {}
  const client = await loadClient(b.client_id)
  if (!client || !redirectAllowed(client, b.redirect_uri)) {
    logOAuth('authorize_recusado', { client_id: String(b.client_id || '').slice(0, 80), destino: String(b.redirect_uri || '').slice(0, 160), cliente_existe: !!client })
    return res.status(400).json({ error: 'Pedido de conexão inválido. Volte ao ChatGPT e tente conectar de novo.' })
  }
  const back = (params) => res.json({ redirect_to: redirectWith(b.redirect_uri, { state: b.state, ...params }) })
  if (b.decision === 'deny') return back({ error: 'access_denied' })
  if (b.decision !== 'allow') return res.status(400).json({ error: 'Decisão inválida' })
  // o gestor só autoriza o aviso ATUAL (a versão fica registrada junto)
  if (b.notice_version !== NOTICE_VERSION) return res.status(400).json({ error: 'Leia e autorize o aviso atual antes de conectar.', notice_version: NOTICE_VERSION })
  if (b.code_challenge_method !== 'S256' || !isValidChallenge(b.code_challenge)) return back({ error: 'invalid_request', error_description: 'PKCE S256 obrigatório' })
  if (!resourceOk(b.resource, resourceUrl())) return back({ error: 'invalid_target', error_description: 'resource inválido' })
  const scopes = grantedScopes(b.scope)
  if (!scopes.length) return back({ error: 'invalid_scope' })

  const workspaceId = workspaceOf(req)
  const code = generateAuthCode()
  const now = Date.now()
  const { error } = await supabase.from('fourbase_oauth_codes').insert({
    code_hash: hashSecret(code), client_id: client.client_id, user_id: req.user.id, workspace_id: workspaceId,
    redirect_uri: b.redirect_uri, code_challenge: b.code_challenge, resource: b.resource || null,
    scope: scopes.join(' '), expires_at: new Date(now + CODE_TTL_S * 1000).toISOString(),
  })
  if (error) throw error
  const { error: ce } = await supabase.from('fourbase_assistant_consents').insert({
    workspace_id: workspaceId, user_id: req.user.id, event: 'authorized', notice_version: NOTICE_VERSION,
  })
  if (ce) throw ce
  logOAuth('authorize_ok', { client_id: client.client_id, destino: hostOf(b.redirect_uri) })
  back({ code })
}))

// ---------- Token ----------
const REPLAY_GRACE_MS = 30 * 1000 // código de autorização repetido
const REFRESH_GRACE_MS = 60 * 1000 // renovação repetida com o token que acabou de ser trocado
const tokenError = (res, status, error, error_description) => {
  const b = res.req?.body || {}
  logOAuth('token_erro', { grant: b.grant_type, client_id: typeof b.client_id === 'string' ? b.client_id.slice(0, 80) : undefined, error, motivo: error_description })
  return res.status(status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({ error, error_description })
}

// Toda conexão tem token de renovação, então "offline_access" é sempre verdade: devolvemos no escopo para o
// cliente não achar que o escopo pedido foi reduzido.
const scopeText = (scopes) => [...scopes, 'offline_access'].join(' ')

async function issue(res, { access, refresh, scopes, expiresIn = ACCESS_TTL_S }) {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({
    access_token: access, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refresh, scope: scopeText(scopes),
  })
}

async function revokeConnections(userId, clientId, reason, exceptId = null) {
  const { data } = await supabase.from('fourbase_api_tokens').select('*').eq('user_id', userId).eq('kind', 'oauth').eq('oauth_client_id', clientId)
  const live = (data || []).filter((t) => !t.revoked_at && t.id !== exceptId)
  for (const t of live) {
    await supabase.from('fourbase_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', t.id)
    await supabase.from('fourbase_assistant_consents').insert({ workspace_id: t.workspace_id, user_id: userId, token_id: t.id, event: 'disconnected', reason })
  }
}

async function exchangeCode(req, res) {
  const { code, client_id, redirect_uri, code_verifier, resource } = req.body
  if (!code || !client_id || !redirect_uri || !code_verifier) return tokenError(res, 400, 'invalid_request', 'Faltam parâmetros')
  const { data: row } = await supabase.from('fourbase_oauth_codes').select('*').eq('code_hash', hashSecret(String(code))).maybeSingle()
  if (!row) return tokenError(res, 400, 'invalid_grant', 'Código inválido')
  if (row.used_at) {
    // Reaproveitado DEPOIS da janela de tolerância: possível interceptação — desliga o que ele gerou.
    // Dentro da janela é só um pedido repetido (resposta lenta, repetição do ChatGPT, dois pedidos juntos):
    // recusa sem desligar, senão a conexão que o primeiro pedido acabou de criar morreria.
    if (Date.now() - Date.parse(row.used_at) > REPLAY_GRACE_MS) await revokeConnections(row.user_id, row.client_id, 'user')
    return tokenError(res, 400, 'invalid_grant', 'Código já usado')
  }
  if (Date.parse(row.expires_at) <= Date.now()) return tokenError(res, 400, 'invalid_grant', 'Código expirado')
  if (row.client_id !== client_id || row.redirect_uri !== redirect_uri) return tokenError(res, 400, 'invalid_grant', 'Código não confere')
  if (!pkceMatches(String(code_verifier), row.code_challenge)) return tokenError(res, 400, 'invalid_grant', 'PKCE não confere')
  if (!resourceOk(resource, resourceUrl()) || !resourceOk(row.resource, resourceUrl())) return tokenError(res, 400, 'invalid_target', 'resource inválido')

  // uso único: só um pedido consegue marcar o código como usado (os concorrentes caem em invalid_grant)
  const { data: claimed, error: ce } = await supabase.from('fourbase_oauth_codes')
    .update({ used_at: new Date().toISOString() }).eq('id', row.id).is('used_at', null).select()
  if (ce) throw ce
  if (!claimed?.length) return tokenError(res, 400, 'invalid_grant', 'Código já usado')

  const { data: user } = await supabase.from('fourbase_users').select('*').eq('id', row.user_id).eq('workspace_id', row.workspace_id).maybeSingle()
  if (!isActiveGestor(user) || !assistantEnabledForUser(user)) return tokenError(res, 400, 'invalid_grant', 'Usuário sem acesso')
  const client = await loadClient(row.client_id)
  if (!client) return tokenError(res, 400, 'invalid_grant', 'Aplicativo removido')

  // uma conexão por pessoa e aplicativo: reconectar desliga a anterior
  await revokeConnections(user.id, client.client_id, 'replaced')

  // Os tokens são derivados do id da conexão + geração (ver oauth.js): assim uma renovação repetida devolve os mesmos.
  const connId = randomUUID()
  const access = deriveAccessToken(connId, 1)
  const refresh = deriveRefreshToken(connId, 1)
  const now = Date.now()
  const refreshExp = new Date(now + REFRESH_TTL_DAYS * 86400000).toISOString()
  const scopes = grantedScopes(row.scope)
  const { error } = await supabase.from('fourbase_api_tokens').insert({
    id: connId, workspace_id: user.workspace_id, user_id: user.id, kind: 'oauth', name: (client.client_name || 'ChatGPT').slice(0, 60),
    token_hash: hashSecret(access), prefix: tokenPrefixOf(access), scopes,
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_hash: hashSecret(refresh), refresh_expires_at: refreshExp, expires_at: refreshExp,
    refresh_gen: 1, oauth_client_id: client.client_id,
  })
  if (error) throw error
  logOAuth('token_emitido', { client_id: client.client_id })
  return issue(res, { access, refresh, scopes })
}

// Repetir a renovação: o ChatGPT pode mandar duas renovações ao mesmo tempo ou repetir uma cuja resposta se perdeu.
// Dentro de 60 s devolvemos EXATAMENTE os tokens atuais (derivados, então não há nada novo a guardar). Depois disso, um token
// já trocado voltar a aparecer é sinal de cópia roubada: a conexão é desligada e o gestor reconecta.
async function replayCurrent(res, conn) {
  const access = deriveAccessToken(conn.id, conn.refresh_gen)
  const refresh = deriveRefreshToken(conn.id, conn.refresh_gen)
  // se o segredo do servidor mudou desde a emissão, o que derivamos não bateria com o que está guardado
  if (!Number.isInteger(conn.refresh_gen) || hashSecret(access) !== conn.token_hash || hashSecret(refresh) !== conn.refresh_hash) {
    return tokenError(res, 400, 'invalid_grant', 'Token de renovação já usado')
  }
  const left = Math.floor((Date.parse(conn.access_expires_at) - Date.now()) / 1000)
  logOAuth('renovacao_repetida', { client_id: conn.oauth_client_id })
  return issue(res, { access, refresh, scopes: Array.isArray(conn.scopes) ? conn.scopes : [], expiresIn: Math.min(ACCESS_TTL_S, Math.max(1, left || 1)) })
}
const withinRefreshGrace = (conn) => !!conn.prev_refresh_at && Date.now() - Date.parse(conn.prev_refresh_at) <= REFRESH_GRACE_MS

async function refreshTokens(req, res) {
  const { refresh_token, client_id } = req.body
  if (!refresh_token || !client_id) return tokenError(res, 400, 'invalid_request', 'Faltam parâmetros')
  const oldHash = hashSecret(String(refresh_token))
  let { data: conn } = await supabase.from('fourbase_api_tokens').select('*').eq('refresh_hash', oldHash).maybeSingle()
  let old = false // o token apresentado é o ANTERIOR da conexão (já trocado)
  if (!conn) {
    const { data: prev } = await supabase.from('fourbase_api_tokens').select('*').eq('prev_refresh_hash', oldHash).maybeSingle()
    if (!prev) return tokenError(res, 400, 'invalid_grant', 'Token de renovação inválido')
    conn = prev
    old = true
  }
  if (conn.revoked_at || conn.kind !== 'oauth' || conn.oauth_client_id !== client_id) return tokenError(res, 400, 'invalid_grant', 'Token de renovação inválido')
  if (Date.parse(conn.refresh_expires_at) <= Date.now()) return tokenError(res, 400, 'invalid_grant', 'Conexão expirada')
  const { data: user } = await supabase.from('fourbase_users').select('*').eq('id', conn.user_id).eq('workspace_id', conn.workspace_id).maybeSingle()
  if (!isActiveGestor(user) || !assistantEnabledForUser(user)) {
    await supabase.from('fourbase_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', conn.id)
    return tokenError(res, 400, 'invalid_grant', 'Usuário sem acesso')
  }

  if (old) {
    if (withinRefreshGrace(conn)) return replayCurrent(res, conn)
    await revokeConnections(conn.user_id, conn.oauth_client_id, 'user')
    logOAuth('renovacao_reuso', { client_id: conn.oauth_client_id })
    return tokenError(res, 400, 'invalid_grant', 'Token de renovação já usado')
  }

  const gen = (Number.isInteger(conn.refresh_gen) ? conn.refresh_gen : 0) + 1
  const access = deriveAccessToken(conn.id, gen)
  const refresh = deriveRefreshToken(conn.id, gen)
  const now = Date.now()
  const refreshExp = new Date(now + REFRESH_TTL_DAYS * 86400000).toISOString()
  // rotação: só um pedido troca (compare-and-swap no hash atual); o token trocado fica como "anterior" por 60 s
  const { data: swapped, error } = await supabase.from('fourbase_api_tokens').update({
    token_hash: hashSecret(access), prefix: tokenPrefixOf(access), access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_hash: hashSecret(refresh), refresh_expires_at: refreshExp, expires_at: refreshExp,
    refresh_gen: gen, prev_refresh_hash: oldHash, prev_refresh_at: new Date(now).toISOString(),
  }).eq('id', conn.id).eq('refresh_hash', oldHash).select()
  if (error) throw error
  if (!swapped?.length) {
    // perdeu a corrida: o vencedor já trocou. Para quem repetiu na hora, devolve os tokens do vencedor.
    const { data: now2 } = await supabase.from('fourbase_api_tokens').select('*').eq('id', conn.id).maybeSingle()
    if (now2 && !now2.revoked_at && now2.prev_refresh_hash === oldHash && withinRefreshGrace(now2)) return replayCurrent(res, now2)
    return tokenError(res, 400, 'invalid_grant', 'Token de renovação já usado')
  }
  return issue(res, { access, refresh, scopes: Array.isArray(conn.scopes) ? conn.scopes : [] })
}

router.post('/api/oauth/token', killSwitch, express.urlencoded({ extended: false, limit: '20kb' }), asyncRoute(async (req, res) => {
  req.body = req.body || {}
  const grant = req.body.grant_type
  if (grant === 'authorization_code') return exchangeCode(req, res)
  if (grant === 'refresh_token') return refreshTokens(req, res)
  return tokenError(res, 400, 'unsupported_grant_type', 'Use authorization_code ou refresh_token')
}))
