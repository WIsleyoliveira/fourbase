import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_COLUMNS, EXTRA_COLORS, toColKey, buildColumn, readCachedColumns, writeCachedColumns, isEditableColumn, validateColumnEdit, applyColumnEdit } from '../src/columnCache.js'

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
