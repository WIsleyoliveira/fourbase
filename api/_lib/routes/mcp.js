import { Router } from 'express'
import { appUrl } from '../assistantService.js'
import { handleMessage } from '../mcp.js'
import { logOAuth } from '../oauth.js'
import { assistantAuth, killSwitch } from './assistant.js'

// Servidor MCP do fourbase para o ChatGPT: POST /api/mcp (JSON-RPC, sem estado).
// Autenticação: token de acesso do login OAuth (fbo_…) no cabeçalho Authorization. Sem token ou token
// inválido → 401 com WWW-Authenticate apontando para os metadados (é assim que o ChatGPT descobre o login).
const router = Router()
export default router

// Quem pode chamar de um navegador. O ChatGPT chama de servidor para servidor (sem Origin); um Origin
// desconhecido é recusado (proteção contra DNS rebinding, exigida pela especificação do MCP).
const allowedOrigins = () => new Set([
  'https://chatgpt.com', 'https://chat.openai.com', 'https://platform.openai.com',
  ...(appUrl() ? [new URL(appUrl()).origin] : []),
])
const openaiOrigin = (origin) => {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && /(^|\.)(chatgpt|openai)\.com$/.test(u.hostname)
  } catch { return false }
}
const originGuard = (req, res, next) => {
  const origin = req.headers.origin
  if (origin && !allowedOrigins().has(origin) && !openaiOrigin(origin)) {
    logOAuth('origem_recusada', { origem: String(origin).slice(0, 120) })
    return res.status(403).json({ error: 'Origem não permitida' })
  }
  next()
}

const challenge = (req, res, next) => {
  req.wwwAuthenticate = `Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource"`
  next()
}

// Sem SSE: o ChatGPT usa só POST. GET/DELETE respondem 405 (permitido pela especificação).
const methodNotAllowed = (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST' })
router.get('/api/mcp', methodNotAllowed)
router.delete('/api/mcp', methodNotAllowed)

router.post('/api/mcp', killSwitch, originGuard, challenge, assistantAuth('agenda:read'), (req, res) => {
  const ctx = { user: req.user, token: req.apiToken }
  const hooks = { activity: (a) => { if (a) req.activity = a } }
  const body = req.body
  ;(async () => {
    const batch = Array.isArray(body)
    const messages = batch ? body : [body]
    if (!messages.length) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requisição vazia' } })
    const out = []
    for (const m of messages) {
      const r = await handleMessage(m, ctx, hooks)
      if (r) out.push(r)
    }
    // só notificações: sem corpo (202)
    if (!out.length) return res.status(202).end()
    res.json(batch ? out : out[0])
  })().catch((err) => {
    console.error('mcp:', err)
    res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Erro interno' } })
  })
})
