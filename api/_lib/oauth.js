// Login OAuth do fourbase para o ChatGPT (servidor MCP): peças puras, sem banco nem HTTP.
// O ChatGPT não aceita chave de API em MCP: só OAuth 2.1 (código + PKCE S256). Aqui ficam as regras que
// decidem o que é aceito — a API (routes/oauth.js) só aplica.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { SCOPES, hashToken } from './assistant.js'

export const ACCESS_TTL_S = 3600 // token de acesso: 1 hora
export const REFRESH_TTL_DAYS = 90 // conexão: renovar estende, sempre até 90 dias à frente
export const CODE_TTL_S = 300 // código de autorização: 5 minutos, uso único

const b64url = (n) => randomBytes(n).toString('base64url')
export const generateAuthCode = () => b64url(32)
export const generateClientId = () => 'fbc_' + b64url(24)
export { hashToken as hashSecret }

// Tokens da conexão são DERIVADOS (HMAC com o segredo do servidor) de (id da conexão, geração). Assim, se o ChatGPT
// repetir uma renovação com o token que acabou de ser trocado (duas chamadas ao mesmo tempo, resposta perdida), o
// servidor devolve exatamente os mesmos tokens, sem guardar nada recuperável no banco (só o hash, como sempre).
const SECRET = () => process.env.JWT_SECRET || 'fourbase-dev-secret-troque-em-producao'
const tokenKey = () => createHmac('sha256', SECRET()).update('fourbase-oauth-tokens-v1').digest()
const derive = (prefix, kind, connId, gen) => prefix + createHmac('sha256', tokenKey()).update(`${kind}:${connId}:${gen}`).digest('base64url')
export const deriveAccessToken = (connId, gen) => derive('fbo_', 'access', connId, gen)
export const deriveRefreshToken = (connId, gen) => derive('fbr_', 'refresh', connId, gen)

// Diagnóstico nos logs da Vercel. NUNCA recebe token, código, verifier nem segredo — só motivo, cliente e endereço.
export function logOAuth(event, fields = {}) {
  if (process.env.NODE_ENV !== 'production' && process.env.ASSISTANT_DEBUG !== '1') return
  console.warn('[assistente]', event, JSON.stringify(fields))
}

export const isAccessTokenShape = (v) => typeof v === 'string' && /^fbo_[A-Za-z0-9_-]{40,60}$/.test(v)

// Endereços de retorno aceitos ao registrar um aplicativo (DCR). Só o ChatGPT/OpenAI: quem registra é
// anônimo, então o código de autorização nunca pode voltar para um site qualquer.
const FIXED = new Set([
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chat.openai.com/connector_platform_oauth_redirect',
  'https://platform.openai.com/apps-manage/oauth',
])
const CALLBACK = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/connector\/oauth\/(?!\.+$)[A-Za-z0-9_.~-]{1,128}$/
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?\/[A-Za-z0-9._~\-/]*$/

// Trava opcional: OAUTH_ALLOWED_REDIRECTS (endereços exatos, separados por vírgula). Preenchida, SÓ esses valem —
// quem registra um app seu apontando para o ChatGPT dele não consegue receber o código de ninguém. A trava vale
// também na hora de autorizar (apps registrados antes dela deixam de funcionar se não estiverem na lista).
export const lockedRedirects = (env = process.env) =>
  String(env.OAUTH_ALLOWED_REDIRECTS || '').split(',').map((s) => s.trim()).filter(Boolean)

export function isAllowedRedirectUri(uri, { allowLocal = process.env.NODE_ENV !== 'production', locked = lockedRedirects() } = {}) {
  if (typeof uri !== 'string' || uri.length > 300) return false
  if (locked.length) return locked.includes(uri) && (uri.startsWith('https://') || (allowLocal && LOCAL.test(uri)))
  if (FIXED.has(uri) || CALLBACK.test(uri)) return true
  return allowLocal && LOCAL.test(uri)
}

// "agenda:read agenda:write offline_access" → só o que o fourbase sabe dar (offline_access é implícito:
// toda conexão tem token de renovação). Sem escopo pedido = todos.
export function grantedScopes(requested) {
  const asked = String(requested || '').split(/\s+/).filter(Boolean)
  if (!asked.length) return [...SCOPES]
  const ok = asked.filter((s) => SCOPES.includes(s))
  return ok.length ? [...new Set(ok)] : []
}

export const isValidChallenge = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(c)
export const isValidVerifier = (v) => typeof v === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(v)

// PKCE S256: base64url(sha256(verifier)) precisa ser o challenge guardado no código.
export function pkceMatches(verifier, challenge) {
  if (!isValidVerifier(verifier) || !isValidChallenge(challenge)) return false
  const a = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

const norm = (u) => String(u || '').replace(/\/+$/, '')
// O parâmetro "resource" (RFC 8707) tem de ser o próprio servidor MCP; ausente = tudo bem.
export const resourceOk = (resource, expected) => !resource || norm(resource) === norm(expected)

// Monta o endereço de volta para o ChatGPT (código ou erro) sem perder o state.
export function redirectWith(redirectUri, params) {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v)
  return url.toString()
}
