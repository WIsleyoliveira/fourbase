// Banco de dados local mockado — substitui o Supabase no backend para desenvolvimento.
//
// Persiste em um arquivo JSON (data/db.json) e expõe um subconjunto da API do
// cliente supabase-js (`.from(table).select().eq().order().single()...`) para
// que as rotas em api/index.js não precisem ser reescritas: apenas trocamos
// `createClient(url, key)` por `createLocalClient()`.
//
// Por ser baseado em arquivo local, serve para desenvolvimento na sua máquina.
// Um deploy real (ex: Vercel) precisa de um banco de verdade, já que funções
// serverless não garantem disco persistente entre invocações.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const DB_PATH = fileURLToPath(new URL('../data/db.json', import.meta.url))

const TABLES = [
  'fourbase_users',
  'fourbase_tasks',
  'fourbase_notes',
  'fourbase_todos',
  'fourbase_media',
  'fourbase_folders',
  'fourbase_folder_media',
  'fourbase_columns',
  'fourbase_clients',
  'fourbase_report_activities',
  'fourbase_tags',
]

// Colunas com restrição de unicidade, por tabela — usado para simular o erro
// de constraint '23505' que o código já trata (ex: e-mail duplicado).
const UNIQUE_COLUMNS = {
  fourbase_users: ['email'],
  fourbase_columns: ['key'],
  fourbase_tags: ['name'],
}

// Tabelas com created_at/updated_at automáticos ao inserir/atualizar.
const TIMESTAMPED = new Set([
  'fourbase_notes', 'fourbase_media', 'fourbase_folders', 'fourbase_folder_media',
  'fourbase_columns', 'fourbase_clients', 'fourbase_report_activities', 'fourbase_tasks',
  'fourbase_tags',
])

// Etiquetas padrão enviadas pela Amanda — pré-cadastradas na primeira execução.
const DEFAULT_TAGS = [
  { name: 'Reuniões', color: '#4f8ff7' },
  { name: 'Ensaio fotográfico', color: '#e85d75' },
  { name: 'Captação de vídeos para os calendários', color: '#9333ea' },
  { name: 'Treinamentos (PDI e PFL)', color: '#2ec27e' },
  { name: 'Viagens', color: '#f2a93b' },
  { name: 'Plantão Psicológico', color: '#14b8c4' },
]

function seedDb() {
  const now = new Date().toISOString()
  return {
    fourbase_users: [
      {
        id: randomUUID(),
        name: 'Gestor fourbase',
        email: 'gestor@fourbase.com',
        password_hash: bcrypt.hashSync('gestor123', 10),
        role: 'gestor',
        job_title: null,
        created_at: now,
      },
    ],
    fourbase_tasks: [],
    fourbase_notes: [],
    fourbase_todos: [],
    fourbase_media: [],
    fourbase_folders: [],
    fourbase_folder_media: [],
    fourbase_columns: [
      { id: randomUUID(), key: 'todo', label: 'A Fazer', position: 0, color: '#9ca3af', created_at: now },
      { id: randomUUID(), key: 'doing', label: 'Em Progresso', position: 1, color: '#14b8c4', created_at: now },
      { id: randomUUID(), key: 'done', label: 'Concluído', position: 2, color: '#2ec27e', created_at: now },
    ],
    fourbase_clients: [
      { id: randomUUID(), name: 'Acme Indústria Ltda', cnpj: '12.345.678/0001-90', phone: '(11) 98888-1234', email: 'contato@acme.com.br', contact_name: 'Marina Alves', address: 'Av. Paulista, 1000 — São Paulo/SP', created_by: null, created_at: now, updated_at: now },
      { id: randomUUID(), name: 'Studio Verde Design', cnpj: '98.765.432/0001-10', phone: '(21) 3555-7788', email: 'ola@studioverde.com', contact_name: 'Rafael Costa', address: 'Rua das Laranjeiras, 42 — Rio de Janeiro/RJ', created_by: null, created_at: now, updated_at: now },
      { id: randomUUID(), name: 'Nordeste Logística', cnpj: '', phone: '(85) 99777-4455', email: 'comercial@nordestelog.com', contact_name: 'Juliana Rocha', address: 'Fortaleza/CE', created_by: null, created_at: now, updated_at: now },
    ],
    fourbase_report_activities: [],
    fourbase_tags: DEFAULT_TAGS.map((t) => ({ id: randomUUID(), ...t, created_at: now })),
  }
}

