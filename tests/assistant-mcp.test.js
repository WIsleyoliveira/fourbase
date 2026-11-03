// Assistente via MCP: login OAuth do fourbase (registro, autorização com PKCE, token, renovação com rotação,
// desligar) e o servidor MCP (/api/mcp) usando as mesmas regras da API REST.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { NOTICE_VERSION } from '../api/_lib/assistant.js'

const PASSWORD = 'senha-teste-123'
const APP = 'https://fourbase.example'
const RESOURCE = `${APP}/api/mcp`
const REDIRECT = 'https://chatgpt.com/connector/oauth/abc123_DEF'
const now = new Date().toISOString()
const wsA = randomUUID()
const wsB = randomUUID()
const id = { gestorA: randomUUID(), funcA: randomUUID(), gestorB: randomUUID() }
const user = (uid, workspace_id, email, role) => ({
  id: uid, workspace_id, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const columns = (workspace_id) => [['todo', 'A Fazer'], ['done', 'Concluído']]
  .map(([key, label], position) => ({ id: randomUUID(), workspace_id, key, label, position, color: '#999999', created_at: now }))
const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'Empresa A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'Empresa B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor'), user(id.funcA, wsA, 'f@a.test', 'funcionario'), user(id.gestorB, wsB, 'g@b.test', 'gestor')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [{ id: randomUUID(), workspace_id: wsA, name: 'Açaí & Cia', created_at: now }],
  fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
  fourbase_api_tokens: [], fourbase_assistant_batches: [], fourbase_assistant_consents: [],
  fourbase_oauth_clients: [], fourbase_oauth_codes: [],
}

let server, base, sb
const jwt = {}
const call = async (method, url, { token, body, form, headers = {} } = {}) => {
  const h = { ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  let payload
  if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString() }
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(base + url, { method, headers: h, body: payload })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: res.status, body: parsed, headers: res.headers }
}
const rpc = (token, method, params, rid = 1) => call('POST', '/api/mcp', { token, body: { jsonrpc: '2.0', id: rid, method, params } })
const callTool = async (token, name, args) => (await rpc(token, 'tools/call', { name, arguments: args })).body.result
const db = () => JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8'))
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const b64 = (buf) => Buffer.from(buf).toString('base64url')
const pkce = () => { const verifier = b64(randomBytes(48)); return { verifier, challenge: b64(createHash('sha256').update(verifier).digest()) } }
const setRow = async (table, match, values) => {
  let q = sb.from(table).update(values)
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { error } = await q
  if (error) throw new Error(error.message)
}

const registerClient = async (redirect = REDIRECT) =>
  (await call('POST', '/api/oauth/register', { body: { client_name: 'ChatGPT', redirect_uris: [redirect], token_endpoint_auth_method: 'none' } })).body

// Fluxo completo: registra → autoriza (gestor logado) → troca o código. Devolve os tokens.
async function connect(who = 'gestorA', extra = {}) {
  const client = extra.client || await registerClient()
  const p = pkce()
  const a = await call('POST', '/api/oauth/authorize', {
    token: jwt[who],
    body: {
      client_id: client.client_id, redirect_uri: REDIRECT, state: 'xyz', code_challenge: p.challenge, code_challenge_method: 'S256',
      resource: RESOURCE, scope: 'agenda:read agenda:write offline_access', decision: 'allow', notice_version: NOTICE_VERSION, ...extra.authorize,
    },
  })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const code = new URL(a.body.redirect_to).searchParams.get('code')
  const t = await call('POST', '/api/oauth/token', {
    form: { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: p.verifier, resource: RESOURCE },
  })
  return { client, p, code, token: t, ...t.body }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-mcp-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  process.env.APP_URL = APP
  process.env.ASSISTANT_WORKSPACE_IDS = '*'
  delete process.env.SUPABASE_URL
  delete process.env.ASSISTANT_ENABLED
  const { default: app } = await import('../api/index.js')
  ;({ supabase: sb } = await import('../api/_lib/supabase.js'))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  for (const [who, email] of [['gestorA', 'g@a.test'], ['funcA', 'f@a.test'], ['gestorB', 'g@b.test']]) {
    const r = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })
    jwt[who] = r.body.token
  }
})
after(() => server?.close())

