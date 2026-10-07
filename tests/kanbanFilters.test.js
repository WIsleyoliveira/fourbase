import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_FILTERS, NO_CLIENT, dueBucket, filterTasks, sortTasks, hasActiveFilters,
  toggleFilterValue, setSearch, buildFacets, activeChips, summarize, countActiveFilters,
} from '../src/kanbanFilters.js'

const TODAY = '2026-10-05'
let seq = 0
const task = (title, o = {}) => ({
  id: `t${++seq}`, title, description: '', priority: 'Média', due_date: null, due_date_end: null,
  column_key: 'todo', assigned_to: 'u1', client_id: null, tags: [], mentioned_users: [],
  created_at: '2026-10-01T10:00:00Z', ...o,
})
const ids = (list) => list.map((x) => x.title)

const members = [{ id: 'u1', name: 'Ana Souza' }, { id: 'u2', name: 'Bruno Lima' }, { id: 'u3', name: 'Carla Dias' }]
const clients = [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Studio Verde' }]
const tagList = [{ name: 'Design', color: '#e85d75' }, { name: 'Reunião', color: '#4f8ff7' }]

test('dueBucket: hoje, amanhã, semana, depois, sem prazo, atrasada', () => {
  assert.equal(dueBucket(task('a'), TODAY), 'none')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-05' }), TODAY), 'today')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-06' }), TODAY), 'week')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-12' }), TODAY), 'week')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-13' }), TODAY), 'later')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-04' }), TODAY), 'overdue')
})

test('dueBucket: virada de mês/ano e tarefa de vários dias', () => {
  assert.equal(dueBucket(task('a', { due_date: '2027-01-01' }), '2026-12-31'), 'week')
  assert.equal(dueBucket(task('a', { due_date: '2026-03-01' }), '2026-02-28'), 'week')
  assert.equal(dueBucket(task('a', { due_date: '2026-02-26' }), '2026-03-01'), 'overdue')
  // começou ontem e termina amanhã: ainda é "hoje"; só atrasa depois do último dia
  assert.equal(dueBucket(task('a', { due_date: '2026-10-04', due_date_end: '2026-10-06' }), TODAY), 'today')
  assert.equal(dueBucket(task('a', { due_date: '2026-10-01', due_date_end: '2026-10-04' }), TODAY), 'overdue')
})

test('dueBucket: tarefa concluída com prazo vencido não conta como atrasada', () => {
  assert.equal(dueBucket(task('a', { due_date: '2026-10-01', column_key: 'done' }), TODAY), 'past')
})

test('busca: sem acento, sem maiúsculas, todas as palavras, em título, descrição e etiquetas', () => {
  const list = [
    task('Reunião de alinhamento'),
    task('Fechar proposta', { description: 'Revisar valores e prazos' }),
    task('Logo novo', { tags: ['Design'] }),
  ]
  assert.deepEqual(ids(filterTasks(list, setSearch(EMPTY_FILTERS, 'REUNIAO'), TODAY)), ['Reunião de alinhamento'])
  assert.deepEqual(ids(filterTasks(list, setSearch(EMPTY_FILTERS, 'valores prazos'), TODAY)), ['Fechar proposta'])
  assert.deepEqual(ids(filterTasks(list, setSearch(EMPTY_FILTERS, 'design'), TODAY)), ['Logo novo'])
  assert.deepEqual(ids(filterTasks(list, setSearch(EMPTY_FILTERS, 'valores logo'), TODAY)), [])
  assert.equal(filterTasks(list, setSearch(EMPTY_FILTERS, '   '), TODAY).length, 3, 'busca só de espaços não filtra')
})

test('filtros: dentro de um grupo é OU, entre grupos é E', () => {
  const list = [
    task('A', { priority: 'Urgente', assigned_to: 'u1' }),
    task('B', { priority: 'Alta', assigned_to: 'u2' }),
    task('C', { priority: 'Urgente', assigned_to: 'u2' }),
    task('D', { priority: 'Baixa', assigned_to: 'u1' }),
  ]
  let f = toggleFilterValue(EMPTY_FILTERS, 'priorities', 'Urgente')
  f = toggleFilterValue(f, 'priorities', 'Alta')
  assert.deepEqual(ids(filterTasks(list, f, TODAY)), ['A', 'B', 'C'])
  f = toggleFilterValue(f, 'assignees', 'u2')
  assert.deepEqual(ids(filterTasks(list, f, TODAY)), ['B', 'C'])
})

