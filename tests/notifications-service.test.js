// Serviço de notificações de tarefa (menção/atribuição) integrado às rotas.
//
// Esqueleto de workspace-isolation.test.js: API sobre o banco local mockado
// (arquivo temporário), login real e import('../api/index.js'). O envio de
// e-mail é falso (sendMail injetado) e o "segundo plano" é um coletor, para os
// asserts de envio/throttle serem determinísticos.
//
// Rodar: npm test

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const APP_URL = 'https://app.fourbase.test'
const originalAppUrl = process.env.APP_URL

const wsA = randomUUID()
const ids = {
  gestorA: randomUUID(),
  funcA: randomUUID(),
  funcOff: randomUUID(),
  funcInativo: randomUUID(),
  funcSemEmail: randomUUID(),
  funcOutro: randomUUID(),
}

const user = (id, email, role, extra = {}) => ({
  id, workspace_id: wsA, email, role,
  name: email || 'sem-email', password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
  ...extra,
})

const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'Empresa A', created_by: ids.gestorA, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [
    user(ids.gestorA, 'gestor@a.test', 'gestor'),
    // sem a coluna notify_email: conta como ligado
    user(ids.funcA, 'func@a.test', 'funcionario'),
    user(ids.funcOff, 'off@a.test', 'funcionario', { notify_email: false }),
    user(ids.funcInativo, 'inativo@a.test', 'funcionario', { status: 'inactive' }),
    user(ids.funcSemEmail, null, 'funcionario'),
    user(ids.funcOutro, 'outro@a.test', 'funcionario'),
  ],
  fourbase_tasks: [],
  fourbase_notes: [],
  fourbase_todos: [],
  fourbase_media: [],
  fourbase_folders: [],
  fourbase_folder_media: [],
  fourbase_columns: ['todo', 'doing', 'done'].map((key, position) => ({
    id: randomUUID(), workspace_id: wsA, key, label: key, position, color: '#999999', created_at: now,
  })),
  fourbase_clients: [],
  fourbase_report_activities: [],
  fourbase_tags: [],
  fourbase_notifications: [],
}

let server
let base
let supabase
let setNotificationDeps
let resetNotificationDeps
const tokens = {}

// Estado dos falsos, recriado a cada teste
let mails
let pending
let clock

