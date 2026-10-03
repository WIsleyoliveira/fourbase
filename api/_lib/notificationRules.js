// Regras puras de notificação: sem banco, sem relógio implícito (exceto o
// padrão de `now` em resolveToday). Datas são strings ISO 'AAAA-MM-DD' e toda a
// aritmética é em UTC (Date.UTC), nunca `new Date('AAAA-MM-DD')` com fuso local.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Converte 'AAAA-MM-DD' em dias desde a época; null se não for data de calendário válida.
const toDayNumber = (iso) => {
  if (typeof iso !== 'string') return null
  const m = ISO_RE.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(y, mo - 1, d)
  const back = new Date(ms)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null
  }
  return ms / 86400000
}

const fromDayNumber = (n) => new Date(n * 86400000).toISOString().slice(0, 10)

export const addDays = (isoDate, days) => {
  const n = toDayNumber(isoDate)
  if (n === null) throw new Error('Data inválida: ' + isoDate)
  return fromDayNumber(n + days)
}

// Data do servidor (UTC) em AAAA-MM-DD; aceita a do navegador só se válida e a ±1 dia.
export const resolveToday = (candidate, now = new Date()) => {
  const server = now.toISOString().slice(0, 10)
  const c = toDayNumber(candidate)
  if (c === null) return server
  const s = toDayNumber(server)
  return Math.abs(c - s) <= 1 ? candidate : server
}

// Quem deve ser avisado numa criação (before = null) ou edição de tarefa.
export const diffTaskNotifications = (before, after, actorId, activeMemberIds) => {
  const out = []
  const sent = new Set()
  const ok = (id) => id && id !== actorId && activeMemberIds.has(id)

  const assignee = after.assigned_to
  if ((!before || before.assigned_to !== assignee) && ok(assignee)) {
    out.push({ user_id: assignee, kind: 'assignment' })
    sent.add(assignee)
  }

  const prev = new Set((before && before.mentioned_users) || [])
  for (const id of after.mentioned_users || []) {
    if (prev.has(id) || sent.has(id) || !ok(id)) continue
    out.push({ user_id: id, kind: 'mention' })
    sent.add(id)
  }
  return out
}

// Avisos de prazo para as tarefas (já filtradas por responsável pelo chamador).
export const dueNotifications = (tasks, today) => {
  const t = toDayNumber(today)
  if (t === null) return []
  const out = []
  for (const task of tasks) {
    if (task.column_key === 'done') continue
    const due = task.due_date_end || task.due_date
    const d = toDayNumber(due)
    if (d === null) continue
    let kind = null
    if (d === t || d === t + 1) kind = 'due_soon'
    else if (d < t && t - d <= 7) kind = 'overdue'
    if (!kind) continue
    out.push({
      task_id: task.id,
      title: task.title,
      kind,
      due_date: due,
      dedupe_key: `${kind}:${task.id}:${due}`,
    })
  }
  return out
}

// Gestor, responsável, mencionado, ou qualquer membro se a tarefa tem cliente.
export const canViewTask = (task, user) => {
  if (user.role === 'gestor') return true
  if (task.assigned_to === user.id) return true
  if ((task.mentioned_users || []).includes(user.id)) return true
  return Boolean(task.client_id)
}
