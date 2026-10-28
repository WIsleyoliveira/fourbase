// Lógica pura do assistente (api/_lib/assistant.js): validação, conflitos, duplicatas, tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findConflicts, findDuplicates, generateToken, hashToken, hhmm, isDate, isTokenShape, isValidBatchId, normalizeTaskInput,
} from '../api/_lib/assistant.js'

const today = '2026-10-28'

test('token: formato, hash estável e diferente a cada geração', () => {
  const a = generateToken()
  const b = generateToken()
  assert.ok(isTokenShape(a) && isTokenShape(b))
  assert.notEqual(a, b)
  assert.equal(hashToken(a), hashToken(a))
  assert.equal(hashToken(a).length, 64)
  assert.equal(isTokenShape('fbk_curto'), false)
  assert.equal(isTokenShape("fbk_' or 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false)
})

test('datas: calendário real (29/02 só em ano bissexto)', () => {
  assert.equal(isDate('2028-02-29'), true)
  assert.equal(isDate('2027-02-29'), false)
  assert.equal(isDate('2026-11-5'), false)
  assert.equal(isDate(20261105), false)
})

test('horário do Postgres ("10:00:00") vira "HH:MM"', () => {
  assert.equal(hhmm('10:00:00'), '10:00')
  assert.equal(hhmm('09:30'), '09:30')
  assert.equal(hhmm(null), null)
})

test('duplicata reconhece horário vindo do Postgres e título sem acento/caixa', () => {
  const existing = [{ id: 'x', title: 'Reunião fixa', due_date: '2026-11-10', due_time: '10:00:00' }]
  assert.deepEqual(findDuplicates([{ title: 'REUNIAO FIXA', due_date: '2026-11-10', due_time: '10:00' }], existing), [{ index: 0, existing_id: 'x' }])
  assert.deepEqual(findDuplicates([{ title: 'Reunião fixa', due_date: '2026-11-10', due_time: '11:00' }], existing), [])
})

test('conflitos: encostar não conflita; sem fim = 60 min; horário do Postgres', () => {
  const existing = [{ id: 'x', title: 'R', due_date: '2026-11-10', due_time: '10:00:00', due_time_end: '11:00:00' }]
  const c = findConflicts([
    { title: 'antes', due_date: '2026-11-10', due_time: '09:00', due_time_end: '10:00' },
    { title: 'depois', due_date: '2026-11-10', due_time: '11:00' },
    { title: 'sem fim', due_date: '2026-11-10', due_time: '09:59' },
    { title: 'outro dia', due_date: '2026-11-11', due_time: '10:00' },
    { title: 'sem hora', due_date: '2026-11-10' },
  ], existing)
  // 09:59 sem fim ocupa 09:59–10:59: bate na reunião existente E no item "antes" (09:00–10:00) do lote
  assert.deepEqual(c.map((x) => [x.index, x.with_index ?? null]), [[2, null], [2, 0]])
  assert.equal(c[0].with.due_time, '10:00')
})

test('normalização: prioridade, cliente por nome, campos dependentes', () => {
  const clients = [{ id: 'c1', name: 'Açaí & Cia' }, { id: 'j1', name: 'João' }, { id: 'j2', name: 'joao' }]
  const ok = normalizeTaskInput({ title: '  T  ', priority: ' URGENTE ', client_name: 'acai & cia', due_date: '2026-11-10', due_time: '22:00', due_date_end: '2026-11-11', due_time_end: '06:00' }, { clients, today })
  assert.deepEqual(ok.task, { title: 'T', description: '', priority: 'Urgente', due_date: '2026-11-10', due_date_end: '2026-11-11', due_time: '22:00', due_time_end: '06:00', client_id: 'c1' })
  assert.match(normalizeTaskInput({ title: 'x', client_name: 'JOAO' }, { clients, today }).errors[0], /mais de um cliente/)
  assert.deepEqual(normalizeTaskInput({ title: 'x', description: 7 }, { clients, today }).errors, ['descrição deve ser texto'])
  assert.equal(normalizeTaskInput({ title: 'x', due_date: '2026-09-27' }, { clients, today }).errors.length, 1, '31 dias atrás')
  assert.equal(normalizeTaskInput({ title: 'x', due_date: '2026-09-28' }, { clients, today }).task.due_date, '2026-09-28', '30 dias atrás ok')
  assert.equal(normalizeTaskInput(null, { clients, today }).errors[0], 'item inválido')
})

test('batch_id: só caracteres seguros, 8 a 80', () => {
  assert.equal(isValidBatchId('lote-2026-11-02:a.b_c'), true)
  for (const b of ['curto', 'com espaço aqui', '../../etc/passwd', 'x'.repeat(81), 12345678, null]) assert.equal(isValidBatchId(b), false)
})