test('descoberta: recurso protegido e servidor de autorização com PKCE S256 e registro', async () => {
  const pr = (await call('GET', '/.well-known/oauth-protected-resource')).body
  assert.equal(pr.resource, RESOURCE)
  assert.deepEqual(pr.authorization_servers, [APP])
  const pr2 = await call('GET', '/.well-known/oauth-protected-resource/api/mcp')
  assert.equal(pr2.body.resource, RESOURCE)
  const as = (await call('GET', '/.well-known/oauth-authorization-server')).body
  assert.equal(as.issuer, APP)
  assert.equal(as.authorization_endpoint, `${APP}/conectar`)
  assert.equal(as.token_endpoint, `${APP}/api/oauth/token`)
  assert.equal(as.registration_endpoint, `${APP}/api/oauth/register`)
  assert.deepEqual(as.code_challenge_methods_supported, ['S256'])
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none'])
  assert.deepEqual((await call('GET', '/.well-known/openid-configuration')).body, as)
  const saved = process.env.APP_URL
  delete process.env.APP_URL
  assert.equal((await call('GET', '/.well-known/oauth-authorization-server')).status, 503, 'sem APP_URL não inventa endereço')
  process.env.APP_URL = saved
})

test('registro: só endereços do ChatGPT; só cliente público', async () => {
  const ok = await call('POST', '/api/oauth/register', { body: { client_name: 'ChatGPT', redirect_uris: [REDIRECT] } })
  assert.equal(ok.status, 201)
  assert.match(ok.body.client_id, /^fbc_/)
  assert.equal(ok.body.token_endpoint_auth_method, 'none')
  for (const bad of ['https://evil.example/cb', 'https://chatgpt.com.evil.example/connector/oauth/x', 'http://chatgpt.com/connector/oauth/x',
    'https://chatgpt.com/connector/oauth/', 'https://chatgpt.com/other', 'javascript:alert(1)', 'https://chatgpt.com/connector/oauth/a/../b']) {
    const r = await call('POST', '/api/oauth/register', { body: { redirect_uris: [bad] } })
    assert.equal(r.status, 400, bad)
    assert.equal(r.body.error, 'invalid_redirect_uri')
  }
  assert.equal((await call('POST', '/api/oauth/register', { body: { redirect_uris: [] } })).status, 400)
  assert.equal((await call('POST', '/api/oauth/register', { body: { redirect_uris: [REDIRECT, 'https://evil.example/x'] } })).status, 400, 'basta um ruim')
  assert.equal((await call('POST', '/api/oauth/register', { body: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' } })).status, 400)
  assert.equal((await call('POST', '/api/oauth/register', { body: { redirect_uris: ['https://platform.openai.com/apps-manage/oauth'] } })).status, 201)
})

test('autorizar: só gestor logado; pedido inválido nunca redireciona; aviso atual obrigatório; recusar volta com access_denied', async () => {
  const client = await registerClient()
  const p = pkce()
  const body = { client_id: client.client_id, redirect_uri: REDIRECT, state: 's1', code_challenge: p.challenge, code_challenge_method: 'S256', resource: RESOURCE, decision: 'allow', notice_version: NOTICE_VERSION }
  assert.equal((await call('POST', '/api/oauth/authorize', { body })).status, 401, 'sem login')
  assert.equal((await call('POST', '/api/oauth/authorize', { token: jwt.funcA, body })).status, 403, 'funcionário')
  // endereço de retorno que não é o registrado, ou cliente inexistente: erro na tela, sem redirecionar
  const wrongUri = await call('POST', '/api/oauth/authorize', { token: jwt.gestorA, body: { ...body, redirect_uri: 'https://chatgpt.com/connector/oauth/outro' } })
  assert.equal(wrongUri.status, 400)
  assert.equal(wrongUri.body.redirect_to, undefined)
  assert.equal((await call('POST', '/api/oauth/authorize', { token: jwt.gestorA, body: { ...body, client_id: 'fbc_naoexiste123456789' } })).status, 400)
  assert.equal((await call('POST', '/api/oauth/authorize', { token: jwt.gestorA, body: { ...body, notice_version: 'velha' } })).status, 400)
  // PKCE plain / sem challenge / resource errado / escopo desconhecido voltam como erro OAuth ao ChatGPT
  const q = async (over) => new URL((await call('POST', '/api/oauth/authorize', { token: jwt.gestorA, body: { ...body, ...over } })).body.redirect_to).searchParams
  assert.equal((await q({ code_challenge_method: 'plain' })).get('error'), 'invalid_request')
  assert.equal((await q({ code_challenge: 'curto' })).get('error'), 'invalid_request')
  assert.equal((await q({ resource: 'https://evil.example/api/mcp' })).get('error'), 'invalid_target')
  assert.equal((await q({ scope: 'admin' })).get('error'), 'invalid_scope')
  // recusar
  const deny = await q({ decision: 'deny' })
  assert.equal(deny.get('error'), 'access_denied')
  assert.equal(deny.get('state'), 's1')
  assert.equal(db().fourbase_oauth_codes.length, 0, 'nada foi criado em nenhum desses pedidos')
  // check da tela
  assert.equal((await call('GET', `/api/oauth/authorize/check?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}`, { token: jwt.gestorA })).body.client_name, 'ChatGPT')
  assert.equal((await call('GET', `/api/oauth/authorize/check?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('https://chatgpt.com/x')}`, { token: jwt.gestorA })).status, 400)
})

test('troca do código: PKCE, uso único, expiração, cliente e endereço têm de conferir', async () => {
  const client = await registerClient()
  const fresh = async () => {
    const p = pkce()
    const a = await call('POST', '/api/oauth/authorize', { token: jwt.gestorA, body: {
      client_id: client.client_id, redirect_uri: REDIRECT, state: 's', code_challenge: p.challenge, code_challenge_method: 'S256', resource: RESOURCE, decision: 'allow', notice_version: NOTICE_VERSION } })
    return { p, code: new URL(a.body.redirect_to).searchParams.get('code') }
  }
  const ex = (code, p, over = {}) => call('POST', '/api/oauth/token', { form: { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: p.verifier, ...over } })
  const a = await fresh()
  assert.equal((await ex(a.code, pkce())).body.error, 'invalid_grant', 'verifier de outro')
  const b = await fresh()
  assert.equal((await ex(b.code, b.p, { code_verifier: 'x'.repeat(10) })).body.error, 'invalid_grant', 'verifier curto')
  assert.equal((await ex(b.code, b.p, { client_id: 'fbc_outroCliente1234567' })).body.error, 'invalid_grant')
  assert.equal((await ex(b.code, b.p, { redirect_uri: 'https://chatgpt.com/connector/oauth/outro' })).body.error, 'invalid_grant')
  assert.equal((await ex(b.code, b.p, { resource: 'https://evil.example/api/mcp' })).body.error, 'invalid_target')
  assert.equal((await ex('codigo-que-nao-existe', b.p)).body.error, 'invalid_grant')
  // concorrência: dois pedidos com o mesmo código → só um ganha
  const c = await fresh()
  const [r1, r2] = await Promise.all([ex(c.code, c.p), ex(c.code, c.p)])
  assert.deepEqual([r1.status, r2.status].sort(), [200, 400])
  // expirado
  const d = await fresh()
  await setRow('fourbase_oauth_codes', { client_id: client.client_id }, { expires_at: new Date(Date.now() - 1000).toISOString(), created_at: new Date(Date.now() - 600000).toISOString() })
  assert.equal((await ex(d.code, d.p)).body.error, 'invalid_grant', 'expirado')
  assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'password' } })).body.error, 'unsupported_grant_type')
})

