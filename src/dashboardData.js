// Contas do Painel principal: fatias do gráfico de rosca, agenda de hoje e nota
// rápida. Funções puras (datas como 'AAAA-MM-DD'), testadas em tests/dashboardData.test.js.

export const DONUT_RADIUS = 48
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

// Fatias do gráfico de rosca: { key, count, length, offset } — `length` e `offset`
// são medidas do traço do círculo (stroke-dasharray / -dashoffset). Sem tarefas,
// devolve lista vazia (a tela desenha só o anel cinza).
export function donutSegments(counts, order = ['done', 'doing', 'todo']) {
  const total = order.reduce((sum, key) => sum + (counts[key] || 0), 0)
  if (!total) return []
  let used = 0
  const segments = []
  for (const key of order) {
    const count = counts[key] || 0
    if (!count) continue
    const length = (count / total) * CIRCUMFERENCE
    segments.push({ key, count, length, offset: -used, circumference: CIRCUMFERENCE })
    used += length
  }
  return segments
}

const compareTime = (a, b) => {
  if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
  if (a.due_time) return -1
  if (b.due_time) return 1
  return (a.title || '').localeCompare(b.title || '')
}

// Tarefas abertas que acontecem hoje (hoje está entre o início e a data final),
// com horário primeiro. Tarefa de vários dias que já passou do prazo não entra.
export function todayAgenda(tasks, todayKey) {
  return tasks
    .filter((t) => {
      if (t.column_key === 'done' || !t.due_date) return false
      const end = t.due_date_end && t.due_date_end > t.due_date ? t.due_date_end : t.due_date
      return t.due_date <= todayKey && todayKey <= end
    })
    .sort(compareTime)
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Texto digitado na "nota rápida" → HTML do editor de notas (um <p> por linha,
// sempre escapado: nada do que a pessoa digita vira marcação).
export function quickNoteHtml(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}
