// Lógica pura do assistente (api/_lib/assistant.js): validação, conflitos, duplicatas, tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  batchItemOf, findConflicts, findDuplicates, generateToken, hashToken, hhmm, isDate, isTokenShape, isValidBatchId,
  normalizeTaskInput, planUndo, taskFingerprint, toBatchView, todayIn,
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

const task = (over = {}) => ({
  id: 't1', title: 'Reunião', description: '', priority: 'Média', due_date: '2026-11-10', due_date_end: null,
  due_time: '10:00:00', due_time_end: null, column_key: 'todo', assigned_to: 'u1', client_id: null,
  tags: ['ChatGPT'], mentioned_users: [], attachments: [], logged_time_seconds: 0, ...over,
})

test('impressão digital: estável (ordem de listas, formato de hora) e muda em cada campo editável', () => {
  const base = taskFingerprint(task())
  assert.equal(taskFingerprint(task({ due_time: '10:00', tags: ['ChatGPT'] })), base)
  assert.equal(taskFingerprint(task({ mentioned_users: ['b', 'a'] })), taskFingerprint(task({ mentioned_users: ['a', 'b'] })))
  assert.equal(taskFingerprint(task({ description: null, logged_time_seconds: null })), base, 'null e vazio são iguais')
  for (const over of [{ title: 'x' }, { description: 'x' }, { priority: 'Alta' }, { due_date: '2026-11-11' }, { due_date_end: '2026-11-12' },
    { due_time: '11:00' }, { due_time_end: '11:00' }, { column_key: 'doing' }, { assigned_to: 'u2' }, { client_id: 'c1' },
    { tags: ['ChatGPT', 'X'] }, { mentioned_users: ['u3'] }, { attachments: ['https://a/b.png'] }, { logged_time_seconds: 60 }]) {
    assert.notEqual(taskFingerprint(task(over)), base, JSON.stringify(over))
  }
})

test('retrato do lote não guarda título nem descrição', () => {
  const item = batchItemOf(task({ title: 'Segredo', description: 'CPF 123' }))
  assert.deepEqual(Object.keys(item).sort(), ['due_date', 'due_date_end', 'fp', 'id'])
})

test('planUndo: intacta sai; motivos na ordem concluída > reatribuída > movida > editada; sumida conta como gone', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const created = ids.map((id) => task({ id }))
  const batch = { created_at: new Date().toISOString(), undone_at: null, items: created.map(batchItemOf) }
  const now = [
    task({ id: 'a' }),
    task({ id: 'b', column_key: 'done', title: 'mudou também' }),
    task({ id: 'c', assigned_to: 'u2', column_key: 'doing' }),
    task({ id: 'd', column_key: 'doing' }),
    task({ id: 'e', priority: 'Alta' }),
  ]
  const p = planUndo(batch, now, { userId: 'u1', firstColumn: 'todo' })
  assert.deepEqual(p.remove.map((t) => t.id), ['a'])
  assert.deepEqual(p.keep.map((t) => [t.id, t.reason]), [['b', 'done'], ['c', 'reassigned'], ['d', 'moved'], ['e', 'edited']])
  assert.equal(p.gone, 1)
  assert.deepEqual(planUndo(batch, now, { userId: 'u1', firstColumn: 'todo', onlyIds: [] }).remove, [], 'only_ids vazio não remove nada')
  assert.equal(planUndo({ ...batch, undone_at: 'x' }, now, { userId: 'u1' }).already_undone, true)
  assert.equal(planUndo({ ...batch, created_at: new Date(Date.now() - 49 * 3600000).toISOString() }, now, { userId: 'u1' }).expired, true)
  // lote antigo sem retrato: na dúvida, mantém
  assert.deepEqual(planUndo({ created_at: batch.created_at, task_ids: ['a'] }, now, { userId: 'u1' }).keep.map((t) => t.reason), ['edited'])
})

test('toBatchView: contagem, títulos vivos (até 5), intervalo de datas e prazo para desfazer', () => {
  const created = Array.from({ length: 7 }, (_, i) => task({ id: 'k' + i, title: 'T' + i, due_date: '2026-11-1' + i, due_date_end: i === 6 ? '2026-11-20' : null }))
  const batch = { batch_id: 'lote-xyz-0001', created_at: new Date().toISOString(), undone_at: null, items: created.map(batchItemOf) }
  const v = toBatchView(batch, created.slice(1))
  assert.equal(v.count, 7)
  assert.deepEqual(v.titles, ['T1', 'T2', 'T3', 'T4', 'T5'])
  assert.deepEqual(v.date_range, { from: '2026-11-10', to: '2026-11-20' })
  assert.ok(v.undo_until)
  assert.equal(toBatchView({ ...batch, undone_at: 'x' }, created).undo_until, null)
})

test('hoje no fuso de Brasília: 01:30 UTC ainda é o dia anterior', () => {
  assert.equal(todayIn('America/Sao_Paulo', new Date('2026-11-02T01:30:00Z')), '2026-11-01')
  assert.equal(todayIn('America/Sao_Paulo', new Date('2026-11-02T12:00:00Z')), '2026-11-02')
})