const call = async (who, method, url, body, extraHeaders = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

// Espera os envios em "segundo plano" coletados pelo runInBackground falso
const flush = async () => {
  const list = pending.splice(0)
  await Promise.all(list)
}

const notifsOf = async (userId, taskId) => {
  const { data } = await supabase.from('fourbase_notifications').select('*').eq('user_id', userId)
  return (data || []).filter((n) => !taskId || n.task_id === taskId)
}
const allNotifs = async () => (await supabase.from('fourbase_notifications').select('*')).data

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-notif-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  ;({ supabase } = await import('../api/_lib/supabase.js'))
  ;({ setNotificationDeps, resetNotificationDeps } = await import('../api/_lib/notifications.js'))
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`

  for (const [who, email] of [['gestorA', 'gestor@a.test'], ['funcA', 'func@a.test'], ['funcOutro', 'outro@a.test']]) {
    const r = await call(null, 'POST', '/api/auth/login', { email, password: PASSWORD })
    assert.equal(r.status, 200, `login de ${email}`)
    tokens[who] = r.body.token
  }
})

after(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL
  else process.env.APP_URL = originalAppUrl
  resetNotificationDeps?.()
  server?.close()
})

beforeEach(async () => {
  // Os e-mails usam só APP_URL; cada teste parte dele definido
  process.env.APP_URL = APP_URL
  mails = []
  pending = []
  clock = new Date()
  setNotificationDeps({
    sendMail: async (msg) => { mails.push(msg); return true },
    runInBackground: (p) => { pending.push(Promise.resolve(p)) },
    now: () => clock,
  })
  // banco de notificações limpo entre testes
  const { data } = await supabase.from('fourbase_notifications').select('id')
  for (const n of data || []) await supabase.from('fourbase_notifications').delete().eq('id', n.id)
})

test('POST /api/tasks com mentioned_users cria aviso mention só para o mencionado (não para o autor)', async () => {
  const r = await call('gestorA', 'POST', '/api/tasks', {
    title: 'Revisar proposta', mentioned_users: [ids.funcA, ids.gestorA],
  })
  assert.equal(r.status, 201)
  await flush()

  const doFunc = await notifsOf(ids.funcA)
  assert.equal(doFunc.length, 1)
  assert.equal(doFunc[0].kind, 'mention')
  assert.equal(doFunc[0].task_id, r.body.id)
  assert.equal(doFunc[0].title, 'Revisar proposta')
  assert.equal(doFunc[0].actor_id, ids.gestorA)
  assert.equal(doFunc[0].workspace_id, wsA)
  assert.equal((await notifsOf(ids.gestorA)).length, 0)
  assert.equal((await allNotifs()).length, 1)
})

test('PATCH adicionando uma menção notifica só a nova; reeditar o título não duplica', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Tarefa', mentioned_users: [ids.funcA] })
  assert.equal(c.status, 201)
  const taskId = c.body.id
  await flush()
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 1)

  const p1 = await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { mentioned_users: [ids.funcA, ids.funcOutro] })
  assert.equal(p1.status, 200)
  await flush()
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 1, 'quem já era mencionado não ganha outro aviso')
  const novo = await notifsOf(ids.funcOutro, taskId)
  assert.equal(novo.length, 1)
  assert.equal(novo[0].kind, 'mention')

  const p2 = await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, {
    title: 'Tarefa renomeada', mentioned_users: [ids.funcA, ids.funcOutro],
  })
  assert.equal(p2.status, 200)
  await flush()
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 1)
  assert.equal((await notifsOf(ids.funcOutro, taskId)).length, 1)
})

test('PATCH trocando o responsável cria assignment para o novo', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Distribuir', assigned_to: ids.funcA })
  assert.equal(c.status, 201)
  const taskId = c.body.id
  await flush()
  const naCriacao = await notifsOf(ids.funcA, taskId)
  assert.equal(naCriacao.length, 1)
  assert.equal(naCriacao[0].kind, 'assignment')

  const p = await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { assigned_to: ids.funcOutro })
  assert.equal(p.status, 200)
  await flush()
  const novo = await notifsOf(ids.funcOutro, taskId)
  assert.equal(novo.length, 1)
  assert.equal(novo[0].kind, 'assignment')
  assert.equal(novo[0].actor_id, ids.gestorA)
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 1, 'o responsável anterior não é avisado de novo')
})

test('e-mail: enviado para menção/atribuição com notify_email true; não enviado com false, inativo ou sem e-mail', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', {
    title: 'Campanha <b>X</b>',
    assigned_to: ids.funcOutro,
    mentioned_users: [ids.funcA, ids.funcOff, ids.funcInativo, ids.funcSemEmail],
  })
  assert.equal(c.status, 201)
  await flush()

  const destinos = mails.map((m) => m.to).sort()
  assert.deepEqual(destinos, ['func@a.test', 'outro@a.test'])

  const mencao = mails.find((m) => m.to === 'func@a.test')
  assert.match(mencao.subject, /mencionou você/)
  assert.ok(mencao.text.includes(`${APP_URL}/painel?tarefa=${c.body.id}`), 'link montado com APP_URL')
  const atribuicao = mails.find((m) => m.to === 'outro@a.test')
  assert.match(atribuicao.subject, /atribuiu a você/)

  // O sino é criado para quem tem conta ativa, mesmo sem e-mail ou com e-mail desligado
  assert.equal((await notifsOf(ids.funcOff)).length, 1)
  assert.equal((await notifsOf(ids.funcSemEmail)).length, 1)
  // Inativo não recebe nada
  assert.equal((await notifsOf(ids.funcInativo)).length, 0)
})

test('e-mail: segundo evento igual (mesma pessoa, tarefa, tipo) em < 10 min não reenvia, mas o aviso do sino é criado', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Repetida', mentioned_users: [ids.funcA] })
  assert.equal(c.status, 201)
  const taskId = c.body.id
  await flush()
  assert.equal(mails.length, 1)

  // remove e menciona de novo dentro da janela de 10 min
  await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { mentioned_users: [] })
  clock = new Date(clock.getTime() + 5 * 60 * 1000)
  const p = await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { mentioned_users: [ids.funcA] })
  assert.equal(p.status, 200)
  await flush()

  assert.equal(mails.length, 1, 'não reenviou dentro de 10 min')
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 2, 'o aviso do sino foi criado mesmo assim')

  // depois da janela volta a enviar
  await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { mentioned_users: [] })
  clock = new Date(clock.getTime() + 11 * 60 * 1000)
  await call('gestorA', 'PATCH', `/api/tasks/${taskId}`, { mentioned_users: [ids.funcA] })
  await flush()
  assert.equal(mails.length, 2)
  assert.equal((await notifsOf(ids.funcA, taskId)).length, 3)
})

test('falha do emissor (sendMail que lança) não impede o POST/PATCH nem muda o status 2xx', async () => {
  setNotificationDeps({
    sendMail: async () => { throw new Error('smtp caiu') },
    runInBackground: (p) => { pending.push(Promise.resolve(p)) },
    now: () => clock,
  })
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Com falha', mentioned_users: [ids.funcA] })
  assert.equal(c.status, 201)
  const p = await call('gestorA', 'PATCH', `/api/tasks/${c.body.id}`, { mentioned_users: [ids.funcA, ids.funcOutro] })
  assert.equal(p.status, 200)
  await flush()
  // o aviso do sino continua sendo gravado
  assert.equal((await notifsOf(ids.funcOutro, c.body.id)).length, 1)

  // e um runInBackground que lança de forma síncrona também não derruba a rota
  setNotificationDeps({
    sendMail: async () => true,
    runInBackground: () => { throw new Error('boom') },
    now: () => clock,
  })
  const c2 = await call('gestorA', 'POST', '/api/tasks', { title: 'Outra', mentioned_users: [ids.funcA] })
  assert.equal(c2.status, 201)
})

test('PATCH sem assigned_to/mentioned_users no corpo não lê a tarefa antes nem emite', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Simples', mentioned_users: [ids.funcA] })
  assert.equal(c.status, 201)
  await flush()
  const antes = (await allNotifs()).length
  const mailsAntes = mails.length

  const tables = []
  const original = supabase.from
  supabase.from = function (table) { tables.push(table); return original.call(this, table) }
  let p
  try {
    p = await call('gestorA', 'PATCH', `/api/tasks/${c.body.id}`, { title: 'Só o título' })
  } finally {
    supabase.from = original
  }
  assert.equal(p.status, 200)
  await flush()

  // só o update da própria tarefa: nada de leitura prévia, usuários ou notificações
  assert.deepEqual(tables, ['fourbase_tasks'])
  assert.equal((await allNotifs()).length, antes)
  assert.equal(mails.length, mailsAntes)
})

test('PATCH que falha na autorização (funcionário em tarefa de outro) não emite nada', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Do outro', assigned_to: ids.funcA })
  assert.equal(c.status, 201)
  await flush()
  const antes = (await allNotifs()).length

  const p = await call('funcOutro', 'PATCH', `/api/tasks/${c.body.id}`, { mentioned_users: [ids.funcOutro, ids.gestorA] })
  assert.notEqual(p.status, 200)
  await flush()
  assert.equal((await allNotifs()).length, antes)
})

test('funcionário que se auto-atribui/menciona outros gera aviso com o nome do autor no e-mail', async () => {
  const c = await call('funcA', 'POST', '/api/tasks', { title: 'Da func', mentioned_users: [ids.gestorA] })
  assert.equal(c.status, 201)
  await flush()
  assert.equal(mails.length, 1)
  assert.equal(mails[0].to, 'gestor@a.test')
  assert.match(mails[0].subject, /func@a\.test mencionou você/)
})

test('e-mail: com APP_URL definido, o link do corpo começa com APP_URL', async () => {
  const c = await call('gestorA', 'POST', '/api/tasks', { title: 'Link', mentioned_users: [ids.funcA] })
  assert.equal(c.status, 201)
  await flush()
  assert.equal(mails.length, 1)
  assert.ok(mails[0].text.includes(`${APP_URL}/painel?tarefa=${c.body.id}`))
  assert.ok(!mails[0].text.includes(base), 'não usa o host da requisição')
})

test('e-mail: Origin forjado na requisição é ignorado, o link vem sempre de APP_URL', async () => {
  const c = await call('funcA', 'POST', '/api/tasks',
    { title: 'Phishing?', mentioned_users: [ids.gestorA] },
    { Origin: 'https://evil.example' })
  assert.equal(c.status, 201)
  const p = await call('funcA', 'PATCH', `/api/tasks/${c.body.id}`,
    { mentioned_users: [ids.gestorA, ids.funcOutro] },
    { Origin: 'https://evil.example' })
  assert.equal(p.status, 200)
  await flush()
  assert.equal(mails.length, 2)
  for (const m of mails) {
    assert.ok(m.text.includes(`${APP_URL}/painel?tarefa=${c.body.id}`))
    assert.ok(!m.text.includes('evil.example'), 'o Origin forjado nunca aparece no e-mail')
  }
})

test('e-mail: sem APP_URL (mesmo com Origin forjado) não envia e-mail, mas cria o aviso do sino sem erro', async () => {
  delete process.env.APP_URL
  const c = await call('funcA', 'POST', '/api/tasks',
    { title: 'Sem APP_URL', mentioned_users: [ids.gestorA] },
    { Origin: 'https://evil.example' })
  assert.equal(c.status, 201)
  await flush()
  assert.equal(mails.length, 0)
  const doGestor = await notifsOf(ids.gestorA, c.body.id)
  assert.equal(doGestor.length, 1)
  assert.equal(doGestor[0].kind, 'mention')
})