function persist(state) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2))
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    // Garante que tabelas adicionadas depois do arquivo já existir tenham array
    let touched = false
    for (const t of TABLES) {
      if (!Array.isArray(parsed[t])) { parsed[t] = []; touched = true }
    }
    // Backfill das etiquetas padrão para bancos locais já existentes (criados
    // antes desta feature) — só roda se a tabela ainda não tinha nenhuma linha.
    if (parsed.fourbase_tags.length === 0) {
      const now = new Date().toISOString()
      parsed.fourbase_tags = DEFAULT_TAGS.map((t) => ({ id: randomUUID(), ...t, created_at: now }))
      touched = true
    }
    if (touched) persist(parsed)
    return parsed
  } catch {
    const seeded = seedDb()
    persist(seeded)
    return seeded
  }
}

const state = loadDb()

const uniqueViolation = (col) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint (${col})`,
})

function checkUnique(table, item, ignoreId) {
  const cols = UNIQUE_COLUMNS[table]
  if (!cols) return null
  for (const col of cols) {
    if (item[col] === undefined || item[col] === null) continue
    const clash = state[table].some((row) => row.id !== ignoreId && row[col] === item[col])
    if (clash) return uniqueViolation(col)
  }
  return null
}

// Projeta apenas as colunas pedidas em `.select('a, b, c')`. Selects com
// sintaxe de join embutido (`assignee:fourbase_users!fk(...)`) não são
// suportados aqui de propósito — resolva o join manualmente na rota (é o caso
// de /api/team/tasks) em vez de generalizar esse parser.
function project(row, cols) {
  if (!cols || cols === '*' || /[:!()]/.test(cols)) return { ...row }
  const fields = cols.split(',').map((s) => s.trim()).filter(Boolean)
  const out = {}
  for (const f of fields) out[f] = row[f]
  return out
}

function compare(a, b) {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  return a > b ? 1 : -1
}

// ── Query builder — thenable, compatível com o subconjunto do supabase-js
// usado neste projeto (select/insert/update/delete/upsert + eq/in/order/single) ──
class LocalQuery {
  constructor(table) {
    this.table = table
    this.verb = null
    this.payload = null
    this.upsertOpts = null
    this.filters = []
    this.selectCols = null
    this.wantsReturn = false
    this.orderSpec = null
    this._single = false
    this._maybeSingle = false
  }

  select(cols = '*') {
    if (!this.verb) this.verb = 'select'
    else this.wantsReturn = true
    this.selectCols = cols
    return this
  }

  insert(payload) { this.verb = 'insert'; this.payload = payload; return this }
  update(payload) { this.verb = 'update'; this.payload = payload; return this }
  delete() { this.verb = 'delete'; return this }
  upsert(payload, opts = {}) { this.verb = 'upsert'; this.payload = payload; this.upsertOpts = opts; return this }

  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this }
  neq(col, val) { this.filters.push({ col, op: 'neq', val }); return this }
  in(col, vals) { this.filters.push({ col, op: 'in', val: vals }); return this }

  order(col, opts = {}) { this.orderSpec = { col, ascending: opts.ascending !== false }; return this }
  single() { this._single = true; return this }
  maybeSingle() { this._maybeSingle = true; return this }

  _matches(row) {
    return this.filters.every((f) => {
      if (f.op === 'eq') return row[f.col] === f.val
      if (f.op === 'neq') return row[f.col] !== f.val
      if (f.op === 'in') return f.val.includes(row[f.col])
      return true
    })
  }

  _finalize(rows) {
    if (this.verb === 'delete') return { data: null, error: null }
    if (this._single) {
      if (rows.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: 'Registro não encontrado (single)' } }
      }
      return { data: rows[0], error: null }
    }
    if (this._maybeSingle) {
      if (rows.length === 0) return { data: null, error: null }
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Múltiplos registros encontrados' } }
      return { data: rows[0], error: null }
    }
    if (this.verb === 'insert' || this.verb === 'update' || this.verb === 'upsert') {
      return { data: rows, error: null }
    }
    return { data: rows, error: null }
  }

  _run() {
    const table = state[this.table]
    if (!table) return { data: null, error: { message: `Tabela desconhecida: ${this.table}` } }

    if (this.verb === 'select') {
      let result = table.filter((r) => this._matches(r))
      if (this.orderSpec) {
        const { col, ascending } = this.orderSpec
        result = [...result].sort((a, b) => (ascending ? compare(a[col], b[col]) : -compare(a[col], b[col])))
      }
      return this._finalize(result.map((r) => project(r, this.selectCols)))
    }

    if (this.verb === 'insert') {
      const now = new Date().toISOString()
      const items = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = []
      for (const item of items) {
        const uniqueErr = checkUnique(this.table, item)
        if (uniqueErr) return { data: null, error: uniqueErr }
        const row = { id: item.id || randomUUID(), ...item }
        if (TIMESTAMPED.has(this.table)) {
          if (row.created_at === undefined) row.created_at = now
          if ('updated_at' in row || this.table !== 'fourbase_folder_media') {
            if (row.updated_at === undefined && Object.prototype.hasOwnProperty.call(seedShape(this.table), 'updated_at')) {
              row.updated_at = now
            }
          }
        }
        table.push(row)
        inserted.push(row)
      }
      persist(state)
      return this._finalize(inserted.map((r) => project(r, this.selectCols)))
    }

    if (this.verb === 'update') {
      const now = new Date().toISOString()
      const changed = []
      for (const row of table) {
        if (!this._matches(row)) continue
        const uniqueErr = checkUnique(this.table, this.payload, row.id)
        if (uniqueErr) return { data: null, error: uniqueErr }
        Object.assign(row, this.payload)
        if (TIMESTAMPED.has(this.table) && this.payload.updated_at === undefined && Object.prototype.hasOwnProperty.call(seedShape(this.table), 'updated_at')) {
          row.updated_at = now
        }
        changed.push(row)
      }
      persist(state)
      return this._finalize(changed.map((r) => project(r, this.selectCols)))
    }

    if (this.verb === 'delete') {
      state[this.table] = table.filter((r) => !this._matches(r))
      persist(state)
      return this._finalize([])
    }

    if (this.verb === 'upsert') {
      const onConflict = (this.upsertOpts?.onConflict || 'id').split(',').map((s) => s.trim())
      const existing = table.find((r) => onConflict.every((c) => r[c] === this.payload[c]))
      const now = new Date().toISOString()
      if (existing) {
        Object.assign(existing, this.payload)
        if (TIMESTAMPED.has(this.table) && this.payload.updated_at === undefined) existing.updated_at = now
        persist(state)
        return this._finalize([project(existing, this.selectCols)])
      }
      const row = { id: this.payload.id || randomUUID(), ...this.payload }
      table.push(row)
      persist(state)
      return this._finalize([project(row, this.selectCols)])
    }

    return { data: null, error: { message: `Operação não suportada: ${this.verb}` } }
  }

  // Torna o builder "thenable" — funciona com `await` e dentro de Promise.all,
  // igual ao cliente real do supabase-js. Nunca rejeita: erros vão em `.error`.
  then(resolve, reject) {
    try {
      resolve(this._run())
    } catch (err) {
      // Erro inesperado do próprio shim — mantém o formato {data, error}
      if (reject) reject(err)
      else resolve({ data: null, error: { message: err.message } })
    }
  }
}

// Shape "vazio" de uma tabela — usado só para checar se `updated_at` faz
// parte do schema daquela tabela antes de preenchê-lo automaticamente.
function seedShape(table) {
  const shapes = {
    fourbase_notes: { updated_at: true },
    fourbase_media: { updated_at: true },
    fourbase_clients: { updated_at: true },
    fourbase_report_activities: { updated_at: true },
    fourbase_tasks: {},
    fourbase_folders: {},
    fourbase_folder_media: {},
    fourbase_columns: {},
    fourbase_users: {},
    fourbase_todos: {},
  }
  return shapes[table] || {}
}

export function createLocalClient() {
  return {
    from: (table) => new LocalQuery(table),
  }
}
