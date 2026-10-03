import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markReadInData, markAllInData } from '../src/notificationCache.js'

const NOW = '2026-10-03T15:00:00.000Z'
const mk = () => ({
  items: [
    { id: 'a', read_at: null },
    { id: 'b', read_at: null },
    { id: 'c', read_at: '2026-10-01T10:00:00.000Z' },
  ],
  unread: 2,
})

test('markReadInData marca a linha e decrementa unread', () => {
  const data = mk()
  const out = markReadInData(data, 'a', NOW)
  assert.equal(out.items[0].read_at, NOW)
  assert.equal(out.items[1].read_at, null)
  assert.equal(out.unread, 1)
})

test('markReadInData e markAllInData não mutam a entrada', () => {
  const data = mk()
  const snapshot = JSON.parse(JSON.stringify(data))
  markReadInData(data, 'a', NOW)
  markAllInData(data, NOW)
  assert.deepEqual(data, snapshot)
})

test('markReadInData só decrementa se estava não lida e é idempotente', () => {
  const once = markReadInData(mk(), 'a', NOW)
  const twice = markReadInData(once, 'a', '2026-10-03T16:00:00.000Z')
  assert.deepEqual(twice, once)
  const already = markReadInData(mk(), 'c', NOW)
  assert.equal(already.unread, 2)
  assert.equal(already.items[2].read_at, '2026-10-01T10:00:00.000Z')
  assert.equal(markReadInData(mk(), 'inexistente', NOW).unread, 2)
})

test('markReadInData nunca deixa unread abaixo de 0', () => {
  const data = { items: [{ id: 'a', read_at: null }], unread: 0 }
  assert.equal(markReadInData(data, 'a', NOW).unread, 0)
})

test('markAllInData marca todas e zera unread', () => {
  const out = markAllInData(mk(), NOW)
  assert.equal(out.unread, 0)
  assert.equal(out.items[0].read_at, NOW)
  assert.equal(out.items[1].read_at, NOW)
  assert.equal(out.items[2].read_at, '2026-10-01T10:00:00.000Z')
  assert.deepEqual(markAllInData(out, '2026-10-04T00:00:00.000Z'), out)
})
