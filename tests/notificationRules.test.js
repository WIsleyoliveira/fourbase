import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diffTaskNotifications,
  dueNotifications,
  addDays,
  resolveToday,
  canViewTask,
} from '../api/_lib/notificationRules.js'

const ativos = new Set(['autor', 'a', 'b', 'c'])

const tarefa = (extra = {}) => ({
  id: 't1',
  title: 'Tarefa',
  column_key: 'todo',
  due_date: null,
  due_date_end: null,
  assigned_to: null,
  mentioned_users: [],
  client_id: null,
  ...extra,
})

test('criar: responsável diferente do autor recebe assignment', () => {
  const r = diffTaskNotifications(null, tarefa({ assigned_to: 'a' }), 'autor', ativos)
  assert.deepEqual(r, [{ user_id: 'a', kind: 'assignment' }])
})

test('autor atribuindo a si mesmo não gera nada', () => {
  const r = diffTaskNotifications(null, tarefa({ assigned_to: 'autor' }), 'autor', ativos)
  assert.deepEqual(r, [])
})

test('criar: cada mencionado ≠ autor recebe mention', () => {
  const r = diffTaskNotifications(
    null,
    tarefa({ mentioned_users: ['a', 'autor', 'b'] }),
    'autor',
    ativos,
  )
  assert.deepEqual(r, [
    { user_id: 'a', kind: 'mention' },
    { user_id: 'b', kind: 'mention' },
  ])
})

test('editar: só a menção nova gera aviso', () => {
  const r = diffTaskNotifications(
    tarefa({ mentioned_users: ['a'] }),
    tarefa({ mentioned_users: ['a', 'b'] }),
    'autor',
    ativos,
  )
  assert.deepEqual(r, [{ user_id: 'b', kind: 'mention' }])
})

test('editar sem mudar responsável nem menções não gera nada', () => {
  const antes = tarefa({ assigned_to: 'a', mentioned_users: ['b'] })
  const depois = tarefa({ assigned_to: 'a', mentioned_users: ['b'], title: 'Outro título' })
  assert.deepEqual(diffTaskNotifications(antes, depois, 'autor', ativos), [])
})

test('mesma pessoa responsável e mencionada recebe só assignment', () => {
  const r = diffTaskNotifications(
    null,
    tarefa({ assigned_to: 'a', mentioned_users: ['a', 'b'] }),
    'autor',
    ativos,
  )
  assert.deepEqual(r, [
    { user_id: 'a', kind: 'assignment' },
    { user_id: 'b', kind: 'mention' },
  ])
})

test('destinatário fora de activeMemberIds é ignorado', () => {
  const r = diffTaskNotifications(
    null,
    tarefa({ assigned_to: 'x', mentioned_users: ['y', 'a'] }),
    'autor',
    ativos,
  )
  assert.deepEqual(r, [{ user_id: 'a', kind: 'mention' }])
})

test('mentioned_users ausente é tratado como lista vazia', () => {
  const antes = { id: 't1', assigned_to: null }
  const depois = { id: 't1', assigned_to: 'a' }
  assert.deepEqual(diffTaskNotifications(antes, depois, 'autor', ativos), [
    { user_id: 'a', kind: 'assignment' },
  ])
  assert.deepEqual(diffTaskNotifications(null, { id: 't1' }, 'autor', ativos), [])
})

test('addDays soma e subtrai dias atravessando mês e ano', () => {
  assert.equal(addDays('2026-10-03', 1), '2026-10-04')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2024-03-01', -1), '2024-02-29')
  assert.equal(addDays('2026-10-03', -7), '2026-09-26')
})

const hoje = '2026-10-03'

test('dueNotifications: vence hoje e amanhã → due_soon; ontem → overdue; há 8 dias → nada; há 7 dias → overdue', () => {
  const r = dueNotifications(
    [
      tarefa({ id: 'h', due_date: '2026-10-03' }),
      tarefa({ id: 'am', due_date: '2026-10-04' }),
      tarefa({ id: 'dep', due_date: '2026-10-05' }),
      tarefa({ id: 'o', due_date: '2026-10-02' }),
      tarefa({ id: 'o8', due_date: '2026-09-25' }),
      tarefa({ id: 'o7', due_date: '2026-09-26' }),
    ],
    hoje,
  )
  assert.deepEqual(
    r.map((n) => [n.task_id, n.kind]),
    [
      ['h', 'due_soon'],
      ['am', 'due_soon'],
      ['o', 'overdue'],
      ['o7', 'overdue'],
    ],
  )
})

