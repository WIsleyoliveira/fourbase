import { test } from 'node:test'
import assert from 'node:assert/strict'
import { donutSegments, todayAgenda, quickNoteHtml, DONUT_RADIUS } from '../src/dashboardData.js'

const C = 2 * Math.PI * DONUT_RADIUS

test('rosca: fatias proporcionais, encadeadas e somando o círculo todo', () => {
  const seg = donutSegments({ todo: 11, doing: 4, done: 2 })
  assert.deepEqual(seg.map((s) => s.key), ['done', 'doing', 'todo'])
  const total = seg.reduce((n, s) => n + s.length, 0)
  assert.ok(Math.abs(total - C) < 1e-9)
  assert.equal(seg[0].offset, -0)
  assert.ok(Math.abs(seg[1].offset + seg[0].length) < 1e-9)
  assert.ok(Math.abs(seg[0].length - (2 / 17) * C) < 1e-9)
})

test('rosca: sem tarefas não há fatias; categoria zerada não aparece', () => {
  assert.deepEqual(donutSegments({ todo: 0, doing: 0, done: 0 }), [])
  assert.deepEqual(donutSegments({ todo: 3, doing: 0, done: 0 }).map((s) => s.key), ['todo'])
})

test('agenda de hoje: só abertas que cobrem hoje, com horário primeiro', () => {
  const t = (id, due_date, extra = {}) => ({ id, title: id, due_date, column_key: 'todo', ...extra })
  const list = todayAgenda([
    t('sem-hora', '2026-10-05'),
    t('tarde', '2026-10-05', { due_time: '15:00:00' }),
    t('cedo', '2026-10-05', { due_time: '08:30:00' }),
    t('faixa', '2026-10-03', { due_date_end: '2026-10-07' }),
    t('amanha', '2026-10-06'),
    t('ontem', '2026-10-04'),
    t('faixa-passada', '2026-10-01', { due_date_end: '2026-10-04' }),
    t('feita', '2026-10-05', { column_key: 'done' }),
    { id: 'sem-prazo', title: 'x', column_key: 'todo', due_date: null },
  ], '2026-10-05')
  assert.deepEqual(list.map((x) => x.id), ['cedo', 'tarde', 'faixa', 'sem-hora'])
})

test('nota rápida: uma linha por parágrafo, tudo escapado', () => {
  assert.equal(quickNoteHtml('um\n\n  dois  \r\ntrês'), '<p>um</p><p>dois</p><p>três</p>')
  assert.equal(quickNoteHtml('<img src=x onerror=alert(1)> & co'), '<p>&lt;img src=x onerror=alert(1)&gt; &amp; co</p>')
  assert.equal(quickNoteHtml('   \n  '), '')
})