test('fluxo completo: token de acesso e de renovação, resposta no padrão, só hashes no banco', async () => {
  const c = await connect()
  assert.equal(c.token.status, 200)
  assert.match(c.access_token, /^fbo_/)
  assert.match(c.refresh_token, /^fbr_/)
  assert.equal(c.token_type, 'Bearer')
  assert.equal(c.expires_in, 3600)
  assert.equal(c.token.headers.get('cache-control'), 'no-store')
  const row = db().fourbase_api_tokens.find((t) => t.oauth_client_id === c.client.client_id)
  assert.equal(row.kind, 'oauth')
  assert.equal(row.user_id, id.gestorA)
  assert.ok(Math.abs(Date.parse(row.access_expires_at) - Date.now() - 3600000) < 60000)
  assert.ok(!JSON.stringify(db()).includes(c.access_token) && !JSON.stringify(db()).includes(c.refresh_token), 'nada em claro')
  const consent = db().fourbase_assistant_consents.filter((x) => x.user_id === id.gestorA && x.event === 'authorized').at(-1)
  assert.equal(consent.notice_version, NOTICE_VERSION)
  // replay do código: recusado e desliga o que ele gerou
  const replay = await call('POST', '/api/oauth/token', { form: { grant_type: 'authorization_code', code: c.code, client_id: c.client.client_id, redirect_uri: REDIRECT, code_verifier: c.p.verifier } })
  assert.equal(replay.body.error, 'invalid_grant')
  assert.equal((await rpc(c.access_token, 'ping')).status, 401, 'código reaproveitado desliga a conexão')
})

