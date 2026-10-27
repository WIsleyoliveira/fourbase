import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_COLUMNS, EXTRA_COLORS, toColKey, buildColumn, readCachedColumns, writeCachedColumns, isEditableColumn, validateColumnEdit, applyColumnEdit, canDeleteColumn, deletionTargets, removeColumn, moveColumn, canMoveColumn, renumberColumns, reopenColumnKey } from '../src/columnCache.js'

const fakeStorage = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, data }
}

test('chave da coluna: sem acento, minúscula, com sufixo único', () => {
  assert.equal(toColKey('Em Revisão!', 1000), `em-revisao-${(1000).toString(36)}`)
  assert.equal(toColKey('???', 1000), `col-${(1000).toString(36)}`)
})

test('coluna nova vai ao final e usa a próxima cor da paleta', () => {
  const col = buildColumn('  Revisão ', DEFAULT_COLUMNS, 5)
  assert.equal(col.label, 'Revisão')
  assert.equal(col.position, 3)
  assert.equal(col.color, EXTRA_COLORS[3 % EXTRA_COLORS.length])
  assert.equal(col.id, `col-${col.key}`)
})

test('cache: lê a última lista do usuário, ou o padrão', () => {
  const custom = [{ id: 'c', key: 'x', label: 'X', position: 0, color: '#000000' }]
  const storage = fakeStorage({ fb_cols_u1: JSON.stringify(custom), fb_cols_u2: '[]', fb_cols_u3: 'lixo{' })
  assert.deepEqual(readCachedColumns(storage, 'u1'), custom)
  assert.equal(readCachedColumns(storage, 'u2'), DEFAULT_COLUMNS, 'lista vazia → padrão')
  assert.equal(readCachedColumns(storage, 'u3'), DEFAULT_COLUMNS, 'JSON inválido → padrão')
  assert.equal(readCachedColumns(storage, 'sem-cache'), DEFAULT_COLUMNS)
  assert.equal(readCachedColumns(storage, null), DEFAULT_COLUMNS)
})

test('cache: grava por usuário e não quebra sem storage', () => {
  const storage = fakeStorage()
  writeCachedColumns(storage, 'u1', DEFAULT_COLUMNS)
  assert.deepEqual(JSON.parse(storage.data.fb_cols_u1), DEFAULT_COLUMNS)
  writeCachedColumns(storage, null, DEFAULT_COLUMNS)
  assert.equal(Object.keys(storage.data).length, 1)
  assert.doesNotThrow(() => writeCachedColumns({ setItem() { throw new Error('cheio') } }, 'u1', DEFAULT_COLUMNS))
})

test('colunas editáveis: todas menos "Concluído"', () => {
  assert.equal(isEditableColumn({ key: 'todo' }), true)
  assert.equal(isEditableColumn({ key: 'doing' }), true)
  assert.equal(isEditableColumn({ key: 'revisao-abc' }), true)
  assert.equal(isEditableColumn({ key: 'done' }), false)
})

test('validação da edição de coluna', () => {
  assert.equal(validateColumnEdit({ label: 'Revisão', color: '#a855f7' }), null)
  assert.match(validateColumnEdit({ label: '   ', color: '#a855f7' }), /nome/i)
  assert.match(validateColumnEdit({ label: 'x'.repeat(41), color: '#a855f7' }), /40/)
  assert.match(validateColumnEdit({ label: 'Ok', color: 'roxo' }), /cor/i)
})

test('aplicar edição troca só a coluna certa e não altera a lista original', () => {
  const list = [{ key: 'todo', label: 'A', color: '#111111' }, { key: 'done', label: 'C', color: '#222222' }]
  const next = applyColumnEdit(list, 'todo', { label: '  Novo  ', color: '#333333' })
  assert.deepEqual(next[0], { key: 'todo', label: 'Novo', color: '#333333' })
  assert.deepEqual(next[1], list[1])
  assert.equal(list[0].label, 'A')
})

const board = () => [
  { key: 'todo', label: 'A Fazer', position: 0 },
  { key: 'doing', label: 'Em Progresso', position: 1 },
  { key: 'rev', label: 'Revisão', position: 2 },
  { key: 'done', label: 'Concluído', position: 3 },
]

test('excluir: nunca "Concluído" e sempre sobra uma coluna além dela', () => {
  assert.equal(canDeleteColumn(board(), 'rev'), true)
  assert.equal(canDeleteColumn(board(), 'todo'), true)
  assert.equal(canDeleteColumn(board(), 'done'), false)
  assert.equal(canDeleteColumn(board(), 'nao-existe'), false)
  const sozinha = [{ key: 'todo', position: 0 }, { key: 'done', position: 1 }]
  assert.equal(canDeleteColumn(sozinha, 'todo'), false)
})

test('destinos das tarefas: as outras colunas, sem "Concluído"', () => {
  assert.deepEqual(deletionTargets(board(), 'doing').map((c) => c.key), ['todo', 'rev'])
})

test('remover coluna renumera as posições e mantém "Concluído" por último', () => {
  const next = removeColumn(board(), 'doing')
  assert.deepEqual(next.map((c) => [c.key, c.position]), [['todo', 0], ['rev', 1], ['done', 2]])
})

test('mover coluna: troca com a vizinha, respeita as pontas e não passa de "Concluído"', () => {
  const right = moveColumn(board(), 'todo', 1)
  assert.deepEqual(right.map((c) => c.key), ['doing', 'todo', 'rev', 'done'])
  assert.deepEqual(right.map((c) => c.position), [0, 1, 2, 3])
  const left = moveColumn(board(), 'rev', -1)
  assert.deepEqual(left.map((c) => c.key), ['todo', 'rev', 'doing', 'done'])
  // pontas: devolve a mesma lista
  const b = board()
  assert.equal(moveColumn(b, 'todo', -1), b)
  assert.equal(moveColumn(b, 'rev', 1), b, 'não pode passar "Concluído"')
  assert.equal(moveColumn(b, 'done', -1), b, '"Concluído" não se move')
  assert.equal(canMoveColumn(b, 'rev', -1), true)
  assert.equal(canMoveColumn(b, 'rev', 1), false)
  assert.equal(b[0].key, 'todo', 'a lista original não muda')
})

test('reabrir tarefa concluída: vai para a primeira coluna do quadro', () => {
  assert.equal(reopenColumnKey(board()), 'todo')
  assert.equal(reopenColumnKey(moveColumn(board(), 'rev', -2)), 'rev')
  assert.equal(reopenColumnKey([{ key: 'done' }]), 'todo')
  assert.deepEqual(renumberColumns([{ key: 'done' }, { key: 'a' }]).map((c) => c.key), ['a', 'done'])
})
