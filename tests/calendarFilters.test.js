import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_CAL_FILTERS, toggleCalFilter, countCalFilters, filterCalendarTasks, countOptions, monthGrid,
} from '../src/calendarFilters.js'

const tasks = [
  { id: '1', assigned_to: 'a', tags: ['Design'], column_key: 'todo' },
  { id: '2', assigned_to: 'b', tags: ['Design', 'Urgente'], column_key: 'doing' },
  { id: '3', assigned_to: 'a', tags: [], column_key: 'done' },
]
const ids = (list) => list.map((t) => t.id)

test('sem nada marcado devolve tudo', () => {
  assert.deepEqual(ids(filterCalendarTasks(tasks, EMPTY_CAL_FILTERS)), ['1', '2', '3'])
})

test('dentro do grupo vale OU; entre grupos vale E', () => {
  const ab = { ...EMPTY_CAL_FILTERS, assignees: ['a', 'b'] }
  assert.deepEqual(ids(filterCalendarTasks(tasks, ab)), ['1', '2', '3'])
  const aDesign = { ...EMPTY_CAL_FILTERS, assignees: ['a'], tags: ['Design'] }
  assert.deepEqual(ids(filterCalendarTasks(tasks, aDesign)), ['1'])
  const status = { ...EMPTY_CAL_FILTERS, statuses: ['todo', 'done'] }
  assert.deepEqual(ids(filterCalendarTasks(tasks, status)), ['1', '3'])
})

test('marcar e desmarcar não altera o objeto original', () => {
  const on = toggleCalFilter(EMPTY_CAL_FILTERS, 'tags', 'Design')
  assert.deepEqual(on.tags, ['Design'])
  assert.deepEqual(EMPTY_CAL_FILTERS.tags, [])
  assert.deepEqual(toggleCalFilter(on, 'tags', 'Design').tags, [])
  assert.equal(countCalFilters({ assignees: ['a'], tags: ['x', 'y'], statuses: [] }), 3)
})

test('contagem por opção', () => {
  const c = countOptions(tasks)
  assert.deepEqual(c.assignees, { a: 2, b: 1 })
  assert.deepEqual(c.tags, { Design: 2, Urgente: 1 })
  assert.deepEqual(c.statuses, { todo: 1, doing: 1, done: 1 })
})

test('grade do mês: semanas completas começando no domingo', () => {
  const cells = monthGrid(2026, 9) // outubro de 2026 começa numa quinta
  assert.equal(cells.length % 7, 0)
  assert.equal(cells[0].key, '2026-09-27')
  assert.equal(cells[0].inMonth, false)
  assert.equal(cells[4].key, '2026-10-01')
  assert.equal(cells[4].inMonth, true)
  assert.equal(cells.filter((c) => c.inMonth).length, 31)
})
