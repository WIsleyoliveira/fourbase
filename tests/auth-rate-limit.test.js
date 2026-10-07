// Limitador de tentativas nas rotas de credencial (POST /api/auth/login).
//
// O estado do express-rate-limit é por processo (e por IP), então este teste
// fica num arquivo próprio: o node:test roda cada arquivo em um processo
// separado e as chamadas deste arquivo não consomem o limite dos outros.
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
    { id: ws, name: 'Empresa Limite', created_by: userId, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [{
    id: userId, workspace_id: ws, email: 'gestor@limite.test', role: 'gestor',
    name: 'Gestor Limite', password_hash: bcrypt.hashSync(PASSWORD, 4),
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
  fourbase_notifications: [],
}

let server
let base

const login = async (email, password) => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-ratelimit-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server?.close())

test('login: logins bem-sucedidos não gastam o limite; 20 falhas passam como 401 e a 21ª é bloqueada com 429', async () => {
  // Vários logins legítimos antes (um escritório atrás do mesmo IP): não contam
  for (let i = 0; i < 25; i += 1) {
    const ok = await login('gestor@limite.test', PASSWORD)
    assert.equal(ok.status, 200, `login válido #${i + 1}`)
  }

  // 20 tentativas erradas ainda recebem a resposta normal de credencial inválida
  for (let i = 0; i < 20; i += 1) {
    const bad = await login('gestor@limite.test', 'senha-errada')
    assert.equal(bad.status, 401, `falha #${i + 1}`)
  }

  // A 21ª falha é barrada pelo limitador
  const blocked = await login('gestor@limite.test', 'senha-errada')
  assert.equal(blocked.status, 429)
  assert.match(blocked.body.error, /Muitas tentativas/)

  // Enquanto o limite estiver estourado, até a senha certa é barrada
  const certo = await login('gestor@limite.test', PASSWORD)
  assert.equal(certo.status, 429)
})