test('MCP: sem token → 401 com o endereço dos metadados; GET/DELETE → 405; origem desconhecida → 403', async () => {
  const r = await call('POST', '/api/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'ping' } })
  assert.equal(r.status, 401)
  assert.equal(r.headers.get('www-authenticate'), `Bearer resource_metadata="${APP}/.well-known/oauth-protected-resource"`)
  assert.equal((await rpc('fbo_' + 'x'.repeat(43), 'ping')).status, 401)
  assert.equal((await call('GET', '/api/mcp')).status, 405)
  assert.equal((await call('DELETE', '/api/mcp')).status, 405)
  const c = await connect()
  const evil = await call('POST', '/api/mcp', { token: c.access_token, headers: { Origin: 'https://evil.example' }, body: { jsonrpc: '2.0', id: 1, method: 'ping' } })
  assert.equal(evil.status, 403)
  const fine = await call('POST', '/api/mcp', { token: c.access_token, headers: { Origin: 'https://chatgpt.com' }, body: { jsonrpc: '2.0', id: 1, method: 'ping' } })
  assert.equal(fine.status, 200)
})

test('MCP: initialize, tools/list (permissões e anotações), notificações e erros de protocolo', async () => {
  const c = await connect()
  const init = (await rpc(c.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt' } })).body.result
  assert.equal(init.protocolVersion, '2025-06-18')
  assert.equal(init.serverInfo.name, 'fourbase')
  assert.ok(init.capabilities.tools)
  assert.match(init.instructions, /Assistente de Agenda do fourbase/)
  assert.equal((await rpc(c.access_token, 'initialize', { protocolVersion: '1999-01-01' })).body.result.protocolVersion, '2025-06-18', 'versão desconhecida → a mais nova')
  const n = await call('POST', '/api/mcp', { token: c.access_token, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })
  assert.equal(n.status, 202)
  const tools = (await rpc(c.access_token, 'tools/list')).body.result.tools
  assert.deepEqual(tools.map((t) => t.name), ['verificar_conexao', 'ver_agenda', 'listar_clientes', 'conferir_tarefas', 'criar_tarefas', 'listar_lotes', 'desfazer_lote'])
  const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]))
  for (const r of ['verificar_conexao', 'ver_agenda', 'listar_clientes', 'conferir_tarefas', 'listar_lotes']) assert.equal(by[r].readOnlyHint, true, r)
  assert.equal(by.criar_tarefas.readOnlyHint, false)
  assert.equal(by.desfazer_lote.destructiveHint, true)
  assert.ok(tools.every((t) => t.inputSchema.type === 'object' && t.securitySchemes[0].type === 'oauth2'))
  assert.equal((await rpc(c.access_token, 'coisa/que/nao/existe')).body.error.code, -32601)
  assert.equal((await rpc(c.access_token, 'tools/call', { name: 'inventada', arguments: {} })).body.error.code, -32602)
  assert.equal((await call('POST', '/api/mcp', { token: c.access_token, body: { nao: 'jsonrpc' } })).body.error.code, -32600)
  const batch = await call('POST', '/api/mcp', { token: c.access_token, body: [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }] })
  assert.deepEqual(batch.body.map((x) => x.id), [1, 2])
})

