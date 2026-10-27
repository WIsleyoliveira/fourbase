import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnBuckets, bucketOf, countByBucket } from '../src/columnBuckets.js'
import { donutSegments } from '../src/dashboardData.js'

const col = (key, label, position, color = '#111111') => ({ key, label, position, color })
const padrao = () => [col('todo', 'A Fazer', 0, '#9ca3af'), col('doing', 'Em Progresso', 1, '#14b8c4'), col('done', 'Concluído', 2, '#2ec27e')]

test('quadro padrão: a fazer / em progresso / concluídas com nome e cor das colunas', () => {
  const b = columnBuckets(padrao())
  assert.deepEqual(b.todo, { label: 'A Fazer', color: '#9ca3af' })
  assert.deepEqual(b.doing, { label: 'Em Progresso', color: '#14b8c4' })
  assert.equal(b.done.label, 'Concluídas')
  assert.equal(b.done.color, '#2ec27e')
  assert.equal(b.firstKey, 'todo')
})

test('renomear e mover: os grupos seguem a posição, não os nomes internos', () => {
  const cols = [col('doing', 'Backlog', 0), col('todo', 'Fazendo', 1), col('done', 'Concluído', 2)]
  const b = columnBuckets(cols)
  assert.equal(b.firstKey, 'doing')
  assert.equal(b.todo.label, 'Backlog')
  assert.equal(b.doing.label, 'Fazendo')
  assert.equal(bucketOf('doing', b), 'todo')
  assert.equal(bucketOf('todo', b), 'doing')
  assert.equal(bucketOf('done', b), 'done')
})

test('várias colunas abertas: o grupo "em andamento" soma todas as demais', () => {
  const cols = [col('a', 'Ideias', 0), col('b', 'Revisão', 1), col('c', 'Teste', 2), col('done', 'Concluído', 3)]
  const b = columnBuckets(cols)
  assert.equal(b.doing.label, 'Em andamento')
  const tasks = [{ column_key: 'a' }, { column_key: 'b' }, { column_key: 'c' }, { column_key: 'c' }, { column_key: 'done' }, { column_key: 'sumiu' }]
  assert.deepEqual(countByBucket(tasks, b), { todo: 1, doing: 4, done: 1 })
})

test('uma só coluna aberta: não existe o grupo "em andamento"', () => {
  const b = columnBuckets([col('doing', 'Tudo', 0), col('done', 'Concluído', 1)])
  assert.equal(b.doing, null)
  assert.deepEqual(countByBucket([{ column_key: 'doing' }, { column_key: 'done' }], b), { todo: 1, doing: 0, done: 1 })
})

test('sem colunas carregadas: usa o padrão sem quebrar', () => {
  const b = columnBuckets(undefined)
  assert.equal(b.firstKey, 'todo')
  assert.equal(b.todo.label, 'A fazer')
  assert.equal(b.doing, null)
})

test('rosca: as fatias carregam a cor de cada grupo', () => {
  const seg = donutSegments({ todo: 2, doing: 0, done: 2 }, ['done', 'doing', 'todo'], { todo: '#111111', done: '#222222' })
  assert.deepEqual(seg.map((s) => [s.key, s.color]), [['done', '#222222'], ['todo', '#111111']])
})
