// Texto das notificações do sino. Funções puras, testadas em
// tests/notificationText.test.js.

const DAY_MS = 24 * 60 * 60 * 1000

// Dias corridos entre duas datas 'AAAA-MM-DD' (b - a), via Date.UTC para não
// depender do fuso nem do horário de verão.
function dayDiff(a, b) {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS)
}

const cleanTitle = (title) => String(title ?? '').replace(/\s+/g, ' ').trim()

export function notificationText(n, members, today) {
  const title = `“${cleanTitle(n.title)}”`
  if (n.kind === 'mention' || n.kind === 'assignment') {
    const author = (members || []).find((m) => m.id === n.actor_id)?.name || 'Alguém'
    return n.kind === 'mention'
      ? `${author} mencionou você em ${title}`
      : `${author} atribuiu a você ${title}`
  }

  const due = n.meta?.due_date
  if (!due) return title
  const diff = dayDiff(today, due) // > 0: no futuro; < 0: atrasada
  if (diff === 0) return `${title} vence hoje`
  if (diff === 1) return `${title} vence amanhã`
  if (diff < 0) {
    const days = -diff
    return `${title} está atrasada há ${days} ${days === 1 ? 'dia' : 'dias'}`
  }
  return title
}

// Tempo decorrido desde `iso`: agora, há N min, há N h, ontem, há N dias.
export function relativeTime(iso, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (!(minutes >= 1)) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

// Data de hoje ('AAAA-MM-DD') no fuso do navegador (não UTC).
export function localToday(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
