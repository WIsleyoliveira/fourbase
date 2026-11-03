// Tela /conectar: o ChatGPT abre o fourbase com os dados do pedido na URL. Só estes campos são repassados ao
// servidor, e o navegador só segue de volta para endereços do ChatGPT (o servidor já confere, isto é a segunda
// trava: nunca navegar para um endereço que veio de uma URL sem checar).
export const OAUTH_PARAMS = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource', 'scope']

export function readOAuthRequest(search) {
  const q = new URLSearchParams(search)
  const out = {}
  for (const k of OAUTH_PARAMS) {
    const v = q.get(k)
    if (v != null && v.length <= 2048) out[k] = v
  }
  return out
}

const HOSTS = new Set(['chatgpt.com', 'chat.openai.com', 'platform.openai.com'])
const LOCAL = new Set(['localhost', '127.0.0.1'])

export function isSafeRedirect(value, { allowLocal = false } = {}) {
  let u
  try { u = new URL(value) } catch { return false }
  if (u.protocol === 'https:' && HOSTS.has(u.hostname) && !u.username && !u.password) return true
  return allowLocal && u.protocol === 'http:' && LOCAL.has(u.hostname)
}
