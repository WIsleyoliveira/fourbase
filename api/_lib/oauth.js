// Login OAuth do fourbase para o ChatGPT (servidor MCP): peças puras, sem banco nem HTTP.
// O ChatGPT não aceita chave de API em MCP: só OAuth 2.1 (código + PKCE S256). Aqui ficam as regras que
// decidem o que é aceito — a API (routes/oauth.js) só aplica.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { SCOPES, hashToken } from './assistant.js'

export const ACCESS_TTL_S = 3600 // token de acesso: 1 hora
export const REFRESH_TTL_DAYS = 90 // conexão: renovar estende, sempre até 90 dias à frente
export const CODE_TTL_S = 300 // código de autorização: 5 minutos, uso único

const b64url = (n) => randomBytes(n).toString('base64url')
export const generateAccessToken = () => 'fbo_' + b64url(32)
export const generateRefreshToken = () => 'fbr_' + b64url(32)
export const generateAuthCode = () => b64url(32)
export const generateClientId = () => 'fbc_' + b64url(24)
export { hashToken as hashSecret }

export const isAccessTokenShape = (v) => typeof v === 'string' && /^fbo_[A-Za-z0-9_-]{40,60}$/.test(v)

// Endereços de retorno aceitos ao registrar um aplicativo (DCR). Só o ChatGPT/OpenAI: quem registra é
// anônimo, então o código de autorização nunca pode voltar para um site qualquer.
const FIXED = new Set([
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chat.openai.com/connector_platform_oauth_redirect',
  'https://platform.openai.com/apps-manage/oauth',
])
const CALLBACK = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?\/[A-Za-z0-9._~\-/]*$/

export function isAllowedRedirectUri(uri, { allowLocal = process.env.NODE_ENV !== 'production' } = {}) {
  if (typeof uri !== 'string' || uri.length > 300) return false
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