test('MCP: ferramentas usam as mesmas regras da API (criar, conferir, agenda, desfazer seguro, isolamento)', async () => {
  const c = await connect()
  const t = c.access_token
  const me = (await callTool(t, 'verificar_conexao', {})).structuredContent
  assert.equal(me.workspace_name, 'Empresa A')
  assert.equal(me.timezone, 'America/Sao_Paulo')
  const cli = (await callTool(t, 'listar_clientes', {})).structuredContent.items
  assert.deepEqual(cli.map((x) => x.name), ['Açaí & Cia'])
  const d = day(4)
  // conferir não cria nada; criar pede batch_id; erro de validação vira isError (o modelo lê e conserta)
  const prev = await callTool(t, 'conferir_tarefas', { tasks: [{ title: 'Visita', due_date: d, due_time: '10:00', client_name: 'acai & cia' }] })
  assert.equal(prev.isError, false)
  assert.equal(prev.structuredContent.count, 1)
  assert.equal((await callTool(t, 'ver_agenda', { from: d, to: d })).structuredContent.total, 0)
  const bad = await callTool(t, 'criar_tarefas', { batch_id: 'mcp-lote-0001', tasks: [{ title: '' }] })
  assert.equal(bad.isError, true)
  assert.match(bad.content[0].text, /Há tarefas inválidas/)
  assert.equal((await callTool(t, 'criar_tarefas', { batch_id: 'curto', tasks: [{ title: 'x' }] })).isError, true)
  const made = await callTool(t, 'criar_tarefas', { batch_id: 'mcp-lote-0001', tasks: [{ title: 'Visita', due_date: d, due_time: '10:00' }, { title: 'Proposta', due_date: d }] })
  assert.equal(made.isError, false)
  assert.equal(made.structuredContent.count, 2)
  assert.match(made.structuredContent.tasks[0].link, /^https:\/\/fourbase\.example\/painel\?tarefa=/)
  const tasks = db().fourbase_tasks.filter((x) => ['Visita', 'Proposta'].includes(x.title))
  assert.ok(tasks.every((x) => x.assigned_to === id.gestorA && JSON.stringify(x.tags) === '["ChatGPT"]' && x.column_key === 'todo'))
  const again = await callTool(t, 'criar_tarefas', { batch_id: 'mcp-lote-0001', tasks: [{ title: 'Qualquer' }] })
  assert.equal(again.structuredContent.already_created, true, 'idempotente')
  assert.equal(db().fourbase_tasks.filter((x) => x.title === 'Proposta').length, 1)
  // alguém edita uma das tarefas: o desfazer mantém
  await setRow('fourbase_tasks', { title: 'Proposta' }, { priority: 'Urgente' })
  const lotes = (await callTool(t, 'listar_lotes', {})).structuredContent.batches
  assert.equal(lotes[0].batch_id, 'mcp-lote-0001')
  const un = (await callTool(t, 'desfazer_lote', { batch_id: 'mcp-lote-0001' })).structuredContent
  assert.equal(un.undone, 1)
  assert.deepEqual(un.kept.map((k) => [k.title, k.reason]), [['Proposta', 'edited']])
  assert.equal((await callTool(t, 'desfazer_lote', { batch_id: 'mcp-lote-0001' })).structuredContent.already_undone, true)
  assert.equal((await callTool(t, 'desfazer_lote', { batch_id: 'nao-existe-123' })).isError, true)
  // último uso fica registrado sem conteúdo
  await new Promise((r) => setTimeout(r, 80))
  const row = db().fourbase_api_tokens.find((x) => x.oauth_client_id === c.client.client_id && !x.revoked_at)
  assert.ok(row.last_used_at)
  assert.equal(row.last_activity.op, 'desfazerLote')
  assert.ok(!JSON.stringify(row.last_activity).includes('Visita'))
  // outra empresa não enxerga nada disso
  const b = await connect('gestorB')
  assert.equal((await callTool(b.access_token, 'ver_agenda', { from: d, to: d })).structuredContent.total, 0)
  assert.equal((await callTool(b.access_token, 'desfazer_lote', { batch_id: 'mcp-lote-0001' })).isError, true)
  assert.deepEqual((await callTool(b.access_token, 'listar_clientes', {})).structuredContent.items, [])
})