test('filtros: etiquetas, mencionados, cliente e "sem cliente"', () => {
  const list = [
    task('A', { tags: ['Design'], mentioned_users: ['u2'], client_id: 'c1' }),
    task('B', { tags: ['Reunião'], mentioned_users: ['u3'], client_id: null }),
    task('C', { tags: ['Design', 'Reunião'], mentioned_users: [], client_id: 'c2' }),
  ]
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'tags', 'Design'), TODAY)), ['A', 'C'])
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'mentioned', 'u3'), TODAY)), ['B'])
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'clients', 'c1'), TODAY)), ['A'])
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'clients', NO_CLIENT), TODAY)), ['B'])
})

test('filtro de prazo: atrasadas não inclui concluídas; hoje inclui as de vários dias', () => {
  const list = [
    task('atrasada', { due_date: '2026-10-01' }),
    task('concluida-antiga', { due_date: '2026-10-01', column_key: 'done' }),
    task('hoje', { due_date: '2026-10-05' }),
    task('em-curso', { due_date: '2026-10-04', due_date_end: '2026-10-07' }),
    task('sem-prazo'),
  ]
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'due', 'overdue'), TODAY)), ['atrasada'])
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'due', 'today'), TODAY)), ['hoje', 'em-curso'])
  assert.deepEqual(ids(filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'due', 'none'), TODAY)), ['sem-prazo'])
})

test('toggleFilterValue/setSearch não alteram o objeto original', () => {
  const frozen = Object.freeze({ ...EMPTY_FILTERS, tags: Object.freeze(['Design']) })
  const on = toggleFilterValue(frozen, 'tags', 'Reunião')
  const off = toggleFilterValue(on, 'tags', 'Design')
  assert.deepEqual(on.tags, ['Design', 'Reunião'])
  assert.deepEqual(off.tags, ['Reunião'])
  assert.deepEqual(frozen.tags, ['Design'])
  assert.equal(setSearch(frozen, 'x').search, 'x')
  assert.equal(frozen.search, '')
})

test('hasActiveFilters e countActiveFilters', () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false)
  assert.equal(countActiveFilters(EMPTY_FILTERS), 0)
  let f = setSearch(EMPTY_FILTERS, 'abc')
  f = toggleFilterValue(f, 'tags', 'Design')
  f = toggleFilterValue(f, 'priorities', 'Alta')
  f = toggleFilterValue(f, 'priorities', 'Urgente')
  assert.equal(hasActiveFilters(f), true)
  assert.equal(countActiveFilters(f), 4)
  assert.equal(hasActiveFilters(setSearch(EMPTY_FILTERS, '  ')), false)
})

test('ordenação: prioridade (padrão), prazo, mais recentes e A–Z', () => {
  const list = [
    task('Banana', { priority: 'Baixa', due_date: '2026-10-10', created_at: '2026-10-02T00:00:00Z' }),
    task('Ábaco', { priority: 'Urgente', due_date: null, created_at: '2026-10-03T00:00:00Z' }),
    task('Cereja', { priority: 'Urgente', due_date: '2026-10-08', created_at: '2026-10-01T00:00:00Z' }),
    task('Damasco', { priority: 'Média', due_date: '2026-10-06', created_at: '2026-10-04T00:00:00Z' }),
  ]
  assert.deepEqual(ids(sortTasks(list, 'priority')), ['Cereja', 'Ábaco', 'Damasco', 'Banana'])
  assert.deepEqual(ids(sortTasks(list, 'due')), ['Damasco', 'Cereja', 'Banana', 'Ábaco'])
  assert.deepEqual(ids(sortTasks(list, 'recent')), ['Damasco', 'Ábaco', 'Banana', 'Cereja'])
  assert.deepEqual(ids(sortTasks(list, 'title')), ['Ábaco', 'Banana', 'Cereja', 'Damasco'])
  assert.deepEqual(ids(sortTasks(list, 'desconhecida')), ids(sortTasks(list, 'priority')))
  assert.equal(list[0].title, 'Banana', 'não altera a lista original')
})