test('dueNotifications: coluna done e sem prazo não geram; due_date_end tem prioridade sobre due_date', () => {
  const r = dueNotifications(
    [
      tarefa({ id: 'feita', column_key: 'done', due_date: '2026-10-03' }),
      tarefa({ id: 'sem' }),
      tarefa({ id: 'fim', due_date: '2026-10-01', due_date_end: '2026-10-04', title: 'Com fim' }),
    ],
    hoje,
  )
  assert.equal(r.length, 1)
  assert.equal(r[0].task_id, 'fim')
  assert.equal(r[0].title, 'Com fim')
  assert.equal(r[0].kind, 'due_soon')
  assert.equal(r[0].due_date, '2026-10-04')
})

test('dedupe_key contém a data e muda com o prazo', () => {
  const [a] = dueNotifications([tarefa({ due_date: '2026-10-04' })], hoje)
  assert.equal(a.dedupe_key, 'due_soon:t1:2026-10-04')
  const [b] = dueNotifications([tarefa({ due_date: '2026-10-03' })], hoje)
  assert.equal(b.dedupe_key, 'due_soon:t1:2026-10-03')
  assert.notEqual(a.dedupe_key, b.dedupe_key)
  const [c] = dueNotifications([tarefa({ due_date: '2026-10-02' })], hoje)
  assert.equal(c.dedupe_key, 'overdue:t1:2026-10-02')
})

test('dueNotifications ignora datas inválidas', () => {
  assert.deepEqual(dueNotifications([tarefa({ due_date: '2026-02-30' })], hoje), [])
  assert.deepEqual(dueNotifications([tarefa({ due_date: 'abc' })], hoje), [])
})

test("resolveToday aceita hoje±1 e rejeita 'abc', '9999-99-99', '1970-01-01', undefined → data do servidor", () => {
  const now = new Date(Date.UTC(2026, 9, 3, 15, 30))
  assert.equal(resolveToday('2026-10-03', now), '2026-10-03')
  assert.equal(resolveToday('2026-10-02', now), '2026-10-02')
  assert.equal(resolveToday('2026-10-04', now), '2026-10-04')
  assert.equal(resolveToday('2026-10-05', now), '2026-10-03')
  assert.equal(resolveToday('2026-10-01', now), '2026-10-03')
  assert.equal(resolveToday('abc', now), '2026-10-03')
  assert.equal(resolveToday('9999-99-99', now), '2026-10-03')
  assert.equal(resolveToday('2026-02-30', now), '2026-10-03')
  assert.equal(resolveToday('1970-01-01', now), '2026-10-03')
  assert.equal(resolveToday(undefined, now), '2026-10-03')
})

test('resolveToday usa a data UTC do servidor e funciona sem now', () => {
  const now = new Date(Date.UTC(2026, 11, 31, 23, 59))
  assert.equal(resolveToday(undefined, now), '2026-12-31')
  assert.equal(resolveToday('2027-01-01', now), '2027-01-01')
  assert.match(resolveToday(undefined), /^\d{4}-\d{2}-\d{2}$/)
})

test('canViewTask: responsável, mencionado e gestor sim; outro membro só se client_id; outro membro sem client_id não', () => {
  const t = tarefa({ assigned_to: 'a', mentioned_users: ['b'] })
  assert.equal(canViewTask(t, { id: 'a', role: 'funcionario' }), true)
  assert.equal(canViewTask(t, { id: 'b', role: 'funcionario' }), true)
  assert.equal(canViewTask(t, { id: 'g', role: 'gestor' }), true)
  assert.equal(canViewTask(t, { id: 'c', role: 'funcionario' }), false)
  assert.equal(canViewTask({ ...t, client_id: 'cli1' }, { id: 'c', role: 'funcionario' }), true)
  assert.equal(
    canViewTask({ id: 't2', assigned_to: 'a' }, { id: 'c', role: 'funcionario' }),
    false,
  )
})