test('renovação: rotação do token (o antigo morre), concorrência, cliente certo, conexão desligada', async () => {
  const c = await connect()
  const rf = (refresh_token, client_id = c.client.client_id) => call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token', refresh_token, client_id } })
  const r1 = await rf(c.refresh_token)
  assert.equal(r1.status, 200)
  assert.notEqual(r1.body.access_token, c.access_token)
  assert.notEqual(r1.body.refresh_token, c.refresh_token)
  assert.equal((await rpc(c.access_token, 'ping')).status, 401, 'o token de acesso antigo deixou de valer')
  assert.equal((await rpc(r1.body.access_token, 'ping')).status, 200)
  assert.equal((await rf(c.refresh_token)).body.error, 'invalid_grant', 'o token de renovação antigo não vale mais')
  assert.equal((await rf(r1.body.refresh_token, 'fbc_outroCliente1234567')).body.error, 'invalid_grant', 'outro aplicativo')
  assert.equal((await rf('fbr_naoexiste')).body.error, 'invalid_grant')
  assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token' } })).body.error, 'invalid_request')
  // duas renovações ao mesmo tempo: só uma vence
  const [x, y] = await Promise.all([rf(r1.body.refresh_token), rf(r1.body.refresh_token)])
  assert.deepEqual([x.status, y.status].sort(), [200, 400])
  // access token expirado: 401 (e a renovação emite outro)
  const live = db().fourbase_api_tokens.find((t) => t.oauth_client_id === c.client.client_id && !t.revoked_at)
  await setRow('fourbase_api_tokens', { id: live.id }, { access_expires_at: new Date(Date.now() - 1000).toISOString() })
  const expired = [x, y].find((r) => r.status === 200).body.access_token
  assert.equal((await rpc(expired, 'ping')).status, 401, 'token de acesso expirado')
  // conexão expirada (refresh)
  const c2 = await connect()
  const row = db().fourbase_api_tokens.find((t) => t.oauth_client_id === c2.client.client_id && !t.revoked_at)
  await setRow('fourbase_api_tokens', { id: row.id }, { refresh_expires_at: new Date(Date.now() - 1000).toISOString() })
  assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: c2.refresh_token, client_id: c2.client.client_id } })).body.error, 'invalid_grant')
})

