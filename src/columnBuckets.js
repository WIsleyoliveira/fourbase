// Contadores "a fazer / em andamento / concluídas" seguindo as colunas EDITADAS do quadro:
//   a fazer      = a primeira coluna aberta (antes de "Concluído"), com o nome e a cor dela
//   em andamento = as demais colunas abertas (uma só: o nome dela; várias: "Em andamento");
//                  `null` quando não há outra coluna
//   concluídas   = "Concluído"
// Mesma regra do servidor (api/_lib/columnBuckets.js). Testado em tests/columnBuckets.test.js.
import { isEditableColumn } from './columnCache.js'

const FALLBACK = {
  todo: { label: 'A fazer', color: '#4f8ff7' },
  doing: { label: 'Em progresso', color: '#f2a93b' },
  done: { label: 'Concluídas', color: '#2ec27e' },
}

export function columnBuckets(columns) {
  const list = [...(columns || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const open = list.filter(isEditableColumn)
  const doneColumn = list.find((c) => !isEditableColumn(c))
  const [first, ...others] = open
  let doing = null
  if (others.length === 1) doing = { label: others[0].label, color: others[0].color }
  else if (others.length > 1) doing = { label: 'Em andamento', color: others[0].color }
  return {
    firstKey: first?.key ?? 'todo',
    todo: first ? { label: first.label, color: first.color } : FALLBACK.todo,
    doing,
    done: { label: FALLBACK.done.label, color: doneColumn?.color || FALLBACK.done.color },
  }
}

export const bucketOf = (columnKey, buckets) =>
  (columnKey === 'done' ? 'done' : columnKey === buckets.firstKey ? 'todo' : 'doing')

// { todo, doing, done } — quantas tarefas em cada grupo.
export function countByBucket(tasks, buckets) {
  const counts = { todo: 0, doing: 0, done: 0 }
  for (const t of tasks) counts[bucketOf(t.column_key, buckets)] += 1
  return counts
}
