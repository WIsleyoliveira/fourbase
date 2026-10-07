import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationText, relativeTime, localToday } from '../src/notificationText.js'

const members = [{ id: 'u1', name: 'Maria' }, { id: 'u2', name: 'João' }]
const row = (over = {}) => ({
  id: 'n1', kind: 'mention', task_id: 't1', actor_id: 'u1', title: 'Título',
  meta: {}, read_at: null, created_at: '2026-10-03T12:00:00.000Z', ...over,
})
const TODAY = '2026-10-03'

test('notificationText: menção e atribuição citam o autor', () => {
  assert.equal(notificationText(row(), members, TODAY), 'Maria mencionou você em “Título”')
  assert.equal(
    notificationText(row({ kind: 'assignment', actor_id: 'u2' }), members, TODAY),
    'João atribuiu a você “Título”',
  )
})

test('notificationText: autor desconhecido vira Alguém', () => {
  assert.equal(notificationText(row({ actor_id: 'zzz' }), members, TODAY), 'Alguém mencionou você em “Título”')
  assert.equal(notificationText(row({ actor_id: null, kind: 'assignment' }), members, TODAY), 'Alguém atribuiu a você “Título”')
  assert.equal(notificationText(row(), undefined, TODAY), 'Alguém mencionou você em “Título”')
})

test('notificationText: prazo hoje e amanhã', () => {
  assert.equal(
    notificationText(row({ kind: 'due_soon', meta: { due_date: '2026-10-03' } }), members, TODAY),
    '“Título” vence hoje',
  )
  assert.equal(
    notificationText(row({ kind: 'due_soon', meta: { due_date: '2026-10-04' } }), members, TODAY),
    '“Título” vence amanhã',
  )
  // virada de mês e de ano
  assert.equal(
    notificationText(row({ kind: 'due_soon', meta: { due_date: '2027-01-01' } }), members, '2026-12-31'),
    '“Título” vence amanhã',
  )
})

test('notificationText: atrasada há N dias (singular em 1 dia)', () => {
  assert.equal(
    notificationText(row({ kind: 'overdue', meta: { due_date: '2026-09-30' } }), members, TODAY),
    '“Título” está atrasada há 3 dias',
  )
  assert.equal(
    notificationText(row({ kind: 'overdue', meta: { due_date: '2026-10-02' } }), members, TODAY),
    '“Título” está atrasada há 1 dia',
  )
  assert.equal(
    notificationText(row({ kind: 'overdue', meta: { due_date: '2026-02-28' } }), members, '2026-03-02'),
    '“Título” está atrasada há 2 dias',
  )
})

test('notificationText: quebras de linha e espaços do título viram um espaço', () => {
  assert.equal(
    notificationText(row({ title: '  Linha 1\n\n  Linha\t2\r\n' }), members, TODAY),
    'Maria mencionou você em “Linha 1 Linha 2”',
  )
})

test('relativeTime: agora, minutos, horas, ontem e dias', () => {
  const now = new Date('2026-10-03T12:00:00.000Z')
  const ago = (ms) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60 * 1000
  const H = 60 * MIN
  assert.equal(relativeTime(ago(30 * 1000), now), 'agora')
  assert.equal(relativeTime(ago(0), now), 'agora')
  assert.equal(relativeTime(ago(5 * MIN), now), 'há 5 min')
  assert.equal(relativeTime(ago(59 * MIN), now), 'há 59 min')
  assert.equal(relativeTime(ago(2 * H), now), 'há 2 h')
  assert.equal(relativeTime(ago(23 * H), now), 'há 23 h')
  assert.equal(relativeTime(ago(30 * H), now), 'ontem')
  assert.equal(relativeTime(ago(3 * 24 * H), now), 'há 3 dias')
  assert.equal(relativeTime(new Date(now.getTime() + 5 * MIN).toISOString(), now), 'agora')
})

test('localToday usa a data local do navegador', () => {
  assert.equal(localToday(new Date(2026, 9, 3, 23, 59, 59)), '2026-10-03')
  assert.equal(localToday(new Date(2026, 0, 5, 0, 0, 1)), '2026-01-05')
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/)
})