test('facetas: opções vêm das tarefas e a faceta sem escolha real some', () => {
  const list = [
    task('A', { assigned_to: 'u1', tags: ['Design'], client_id: 'c1', mentioned_users: ['u2'] }),
    task('B', { assigned_to: 'u1', tags: ['Design', 'Reunião'], client_id: null }),
    task('C', { assigned_to: 'u1', tags: [], client_id: 'c1', mentioned_users: ['u2', 'u3'] }),
  ]
  const f = buildFacets(list, { members, clients, tags: tagList }, EMPTY_FILTERS, TODAY)
  assert.equal(f.assignees.visible, false, 'só uma pessoa: sem filtro de responsável')
  assert.deepEqual(f.mentioned.options.map((o) => [o.value, o.count]), [['u2', 2], ['u3', 1]])
  assert.deepEqual(f.tags.options.map((o) => [o.value, o.count]), [['Design', 2], ['Reunião', 1]])
  assert.equal(f.tags.options[0].color, '#e85d75')
  assert.deepEqual(f.clients.options.map((o) => [o.value, o.label, o.count]), [['c1', 'Acme', 2], [NO_CLIENT, 'Sem cliente', 1]])
  assert.equal(f.clients.visible, true)
  assert.deepEqual(f.priorities.options.map((o) => o.value), ['Urgente', 'Alta', 'Média', 'Baixa'])
  assert.equal(f.priorities.options.find((o) => o.value === 'Média').count, 3)
  assert.deepEqual(f.due.options.map((o) => o.value), ['overdue', 'today', 'week', 'later', 'none'])
})

test('facetas: com duas pessoas aparece Responsável; faceta com seleção ativa nunca some', () => {
  const two = [task('A', { assigned_to: 'u1' }), task('B', { assigned_to: 'u2' })]
  assert.equal(buildFacets(two, { members, clients, tags: tagList }, EMPTY_FILTERS, TODAY).assignees.visible, true)
  const one = [task('A', { assigned_to: 'u1' })]
  const selected = toggleFilterValue(EMPTY_FILTERS, 'assignees', 'u1')
  assert.equal(buildFacets(one, { members, clients, tags: tagList }, selected, TODAY).assignees.visible, true)
  const noClient = [task('A'), task('B')]
  assert.equal(buildFacets(noClient, { members, clients, tags: tagList }, EMPTY_FILTERS, TODAY).clients.visible, false)
})

test('facetas: contadores de prazo usam a data de hoje informada', () => {
  const list = [
    task('a', { due_date: '2026-10-01' }),
    task('b', { due_date: '2026-10-05' }),
    task('c', { due_date: '2026-10-09' }),
    task('d', { due_date: '2026-11-30' }),
    task('e'),
    task('f', { due_date: '2026-10-01', column_key: 'done' }),
  ]
  const f = buildFacets(list, { members, clients, tags: tagList }, EMPTY_FILTERS, TODAY)
  assert.deepEqual(f.due.options.map((o) => [o.value, o.count]),
    [['overdue', 1], ['today', 1], ['week', 1], ['later', 1], ['none', 1]])
})

test('chips dos filtros ativos têm rótulo legível', () => {
  const list = [task('A', { assigned_to: 'u1', priority: 'Urgente' }), task('B', { assigned_to: 'u2' })]
  const facets = buildFacets(list, { members, clients, tags: tagList }, EMPTY_FILTERS, TODAY)
  let f = setSearch(EMPTY_FILTERS, 'proposta')
  f = toggleFilterValue(f, 'assignees', 'u2')
  f = toggleFilterValue(f, 'priorities', 'Urgente')
  f = toggleFilterValue(f, 'due', 'overdue')
  const chips = activeChips(f, facets)
  assert.deepEqual(chips.map((c) => c.label), [
    'Busca: “proposta”', 'Responsável: Bruno Lima', 'Prioridade: Urgente', 'Prazo: Atrasadas',
  ])
  assert.deepEqual(chips.map((c) => [c.group, c.value]), [
    ['search', 'proposta'], ['assignees', 'u2'], ['priorities', 'Urgente'], ['due', 'overdue'],
  ])
})

test('resumo: total, exibidas, atrasadas e vencem hoje', () => {
  const list = [
    task('a', { due_date: '2026-10-01' }),
    task('b', { due_date: '2026-10-05' }),
    task('c', { due_date: '2026-10-05', column_key: 'done' }),
    task('d', { due_date: '2026-10-01', column_key: 'done' }),
    task('e'),
  ]
  const shown = filterTasks(list, toggleFilterValue(EMPTY_FILTERS, 'due', 'today'), TODAY)
  assert.deepEqual(summarize(list, shown, TODAY), { total: 5, shown: 2, overdue: 1, dueToday: 2 })
})
