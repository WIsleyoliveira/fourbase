// Anexos de tarefa: o servidor só guarda endereços http(s) (um "javascript:" gravado por um
// funcionário viraria um link que roda código quando o gestor clicasse em "abrir").
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const ws = randomUUID()
const id = { gestor: randomUUID(), func: randomUUID() }
const user = (uid, email, role) => ({
  id: uid, workspace_id: ws, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const fixture = {
  weflow_workspaces: [{ id: ws, name: 'A', created_by: id.gestor, created_at: now, updated_at: now }],
  weflow_invitations: [],
  fourbase_users: [user(id.gestor, 'g@a.test', 'gestor'), user(id.func, 'f@a.test', 'funcionario')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [], fourbase_clients: [], fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
}

let server, base
const tokens = {}
const call = async (who, method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-att-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  for (const [who, email] of [['gestor', 'g@a.test'], ['func', 'f@a.test']]) {
    const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
    tokens[who] = (await res.json()).token
  }
})
after(() => server?.close())

const OK = 'https://x.supabase.co/storage/v1/object/public/b/tasks/t/1-a/Relatorio.pdf'
const ATAQUE = ['javascript:alert(document.domain)', 'JAVASCRIPT:alert(1)', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'vbscript:x', '//evil/a', '/relativo', '', 42, null, { url: 'javascript:alert(1)' }]

test('criar tarefa: só os anexos http(s) ficam; o restante é descartado em silêncio', async () => {
  const r = await call('func', 'POST', '/api/tasks', { title: 'Com ataque', attachments: [...ATAQUE, OK, { url: 'http://ok.example/a.png' }] })
  assert.equal(r.status, 201)
  assert.deepEqual(r.body.attachments, [OK, { url: 'http://ok.example/a.png' }])
})

test('editar tarefa: gravar só anexos maliciosos deixa a lista vazia; não-lista também', async () => {
  const t = await call('func', 'POST', '/api/tasks', { title: 'Para editar', attachments: [OK] })
  assert.deepEqual(t.body.attachments, [OK])
  const a = await call('func', 'PATCH', `/api/tasks/${t.body.id}`, { attachments: ATAQUE })
  assert.equal(a.status, 200)
  assert.deepEqual(a.body.attachments, [])
  const b = await call('func', 'PATCH', `/api/tasks/${t.body.id}`, { attachments: 'javascript:alert(1)' })
  assert.deepEqual(b.body.attachments, [])
  const c = await call('func', 'PATCH', `/api/tasks/${t.body.id}`, { attachments: [OK] })
  assert.deepEqual(c.body.attachments, [OK])
})

test('limites: URL enorme é descartada e no máximo 50 anexos', async () => {
  const gigante = 'https://x.example/' + 'a'.repeat(2100)
  const muitos = Array.from({ length: 60 }, (_, i) => `https://x.example/f${i}.pdf`)
  const r = await call('gestor', 'POST', '/api/tasks', { title: 'Limites', attachments: [gigante, ...muitos] })
  assert.equal(r.body.attachments.length, 50)
  assert.ok(!r.body.attachments.includes(gigante))
})
