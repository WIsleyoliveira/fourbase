// Preferência de e-mail de notificação (notify_email) no perfil.
//
// Sobe a API com o banco local mockado apontado para um arquivo temporário com
// um workspace e um usuário "antigo" (sem a coluna notify_email) e verifica o
// default, a gravação via PATCH /api/profile e a coerção para booleano.
//
// Rodar: npm test

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
const userId = randomUUID()

const fixture = {
  weflow_workspaces: [
    { id: ws, name: 'Empresa A', created_by: userId, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  // Sem notify_email de propósito: simula usuário criado antes da migration
  fourbase_users: [{
    id: userId, workspace_id: ws, email: 'gestor@a.test', role: 'gestor',
    name: 'Gestor A', password_hash: bcrypt.hashSync(PASSWORD, 4),
    status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
  }],
  fourbase_tasks: [],
  fourbase_notes: [],
  fourbase_todos: [],
  fourbase_media: [],
  fourbase_folders: [],
  fourbase_folder_media: [],
  fourbase_columns: [],
  fourbase_clients: [],
  fourbase_report_activities: [],
  fourbase_tags: [],
}

let server
let base
let token

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-test-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`

  const r = await call('POST', '/api/auth/login', { email: 'gestor@a.test', password: PASSWORD })
  assert.equal(r.status, 200, 'login')
  token = r.body.token
})

after(() => server?.close())

test('usuário antigo sem notify_email aparece como true em /api/auth/me', async () => {
  const r = await call('GET', '/api/auth/me')
  assert.equal(r.status, 200)
  assert.equal(r.body.notify_email, true)
})

test('PATCH /api/profile { notify_email: false } devolve user.notify_email false e persiste', async () => {
  const r = await call('PATCH', '/api/profile', { notify_email: false })
  assert.equal(r.status, 200)
  assert.equal(r.body.user.notify_email, false)

  const me = await call('GET', '/api/auth/me')
  assert.equal(me.body.notify_email, false)
})

test('notify_email não-booleano vira Boolean()', async () => {
  const on = await call('PATCH', '/api/profile', { notify_email: 'sim' })
  assert.equal(on.body.user.notify_email, true)

  const off = await call('PATCH', '/api/profile', { notify_email: 0 })
  assert.equal(off.body.user.notify_email, false)
})
