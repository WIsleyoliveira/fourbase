import { test } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const { getHomeView, setHomeView, homeChoices } = await import('../src/homeView.js')

test('sem escolha, abre no painel; a escolha vale só para aquele usuário', () => {
  assert.equal(getHomeView('u1'), 'painel')
  assert.equal(setHomeView('u1', 'calendario'), true)
  assert.equal(getHomeView('u1'), 'calendario')
  assert.equal(getHomeView('u2'), 'painel')
  assert.equal(getHomeView(null), 'painel')
})

test('escolher o painel limpa a preferência; valor inválido é recusado', () => {
  setHomeView('u3', 'kanban')
  assert.equal(setHomeView('u3', 'painel'), true)
  assert.equal(store.has('fb_home_u3'), false)
  assert.equal(setHomeView('u3', 'inexistente'), false)
  assert.equal(getHomeView('u3'), 'painel')
})

test('funcionário não pode ter tela de gestor como inicial (nem se o valor estiver salvo)', () => {
  assert.equal(setHomeView('f1', 'relatorios', { isGestor: false }), false)
  store.set('fb_home_f1', 'relatorios')
  assert.equal(getHomeView('f1', { isGestor: false }), 'painel')
  assert.equal(getHomeView('f1', { isGestor: true }), 'relatorios')
  assert.ok(!homeChoices({ isGestor: false }).some((c) => c.value === 'assistente'))
  assert.ok(homeChoices({ isGestor: true, assistantEnabled: true }).some((c) => c.value === 'assistente'))
})
