// Rascunho do formulário "nova tarefa" do Kanban: estado inicial, dependências
// entre campos, validação e montagem do corpo enviado à API. Funções puras,
// testadas em tests/newTaskForm.test.js. As regras espelham as do servidor
// (api/_lib/routes/tasks.js) e do modal de tarefa, para o erro aparecer antes.

export const DEFAULT_PRIORITY = 'Média'

export const emptyDraft = ({ assignedTo = '', columnKey = 'todo', priority = DEFAULT_PRIORITY } = {}) => ({
  title: '',
  description: '',
  priority,
  columnKey,
  dueDate: '',
  dueDateEnd: '',
  dueTime: '',
  dueTimeEnd: '',
  assignedTo,
  clientId: '',
  tags: [],
  mentioned: [],
  attachments: [],
})

// Troca um campo mantendo os dependentes coerentes:
//  - sem prazo não há data final nem horário; sem horário de início não há horário final;
//  - se o início passa a ser depois da data final, a data final acompanha.
export function setDraftField(draft, field, value) {
  const next = { ...draft, [field]: value }
  if (field === 'dueDate') {
    if (!value) {
      next.dueDateEnd = ''
      next.dueTime = ''
      next.dueTimeEnd = ''
    } else if (next.dueDateEnd && next.dueDateEnd < value) {
      next.dueDateEnd = value
    }
  }
  if (field === 'dueTime' && !value) next.dueTimeEnd = ''
  return next
}

// Mensagem de erro (em português) ou null se o rascunho pode ser enviado.
export function validateDraft(draft) {
  if (!draft.title.trim()) return 'Informe o título da tarefa.'
  if (draft.dueDate && draft.dueDateEnd && draft.dueDateEnd < draft.dueDate) {
    return 'A data final não pode ser antes da data de início.'
  }
  if (draft.dueTimeEnd && !draft.dueTime) return 'Defina o horário de início antes do horário final.'
  const sameDay = !draft.dueDateEnd || draft.dueDateEnd === draft.dueDate
  if (sameDay && draft.dueTime && draft.dueTimeEnd && draft.dueTimeEnd < draft.dueTime) {
    return 'O horário final não pode ser antes do horário de início.'
  }
  return null
}

// Corpo do POST /api/tasks — mesmo formato que o modal de tarefa envia.
// `forcedClientId`: o quadro de um cliente vincula tudo a ele, seja qual for a escolha.
// Só gestor escolhe o responsável (o servidor ignora para os demais).
export function buildTaskFields(draft, { isGestor, forcedClientId } = {}) {
  const hasDate = Boolean(draft.dueDate)
  const hasTime = hasDate && Boolean(draft.dueTime)
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority || DEFAULT_PRIORITY,
    column_key: draft.columnKey || 'todo',
    due_date: hasDate ? draft.dueDate : null,
    due_date_end: hasDate ? (draft.dueDateEnd || null) : null,
    due_time: hasTime ? draft.dueTime : null,
    due_time_end: hasTime ? (draft.dueTimeEnd || null) : null,
    assigned_to: isGestor && draft.assignedTo ? draft.assignedTo : undefined,
    client_id: forcedClientId || draft.clientId || null,
    tags: draft.tags,
    mentioned_users: draft.mentioned,
    attachments: draft.attachments,
  }
}

// Quantos campos das "Opções avançadas" foram mexidos (para o contador no botão).
// `defaults`: valores iniciais de prioridade, coluna e responsável.
export function countAdvanced(draft, defaults) {
  const checks = [
    draft.priority !== (defaults.priority ?? DEFAULT_PRIORITY),
    draft.columnKey !== defaults.columnKey,
    draft.assignedTo !== defaults.assignedTo,
    Boolean(draft.clientId),
    Boolean(draft.dueDate),
    Boolean(draft.dueDateEnd),
    Boolean(draft.dueTime),
    Boolean(draft.dueTimeEnd),
    draft.mentioned.length > 0,
    draft.tags.length > 0,
    draft.attachments.length > 0,
    Boolean(draft.description.trim()),
  ]
  return checks.filter(Boolean).length
}
