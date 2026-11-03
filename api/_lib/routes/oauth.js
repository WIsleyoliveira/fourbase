import express, { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { workspaceOf } from '../auth.js'
import { appUrl } from '../assistantService.js'
import { NOTICE_VERSION, SCOPES, assistantEnabledForUser, tokenPrefixOf } from '../assistant.js'
import {
  ACCESS_TTL_S, CODE_TTL_S, REFRESH_TTL_DAYS, generateAccessToken, generateAuthCode, generateClientId,
  generateRefreshToken, grantedScopes, hashSecret, isAllowedRedirectUri, isValidChallenge, pkceMatches, redirectWith, resourceOk,
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
const REG_LIMIT = 30
const REG_WINDOW_MS = 60 * 60 * 1000
function registrationAllowed(ip) {
  const now = Date.now()
  if (regHits.size > 5000) for (const [k, v] of regHits) if (now - v.start >= REG_WINDOW_MS) regHits.delete(k)
  const h = regHits.get(ip)
  if (!h || now - h.start >= REG_WINDOW_MS) { regHits.set(ip, { start: now, count: 1 }); return true }
  h.count += 1
  return h.count <= REG_LIMIT
}

router.post('/api/oauth/register', killSwitch, asyncRoute(async (req, res) => {
  if (!registrationAllowed(req.ip)) return res.status(429).json({ error: 'invalid_request', error_description: 'Muitas tentativas' })
  const body = req.body || {}
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5 || !uris.every((u) => isAllowedRedirectUri(u))) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'Endereço de retorno não permitido' })
  }
  if (body.token_endpoint_auth_method != null && body.token_endpoint_auth_method !== 'none') {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Só clientes públicos (token_endpoint_auth_method = none)' })
  }
  const name = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 100) : ''
  const client_id = generateClientId()
  const { error } = await supabase.from('fourbase_oauth_clients').insert({ client_id, client_name: name || null, redirect_uris: [...new Set(uris)] })
  if (error) throw error
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
const redirectAllowed = (client, uri) => !!client && Array.isArray(client.redirect_uris) && client.redirect_uris.includes(uri)

// A tela confere o pedido antes de mostrar o consentimento. Pedido inválido NUNCA redireciona (erro na tela).
router.get('/api/oauth/authorize/check', killSwitch, ...screen, asyncRoute(async (req, res) => {
  const client = await loadClient(req.query.client_id)
  if (!client || !redirectAllowed(client, req.query.redirect_uri)) {
    return res.status(400).json({ error: 'Pedido de conexão inválido. Volte ao ChatGPT e tente conectar de novo.' })
  }
  res.json({ ok: true, client_name: client.client_name || 'ChatGPT', notice_version: NOTICE_VERSION })
}))

router.post('/api/oauth/authorize', killSwitch, ...screen, asyncRoute(async (req, res) => {
  const b = req.body || {}
  const client = await loadClient(b.client_id)
  if (!client || !redirectAllowed(client, b.redirect_uri)) {
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
  back({ code })
}))

// ---------- Token ----------
const tokenError = (res, status, error, error_description) =>
  res.status(status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({ error, error_description })

async function issue(res, { row, scopes }) {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({
    access_token: row.access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: row.refresh, scope: scopes.join(' '),
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
    // código reaproveitado: possível interceptação — desliga o que ele gerou
    await revokeConnections(row.user_id, row.client_id, 'user')
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

  const access = generateAccessToken()
  const refresh = generateRefreshToken()
  const now = Date.now()
  const refreshExp = new Date(now + REFRESH_TTL_DAYS * 86400000).toISOString()
  const scopes = grantedScopes(row.scope)
  const { error } = await supabase.from('fourbase_api_tokens').insert({
    workspace_id: user.workspace_id, user_id: user.id, kind: 'oauth', name: (client.client_name || 'ChatGPT').slice(0, 60),
    token_hash: hashSecret(access), prefix: tokenPrefixOf(access), scopes,
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_hash: hashSecret(refresh), refresh_expires_at: refreshExp, expires_at: refreshExp,
    oauth_client_id: client.client_id,
  })
  if (error) throw error
  return issue(res, { row: { access, refresh }, scopes })
}

async function refreshTokens(req, res) {
  const { refresh_token, client_id } = req.body
  if (!refresh_token || !client_id) return tokenError(res, 400, 'invalid_request', 'Faltam parâmetros')
  const oldHash = hashSecret(String(refresh_token))
  const { data: conn } = await supabase.from('fourbase_api_tokens').select('*').eq('refresh_hash', oldHash).maybeSingle()
  if (!conn || conn.revoked_at || conn.kind !== 'oauth' || conn.oauth_client_id !== client_id) return tokenError(res, 400, 'invalid_grant', 'Token de renovação inválido')
  if (Date.parse(conn.refresh_expires_at) <= Date.now()) return tokenError(res, 400, 'invalid_grant', 'Conexão expirada')
  const { data: user } = await supabase.from('fourbase_users').select('*').eq('id', conn.user_id).eq('workspace_id', conn.workspace_id).maybeSingle()
  if (!isActiveGestor(user) || !assistantEnabledForUser(user)) {
    await supabase.from('fourbase_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', conn.id)
    return tokenError(res, 400, 'invalid_grant', 'Usuário sem acesso')
  }
  const access = generateAccessToken()
  const refresh = generateRefreshToken()
  const now = Date.now()
  const refreshExp = new Date(now + REFRESH_TTL_DAYS * 86400000).toISOString()
  // rotação: o token de renovação antigo deixa de valer; só um pedido troca (os concorrentes caem em invalid_grant)
  const { data: swapped, error } = await supabase.from('fourbase_api_tokens').update({
    token_hash: hashSecret(access), prefix: tokenPrefixOf(access), access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_hash: hashSecret(refresh), refresh_expires_at: refreshExp, expires_at: refreshExp,
  }).eq('id', conn.id).eq('refresh_hash', oldHash).select()
  if (error) throw error
  if (!swapped?.length) return tokenError(res, 400, 'invalid_grant', 'Token de renovação já usado')
  return issue(res, { row: { access, refresh }, scopes: Array.isArray(conn.scopes) ? conn.scopes : [] })
}

router.post('/api/oauth/token', killSwitch, express.urlencoded({ extended: false, limit: '20kb' }), asyncRoute(async (req, res) => {
  req.body = req.body || {}
  const grant = req.body.grant_type
  if (grant === 'authorization_code') return exchangeCode(req, res)
  if (grant === 'refresh_token') return refreshTokens(req, res)
  return tokenError(res, 400, 'unsupported_grant_type', 'Use authorization_code ou refresh_token')
}))
