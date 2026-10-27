// Colunas do Kanban: padrão, cache em localStorage e criação de colunas novas.
// Funções puras (o "storage" é injetado) testadas em tests/columnCache.test.js.

// Usadas antes de qualquer dado persistido (e se a API não devolver colunas).
export const DEFAULT_COLUMNS = [
  { id: 'col-todo',  key: 'todo',  label: 'A Fazer',       position: 0, color: '#9ca3af' },
  { id: 'col-doing', key: 'doing', label: 'Em Progresso',  position: 1, color: '#14b8c4' },
  { id: 'col-done',  key: 'done',  label: 'Concluído',     position: 2, color: '#2ec27e' },
]

// Paleta de cores para novas colunas (evita conflito com as 3 padrão)
export const EXTRA_COLORS = ['#a855f7', '#f2a93b', '#e85d75', '#4f8ff7', '#f97316', '#0ea5e9', '#ec4899']

export const COLUMN_KEYS = {
  all: ['columns'],
  mine: (userId) => ['columns', userId],
}

const lsKey = (userId) => `fb_cols_${userId}`

// Slug URL-safe (sem acentos) + sufixo único baseado em timestamp.
export const toColKey = (label, now = Date.now()) => {
  const slug = label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'col'
  return `${slug}-${now.toString(36)}`
}

// Coluna nova no fim das colunas abertas (logo antes de "Concluído", que fica sempre por último),
// com a próxima cor da paleta.
export function buildColumn(label, columns, now = Date.now()) {
  const key = toColKey(label, now)
  return {
    id: `col-${key}`,
    key,
    label: label.trim(),
    position: columns.filter((c) => !LOCKED_COLUMN_KEYS.includes(c.key)).length,
    color: EXTRA_COLORS[columns.length % EXTRA_COLORS.length],
  }
}

// Última lista conhecida deste usuário (para pintar o Kanban antes da API responder).
export function readCachedColumns(storage, userId) {
  if (!userId) return DEFAULT_COLUMNS
  try {
    const saved = JSON.parse(storage.getItem(lsKey(userId)) || 'null')
    if (Array.isArray(saved) && saved.length > 0) return saved
  } catch { /* JSON inválido ou storage indisponível — usa o padrão */ }
  return DEFAULT_COLUMNS
}

export function writeCachedColumns(storage, userId, columns) {
  if (!userId) return
  try { storage.setItem(lsKey(userId), JSON.stringify(columns)) } catch { /* storage cheio/bloqueado */ }
}

// ── Edição de colunas ──────────────────────────────────────────────────────
// "Concluído" é fixa: dela depende o que o app entende por tarefa concluída.
export const LOCKED_COLUMN_KEYS = ['done']
export const isEditableColumn = (column) => !LOCKED_COLUMN_KEYS.includes(column.key)

export const MAX_COLUMN_LABEL = 40

// Cores oferecidas ao editar (a escolha livre fica a cargo do seletor nativo).
export const COLUMN_COLORS = ['#9ca3af', '#14b8c4', ...EXTRA_COLORS]

// Mensagem de erro (em português) ou null se a edição é válida.
export function validateColumnEdit({ label, color }) {
  if (!String(label ?? '').trim()) return 'Dê um nome à coluna.'
  if (label.trim().length > MAX_COLUMN_LABEL) return `O nome deve ter até ${MAX_COLUMN_LABEL} caracteres.`
  if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) return 'Escolha uma cor válida.'
  return null
}

// Nova lista com o nome/cor da coluna trocados (a original não é alterada).
export const applyColumnEdit = (columns, key, { label, color }) =>
  columns.map((c) => (c.key === key
    ? { ...c, ...(label !== undefined ? { label: label.trim() } : {}), ...(color ? { color } : {}) }
    : c))

// ── Excluir e reordenar ────────────────────────────────────────────────────
// Posições 0..n-1 na ordem dada, com as colunas fixas ("Concluído") sempre ao final.
export const renumberColumns = (columns) => {
  const movable = columns.filter(isEditableColumn)
  const locked = columns.filter((c) => !isEditableColumn(c))
  return [...movable, ...locked].map((c, position) => ({ ...c, position }))
}

// Excluir só vale para colunas editáveis, e sempre sobra ao menos uma além de "Concluído".
export const canDeleteColumn = (columns, key) => {
  const column = columns.find((c) => c.key === key)
  return Boolean(column) && isEditableColumn(column) && columns.filter(isEditableColumn).length > 1
}

// Colunas que podem receber as tarefas de uma coluna que vai sair ("Concluído" não entra,
// para ninguém concluir tarefas sem querer).
export const deletionTargets = (columns, key) =>
  columns.filter((c) => c.key !== key && isEditableColumn(c))

export const removeColumn = (columns, key) => renumberColumns(columns.filter((c) => c.key !== key))

// Move uma coluna editável uma casa (delta -1 = para a esquerda, +1 = para a direita).
// Devolve a lista como estava se não houver para onde ir.
export function moveColumn(columns, key, delta) {
  const movable = columns.filter(isEditableColumn)
  const from = movable.findIndex((c) => c.key === key)
  const to = from + delta
  if (from < 0 || to < 0 || to >= movable.length) return columns
  const next = [...movable]
  ;[next[from], next[to]] = [next[to], next[from]]
  return renumberColumns([...next, ...columns.filter((c) => !isEditableColumn(c))])
}

export const canMoveColumn = (columns, key, delta) => moveColumn(columns, key, delta) !== columns

// Coluna que recebe uma tarefa "reaberta" (saiu de Concluído): a primeira do quadro.
export const reopenColumnKey = (columns) => columns.find(isEditableColumn)?.key || 'todo'
