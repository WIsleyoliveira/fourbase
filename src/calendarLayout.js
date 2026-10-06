// Layout das tarefas na grade mensal do Calendário: cada semana é uma linha de
// 7 colunas; tarefas de vários dias viram UMA faixa contínua (como no Google
// Agenda) em vez de um cartão por dia, e cada dia mostra no máximo `maxLanes`
// itens — o resto vira "+N mais". Funções puras sobre datas 'AAAA-MM-DD'
// (comparar texto evita problemas de fuso), testadas em tests/calendarLayout.test.js.

export const MAX_LANES = 3

// Último dia da tarefa: due_date_end, ou o próprio due_date se não houver/for inválido.
export const taskEnd = (task) =>
  task.due_date_end && task.due_date_end > task.due_date ? task.due_date_end : task.due_date

export const isMultiDay = (task) => Boolean(task.due_date) && taskEnd(task) > task.due_date

// Ordem dentro de um dia: com horário primeiro (por hora), depois por título.
export const compareWithinDay = (a, b) => {
  if (a.due_time && b.due_time) {
    const byTime = a.due_time.localeCompare(b.due_time)
    if (byTime) return byTime
  } else if (a.due_time) return -1
  else if (b.due_time) return 1
  return (a.title || '').localeCompare(b.title || '')
}

/**
 * Posiciona as tarefas de uma semana.
 * @param {string[]} weekKeys os 7 dias da semana ('AAAA-MM-DD')
 * @param {object[]} tasks tarefas (qualquer uma; as que não tocam a semana são ignoradas)
 * @returns {{ segments, hidden }}
 *   segments: [{ task, col (0–6), span, lane (0…maxLanes-1), startsHere, endsHere }]
 *     startsHere/endsHere = a faixa começa/termina nesta semana (senão continua de/para outra).
 *   hidden: number[7] — quantas tarefas ficaram de fora em cada dia.
 */
export function layoutWeek(weekKeys, tasks, maxLanes = MAX_LANES) {
  const first = weekKeys[0]
  const last = weekKeys[weekKeys.length - 1]
  const items = []
  for (const task of tasks) {
    if (!task.due_date) continue
    const start = task.due_date
    const end = taskEnd(task)
    if (end < first || start > last) continue
    const col = weekKeys.indexOf(start < first ? first : start)
    const endCol = weekKeys.indexOf(end > last ? last : end)
    items.push({
      task,
      col,
      span: endCol - col + 1,
      startsHere: start >= first,
      endsHere: end <= last,
      multi: end > start,
    })
  }
  // Faixas de vários dias primeiro (mais à esquerda e mais longas antes), depois os de um dia.
  items.sort((a, b) =>
    (Number(b.multi) - Number(a.multi))
    || (a.col - b.col)
    || (b.span - a.span)
    || compareWithinDay(a.task, b.task))

  const busy = [] // busy[lane][col] = true
  const segments = []
  const hidden = weekKeys.map(() => 0)
  for (const item of items) {
    let lane = 0
    while (lane < maxLanes && busy[lane]?.slice(item.col, item.col + item.span).some(Boolean)) lane++
    if (lane >= maxLanes) {
      for (let c = item.col; c < item.col + item.span; c++) hidden[c] += 1
      continue
    }
    busy[lane] = busy[lane] || []
    for (let c = item.col; c < item.col + item.span; c++) busy[lane][c] = true
    segments.push({ task: item.task, col: item.col, span: item.span, lane, startsHere: item.startsHere, endsHere: item.endsHere })
  }
  return { segments, hidden }
}

// Texto do tooltip de uma tarefa na grade (título, responsável, prazo, horário).
export function taskTooltip(task, assigneeName, formatDate) {
  const lines = [task.title]
  if (assigneeName) lines.push(`Responsável: ${assigneeName}`)
  if (task.due_date) {
    const end = taskEnd(task)
    lines.push(`Prazo: ${formatDate(task.due_date)}${end > task.due_date ? ` – ${formatDate(end)}` : ''}`)
  }
  if (task.due_time) {
    lines.push(`Horário: ${task.due_time.slice(0, 5)}${task.due_time_end ? `–${task.due_time_end.slice(0, 5)}` : ''}`)
  }
  return lines.join('\n')
}
