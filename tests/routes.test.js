import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocation, viewPath, clientPath, withTaskParam, VIEW_KEYS } from '../src/routes.js'

test('cada tela tem uma URL e volta ao mesmo estado', () => {
  for (const key of VIEW_KEYS) {
    const r = parseLocation(viewPath(key))
    assert.equal(r.valid, true, key)
    assert.equal(r.view, key)
    assert.equal(r.clientId, null)
  }
})

test('Espaço do cliente: id e sub-aba', () => {
  const id = '3f2b8a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
  assert.deepEqual(
    parseLocation(clientPath(id)),
    { activationToken: null, view: 'clientes', clientId: id, tab: 'kanban', taskId: null, valid: true },
  )
  const docs = parseLocation('/clientes/' + id, '?aba=docs')
  assert.equal(docs.tab, 'docs')
  assert.equal(parseLocation(clientPath(id, 'docs').split('?')[0], '?aba=qualquer').tab, 'kanban')
  assert.equal(clientPath(id, 'docs'), `/clientes/${id}?aba=docs`)
})

test('link de convite continua em /activate/:token', () => {
  const r = parseLocation('/activate/abc123.DEF_-9')
  assert.equal(r.activationToken, 'abc123.DEF_-9')
  assert.equal(parseLocation('/activate/abc/').activationToken, 'abc')
  assert.equal(parseLocation('/activate/').valid, false)
})

test('URLs desconhecidas são inválidas (o app redireciona ao painel)', () => {
  for (const p of ['/', '/nao-existe', '/kanban/extra', '/clientes/a/b', '/clientes/a%2Fb', '/painel/1']) {
    assert.equal(parseLocation(p).valid, false, p)
  }
})

test('viewPath cai no painel para tela desconhecida', () => {
  assert.equal(viewPath('xyz'), '/painel')
})

test('?tarefa=abc é lido em qualquer tela válida e não invalida a rota', () => {
  for (const key of VIEW_KEYS) {
    const r = parseLocation(viewPath(key), '?tarefa=abc')
    assert.equal(r.valid, true, key)
    assert.equal(r.view, key)
    assert.equal(r.taskId, 'abc', key)
  }
  const id = '3f2b8a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
  const c = parseLocation('/clientes/' + id, '?aba=docs&tarefa=t_1-X')
  assert.equal(c.clientId, id)
  assert.equal(c.tab, 'docs')
  assert.equal(c.taskId, 't_1-X')
  assert.equal(parseLocation('/painel').taskId, null)
})

test('?tarefa=a/b é ignorado', () => {
  for (const q of ['?tarefa=a/b', '?tarefa=', '?tarefa=a%2Fb', '?tarefa=a b']) {
    const r = parseLocation('/painel', q)
    assert.equal(r.valid, true, q)
    assert.equal(r.taskId, null, q)
  }
})

test('withTaskParam preserva ?aba=docs', () => {
  assert.equal(withTaskParam('?aba=docs', 'abc'), '?aba=docs&tarefa=abc')
  assert.equal(withTaskParam('?aba=docs&tarefa=abc', null), '?aba=docs')
  assert.equal(withTaskParam('?aba=docs&tarefa=abc', 'xyz'), '?aba=docs&tarefa=xyz')
  assert.equal(withTaskParam('', 'abc'), '?tarefa=abc')
  assert.equal(withTaskParam('?tarefa=abc', null), '')
  assert.equal(withTaskParam('', null), '')
})
