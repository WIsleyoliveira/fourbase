import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addNoteFirst, replaceNote, patchNote, removeNote, NOTE_KEYS } from '../src/noteCache.js'

const n = (id, extra = {}) => ({ id, title: `n${id}`, folder_id: null, ...extra })
const ids = (list) => list.map((x) => x.id)

test('nota criada vai para o topo', () => {
  assert.deepEqual(ids(addNoteFirst([n(1), n(2)], n(3))), [3, 1, 2])
})

test('nota salva sobe para o topo sem duplicar', () => {
  const saved = n(2, { title: 'editada' })
  const out = addNoteFirst([n(1), n(2), n(3)], saved)
  assert.deepEqual(ids(out), [2, 1, 3])
  assert.equal(out[0].title, 'editada')
})

test('substituir mantém a posição', () => {
  const out = replaceNote([n(1), n(2), n(3)], n(2, { folder_id: 'f1' }))
  assert.deepEqual(ids(out), [1, 2, 3])
  assert.equal(out[1].folder_id, 'f1')
})

test('patch e remoção só afetam a nota alvo', () => {
  const list = [n(1, { folder_id: 'f1' }), n(2, { folder_id: 'f1' })]
  const patched = patchNote(list, 1, { folder_id: null })
  assert.equal(patched[0].folder_id, null)
  assert.equal(patched[1].folder_id, 'f1')
  assert.deepEqual(ids(removeNote(list, 1)), [2])
})

test('as chaves de cache são separadas por usuário', () => {
  assert.notDeepEqual(NOTE_KEYS.mine('a'), NOTE_KEYS.mine('b'))
  assert.deepEqual(NOTE_KEYS.mine('a').slice(0, 1), NOTE_KEYS.all)
})