test('desligar a conexão na tela corta o ChatGPT na hora; reconectar desliga a anterior', async () => {
  const c = await connect()
  const list = (await call('GET', '/api/assistant/tokens', { token: jwt.gestorA })).body.tokens
  const conn = list.find((t) => t.kind === 'oauth' && !t.revoked_at)
  assert.ok(conn)
  assert.equal(conn.token, undefined)
  assert.equal((await rpc(c.access_token, 'ping')).status, 200)
  assert.equal((await call('DELETE', `/api/assistant/tokens/${conn.id}`, { token: jwt.gestorA })).status, 204)
  assert.equal((await rpc(c.access_token, 'ping')).status, 401)
  assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client.client_id } })).body.error, 'invalid_grant')
  // reconectar com o mesmo aplicativo: só a mais nova vale
  const client = await registerClient()
  const first = await connect('gestorA', { client })
  const second = await connect('gestorA', { client })
  assert.equal((await rpc(first.access_token, 'ping')).status, 401)
  assert.equal((await rpc(second.access_token, 'ping')).status, 200)
  const ev = db().fourbase_assistant_consents.filter((e) => e.event === 'disconnected').map((e) => e.reason)
  assert.ok(ev.includes('user') && ev.includes('replaced'))
})

test('gestor rebaixado/desativado ou fora da liberação: tokens e renovação param de valer', async () => {
  const c = await connect('gestorB')
  assert.equal((await rpc(c.access_token, 'ping')).status, 200)
  await setRow('fourbase_users', { id: id.gestorB }, { role: 'funcionario' })
  assert.equal((await rpc(c.access_token, 'ping')).status, 401, 'rebaixado')
  assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client.client_id } })).body.error, 'invalid_grant')
  await setRow('fourbase_users', { id: id.gestorB }, { role: 'gestor' })
  const saved = process.env.ASSISTANT_WORKSPACE_IDS
  process.env.ASSISTANT_WORKSPACE_IDS = wsA
  try {
    assert.equal((await call('POST', '/api/oauth/authorize', { token: jwt.gestorB, body: { client_id: 'x', redirect_uri: REDIRECT, decision: 'allow', notice_version: NOTICE_VERSION } })).status, 403, 'empresa não liberada não autoriza')
  } finally { process.env.ASSISTANT_WORKSPACE_IDS = saved }
})

test('interruptor geral: ASSISTANT_ENABLED=false desliga descoberta, login e MCP', async () => {
  const c = await connect()
  process.env.ASSISTANT_ENABLED = 'false'
  try {
    assert.equal((await rpc(c.access_token, 'ping')).status, 503)
    assert.equal((await call('GET', '/.well-known/oauth-authorization-server')).status, 503)
    assert.equal((await call('POST', '/api/oauth/register', { body: { redirect_uris: [REDIRECT] } })).status, 503)
    assert.equal((await call('POST', '/api/oauth/token', { form: { grant_type: 'refresh_token' } })).status, 503)
  } finally { delete process.env.ASSISTANT_ENABLED }
  assert.equal((await rpc(c.access_token, 'ping')).status, 200)
})

test('a chave pessoal (fbk_) continua valendo na API REST e não abre o MCP por engano', async () => {
  const k = (await call('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: { notice_version: NOTICE_VERSION } })).body
  assert.match(k.token, /^fbk_/)
  assert.equal((await call('GET', '/api/assistant/me', { token: k.token })).status, 200)
  // fbk_ também é aceita pela porta MCP (mesma autenticação): é uma conexão válida do mesmo dono
  assert.equal((await rpc(k.token, 'ping')).status, 200)
  // um token fbo_ forjado com o hash de uma chave fbk_ não passa (prefixo e tipo têm de combinar)
  assert.equal((await rpc('fbo_' + k.token.slice(4), 'ping')).status, 401)
})
