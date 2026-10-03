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

// Coluna nova ao final da lista, com a próxima cor da paleta.
export function buildColumn(label, columns, now = Date.now()) {
  const key = toColKey(label, now)
  return {
    id: `col-${key}`,
    key,
    label: label.trim(),
    position: columns.length,
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
