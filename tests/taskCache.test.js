import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import {
  TASK_KEYS, patchTask, removeTask, patchAllTaskLists, snapshotTaskLists,
  restoreTaskLists, addTaskToLists, mergeCalendarTasks,
} from '../src/taskCache.js'

const ME = 'user-me'
const task = (id, extra = {}) => ({ id, title: `t${id}`, column_key: 'todo', ...extra })

// Cache com a mesma tarefa 't1' em três listas, mais o agregado de progresso.
const seeded = () => {
  const qc = new QueryClient()
  qc.setQueryData(TASK_KEYS.mine(ME), [task('t1', { client_id: 'c1' }), task('t2')])
  qc.setQueryData(TASK_KEYS.byClient('c1'), [task('t1', { client_id: 'c1' }), task('t3', { client_id: 'c1' })])
  qc.setQueryData(TASK_KEYS.linked, [task('t1', { client_id: 'c1' })])
  qc.setQueryData(TASK_KEYS.stats, { c1: { total: 2, done: 0 } })
  return qc
}
const col = (qc, key, id) => qc.getQueryData(key).find((t) => t.id === id)?.column_key

test('mover uma tarefa atualiza todas as listas em que ela aparece', () => {
  const qc = seeded()
  patchAllTaskLists(qc, (l) => patchTask(l, 't1', { column_key: 'done' }))
  assert.equal(col(qc, TASK_KEYS.mine(ME), 't1'), 'done')
  assert.equal(col(qc, TASK_KEYS.byClient('c1'), 't1'), 'done')
  assert.equal(col(qc, TASK_KEYS.linked, 't1'), 'done')
  // as que não são a tarefa movida ficam como estavam
  assert.equal(col(qc, TASK_KEYS.mine(ME), 't2'), 'todo')
  assert.equal(col(qc, TASK_KEYS.byClient('c1'), 't3'), 'todo')
})

test('o agregado de progresso não é tratado como lista', () => {
  const qc = seeded()
  patchAllTaskLists(qc, (l) => removeTask(l, 't1'))
  assert.deepEqual(qc.getQueryData(TASK_KEYS.stats), { c1: { total: 2, done: 0 } })
})

test('excluir remove a tarefa de todas as listas', () => {
  const qc = seeded()
  patchAllTaskLists(qc, (l) => removeTask(l, 't1'))
  assert.deepEqual(qc.getQueryData(TASK_KEYS.mine(ME)).map((t) => t.id), ['t2'])
  assert.deepEqual(qc.getQueryData(TASK_KEYS.byClient('c1')).map((t) => t.id), ['t3'])
  assert.deepEqual(qc.getQueryData(TASK_KEYS.linked), [])
})

test('falha da API: restaurar o snapshot desfaz a mudança otimista', () => {
  const qc = seeded()
  const snap = snapshotTaskLists(qc)
  patchAllTaskLists(qc, (l) => removeTask(l, 't1'))
  assert.equal(qc.getQueryData(TASK_KEYS.linked).length, 0)
  restoreTaskLists(qc, snap)
  assert.equal(col(qc, TASK_KEYS.mine(ME), 't1'), 'todo')
  assert.equal(col(qc, TASK_KEYS.byClient('c1'), 't1'), 'todo')
  assert.equal(qc.getQueryData(TASK_KEYS.linked).length, 1)
})

test('tarefa criada no quadro do cliente entra nas listas certas', () => {
  const qc = seeded()
  addTaskToLists(qc, task('n1', { client_id: 'c1', assigned_to: 'outra-pessoa' }), { userId: ME })
  assert.ok(qc.getQueryData(TASK_KEYS.byClient('c1')).some((t) => t.id === 'n1'))
  assert.ok(qc.getQueryData(TASK_KEYS.linked).some((t) => t.id === 'n1'))
  assert.ok(!qc.getQueryData(TASK_KEYS.mine(ME)).some((t) => t.id === 'n1'), 'é de outra pessoa')

  addTaskToLists(qc, task('n2', { client_id: 'c1', assigned_to: ME }), { userId: ME })
  assert.ok(qc.getQueryData(TASK_KEYS.mine(ME)).some((t) => t.id === 'n2'), 'é minha')
})

test('forceMine mantém o comportamento do Kanban pessoal (aparece na hora)', () => {
  const qc = seeded()
  addTaskToLists(qc, task('n3', { assigned_to: 'outra-pessoa' }), { userId: ME, forceMine: true })
  assert.ok(qc.getQueryData(TASK_KEYS.mine(ME)).some((t) => t.id === 'n3'))
})

test('criar não duplica nem inventa listas que ainda não foram carregadas', () => {
  const qc = seeded()
  const t = task('n4', { client_id: 'c1', assigned_to: ME })
  addTaskToLists(qc, t, { userId: ME })
  addTaskToLists(qc, t, { userId: ME })
  assert.equal(qc.getQueryData(TASK_KEYS.mine(ME)).filter((x) => x.id === 'n4').length, 1)

  addTaskToLists(qc, task('n5', { client_id: 'c-outro' }), { userId: ME })
  assert.equal(qc.getQueryData(TASK_KEYS.byClient('c-outro')), undefined)
})

test('Calendário junta pessoais e de cliente sem duplicar', () => {
  const merged = mergeCalendarTasks(
    [task('a', { title: 'minha' }), task('b')],
    [task('b', { title: 'b atualizada' }), task('c')],
  )
  assert.deepEqual(merged.map((t) => t.id).sort(), ['a', 'b', 'c'])
  assert.equal(merged.find((t) => t.id === 'b').title, 'b atualizada')
})
