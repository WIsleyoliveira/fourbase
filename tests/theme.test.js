import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, nextTheme } from '../src/theme.js'

test('a escolha salva vence o tema do sistema', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
})

test('sem escolha (ou valor inválido) segue o sistema', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(null, false), 'light')
  assert.equal(resolveTheme('azul', true), 'dark')
})

test('alternar troca entre dia e noite', () => {
  assert.equal(nextTheme('light'), 'dark')
  assert.equal(nextTheme('dark'), 'light')
})
