import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareVersions, unseenReleases, shouldShowWhatsNew, readSeenVersion, markSeen,
} from '../src/whatsNew.js'
import { RELEASES, LATEST_VERSION } from '../src/releaseNotes.js'

const memory = () => {
  const data = {}
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v } }
}

test('compara versões número a número', () => {
  assert.equal(compareVersions('1.1.0', '1.0.0'), 1)
  assert.equal(compareVersions('1.0.0', '1.1.0'), -1)
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('2.0', '2.0.0'), 0)
})

test('mostra só o que é mais novo que a última versão vista', () => {
  const rel = [{ version: '1.2.0' }, { version: '1.1.0' }, { version: '1.0.0' }]
  assert.deepEqual(unseenReleases(rel, null).map((r) => r.version), ['1.2.0', '1.1.0', '1.0.0'])
  assert.deepEqual(unseenReleases(rel, '1.0.0').map((r) => r.version), ['1.2.0', '1.1.0'])
  assert.deepEqual(unseenReleases(rel, '1.2.0'), [])
})

test('não mostra para quem ainda não fez o tutorial nem para quem já viu', () => {
  const rel = [{ version: '1.1.0' }]
  assert.equal(shouldShowWhatsNew({ onboarded: false, seenVersion: null }, rel), false)
  assert.equal(shouldShowWhatsNew({ onboarded: true, seenVersion: null }, rel), true)
  assert.equal(shouldShowWhatsNew({ onboarded: true, seenVersion: '1.1.0' }, rel), false)
})

test('a versão vista é guardada por pessoa', () => {
  const store = memory()
  assert.equal(readSeenVersion('u1', store), null)
  markSeen('u1', '1.1.0', store)
  assert.equal(readSeenVersion('u1', store), '1.1.0')
  assert.equal(readSeenVersion('u2', store), null)
})

test('armazenamento indisponível não derruba nada', () => {
  const broken = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } }
  assert.equal(readSeenVersion('u1', broken), null)
  assert.doesNotThrow(() => markSeen('u1', '1.1.0', broken))
})

test('catálogo: versão mais nova primeiro e todo item completo', () => {
  assert.equal(LATEST_VERSION, RELEASES[0].version)
  for (let i = 1; i < RELEASES.length; i++) {
    assert.equal(compareVersions(RELEASES[i - 1].version, RELEASES[i].version), 1)
  }
  for (const r of RELEASES) {
    assert.ok(r.items.length > 0)
    for (const it of r.items) {
      assert.ok(['Novo', 'Melhoria', 'Correção'].includes(it.kind), it.title)
      assert.ok(it.title && it.text && it.icon, it.title)
      if (it.cta) assert.ok(it.cta.label && it.cta.path.startsWith('/'), it.title)
    }
  }
})
