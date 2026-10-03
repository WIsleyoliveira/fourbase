// Operadores do banco local mockado (api/localDb.js) adicionados para o sino:
// .is(col, null) e .limit(n). Devem se comportar como no PostgREST.

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

let supabase
const ws = randomUUID()
const now = new Date().toISOString()
const tag = (name, color) => ({ id: randomUUID(), workspace_id: ws, name, color, created_at: now })

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-ops-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify({
    fourbase_tags: [tag('a', '#111111'), tag('b', null), tag('c', '#333333'), tag('d', null)],
  }))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  ;({ supabase } = await import('../api/_lib/supabase.js'))
})

const names = (res) => res.data.map((r) => r.name)

test('.is(col, null) devolve só linhas com a coluna nula (ou ausente)', async () => {
  const res = await supabase.from('fourbase_tags').select('name').is('color', null).order('name')
  assert.deepEqual(names(res), ['b', 'd'])
})

test('.is(col, null) funciona em update e não toca as demais linhas', async () => {
  await supabase.from('fourbase_tags').update({ color: '#999999' }).eq('workspace_id', ws).is('color', null)
  const res = await supabase.from('fourbase_tags').select('name, color').order('name')
  assert.deepEqual(res.data, [
    { name: 'a', color: '#111111' }, { name: 'b', color: '#999999' },
    { name: 'c', color: '#333333' }, { name: 'd', color: '#999999' },
  ])
})

test('.limit(n) corta depois do order; 0 e n maior que o total se comportam como no PostgREST', async () => {
  assert.deepEqual(names(await supabase.from('fourbase_tags').select('name').order('name', { ascending: false }).limit(2)), ['d', 'c'])
  assert.deepEqual(names(await supabase.from('fourbase_tags').select('name').order('name').limit(100)), ['a', 'b', 'c', 'd'])
  assert.deepEqual((await supabase.from('fourbase_tags').select('name').limit(0)).data, [])
})
