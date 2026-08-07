// Sistema de código de cores por RESPONSÁVEL (assignee).
//
// Cada pessoa da equipe recebe uma cor única e estável, derivada do seu id.
// A cor é usada nas visualizações (Kanban, Painel, Calendário) para identificar
// visualmente de quem é a tarefa — substituindo o antigo uso de cores por
// prioridade (que agora é estritamente em escala de cinza).

// Paleta de cores distintas e legíveis (fundo escuro o suficiente para texto branco).
const ASSIGNEE_PALETTE = [
  '#e11d48', // rose
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#d97706', // amber
  '#059669', // emerald
  '#db2777', // pink
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#ea580c', // orange
  '#65a30d', // lime
  '#0891b2', // cyan
  '#9333ea', // purple
]

// Cor neutra para tarefas sem responsável definido.
const NO_ASSIGNEE_COLOR = '#94a3b8'

// Hash determinístico simples (djb2-ish) — mesma entrada sempre gera a mesma cor.
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Retorna a cor associada a um responsável (por id). Se `overrideColor` for
// informado (cor escolhida manualmente no cadastro do membro/cliente), ela
// prevalece sobre a cor automática gerada por hash.
export function assigneeColor(id, overrideColor) {
  if (overrideColor) return overrideColor
  if (!id) return NO_ASSIGNEE_COLOR
  return ASSIGNEE_PALETTE[hashString(String(id)) % ASSIGNEE_PALETTE.length]
}

// Variante para os pontos do código onde só se tem o id (ex: task.assigned_to)
// e uma lista de membros/clientes à mão — busca a cor personalizada, se houver.
export function memberColor(id, list = []) {
  return assigneeColor(id, list.find((m) => m.id === id)?.color)
}
