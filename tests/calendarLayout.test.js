import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutWeek, taskEnd, isMultiDay, taskTooltip } from '../src/calendarLayout.js'

// semana de 4 a 10 de outubro de 2026
const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']
const t = (id, due_date, extra = {}) => ({ id, title: id, due_date, ...extra })
const seg = (res, id) => res.segments.find((s) => s.task.id === id)

test('tarefa de um dia ocupa uma coluna; sem prazo é ignorada', () => {
  const r = layoutWeek(week, [t('a', '2026-10-06'), { id: 'x', title: 'x', due_date: null }])
  assert.equal(r.segments.length, 1)
  assert.deepEqual([seg(r, 'a').col, seg(r, 'a').span, seg(r, 'a').lane], [2, 1, 0])
})

test('tarefa de vários dias vira uma única faixa contínua', () => {
  const r = layoutWeek(week, [t('m', '2026-10-06', { due_date_end: '2026-10-09' })])
  assert.equal(r.segments.length, 1)
  const s = seg(r, 'm')
  assert.deepEqual([s.col, s.span, s.startsHere, s.endsHere], [2, 4, true, true])
})

test('faixa que atravessa semanas é cortada nas bordas e marca a continuação', () => {
  const task = t('m', '2026-10-08', { due_date_end: '2026-10-14' })
  const a = seg(layoutWeek(week, [task]), 'm')
  assert.deepEqual([a.col, a.span, a.startsHere, a.endsHere], [4, 3, true, false])
  const next = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']
  const b = seg(layoutWeek(next, [task]), 'm')
  assert.deepEqual([b.col, b.span, b.startsHere, b.endsHere], [0, 4, false, true])
})

test('tarefas fora da semana são ignoradas', () => {
  const r = layoutWeek(week, [t('a', '2026-09-30'), t('b', '2026-10-11'), t('c', '2026-09-28', { due_date_end: '2026-10-03' })])
  assert.equal(r.segments.length, 0)
})

test('data final inválida (antes do início) é tratada como um dia só', () => {
  assert.equal(taskEnd(t('a', '2026-10-06', { due_date_end: '2026-10-01' })), '2026-10-06')
  assert.equal(isMultiDay(t('a', '2026-10-06', { due_date_end: '2026-10-06' })), false)
})

test('faixas não se sobrepõem: cada uma ganha a sua linha', () => {
  const r = layoutWeek(week, [
    t('a', '2026-10-05', { due_date_end: '2026-10-07' }),
    t('b', '2026-10-06', { due_date_end: '2026-10-08' }),
    t('c', '2026-10-06'),
  ])
  assert.equal(seg(r, 'a').lane, 0)
  assert.equal(seg(r, 'b').lane, 1)
  assert.equal(seg(r, 'c').lane, 2)
})

test('uma linha livre é reaproveitada por tarefa em outra coluna', () => {
  const r = layoutWeek(week, [t('a', '2026-10-05'), t('b', '2026-10-08')])
  assert.equal(seg(r, 'a').lane, 0)
  assert.equal(seg(r, 'b').lane, 0)
})

test('faixas de vários dias vêm antes das de um dia; com horário antes das sem horário', () => {
  const r = layoutWeek(week, [
    t('sem', '2026-10-06'),
    t('hora', '2026-10-06', { due_time: '09:00:00' }),
    t('faixa', '2026-10-06', { due_date_end: '2026-10-07' }),
  ])
  assert.equal(seg(r, 'faixa').lane, 0)
  assert.equal(seg(r, 'hora').lane, 1)
  assert.equal(seg(r, 'sem').lane, 2)
})

test('excesso vira contador por dia ("+N mais") e não gera faixa', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((id) => t(id, '2026-10-06'))
  tasks.push(t('longa', '2026-10-06', { due_date_end: '2026-10-07' }))
  const r = layoutWeek(week, tasks, 3)
  // 1 faixa + 2 do dia cabem; as outras 3 ficam escondidas no dia 06 (col 2)
  assert.equal(r.segments.length, 3)
  assert.equal(r.hidden[2], 3)
  assert.equal(r.hidden[3], 0)
  assert.equal(r.hidden[0], 0)
})

test('faixa escondida conta em todos os dias que cobre', () => {
  const full = [1, 2, 3].map((i) => t(`f${i}`, '2026-10-05', { due_date_end: '2026-10-07' }))
  const r = layoutWeek(week, [...full, t('x', '2026-10-05', { due_date_end: '2026-10-06' })], 3)
  assert.deepEqual(r.hidden.slice(0, 4), [0, 1, 1, 0])
})

test('tooltip com título, responsável, prazo e horário', () => {
  const fmt = (k) => k.split('-').reverse().join('/')
  const text = taskTooltip(
    t('Proposta', '2026-10-06', { title: 'Proposta', due_date_end: '2026-10-08', due_time: '09:00:00', due_time_end: '10:30:00' }),
    'Ana', fmt,
  )
  assert.equal(text, 'Proposta\nResponsável: Ana\nPrazo: 06/10/2026 – 08/10/2026\nHorário: 09:00–10:30')
  assert.equal(taskTooltip(t('X', '2026-10-06', { title: 'X' }), '', fmt), 'X\nPrazo: 06/10/2026')
})
