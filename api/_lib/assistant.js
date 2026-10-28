// Lógica pura do assistente (ChatGPT): tokens, validação de tarefas em lote, conflitos e o contrato
// OpenAPI. Sem banco aqui — as rotas (routes/assistant.js) fazem o acesso aos dados.
import { createHash, randomBytes } from 'node:crypto'

export const TOKEN_PREFIX = 'fbk_'
export const MAX_BATCH = 30
export const MAX_ACTIVE_TOKENS = 5
export const MAX_AGENDA_DAYS = 62
export const MAX_AGENDA_ITEMS = 200
export const UNDO_WINDOW_MS = 48 * 60 * 60 * 1000
export const ASSISTANT_TAG = { name: 'ChatGPT', color: '#10a37f' }
export const SCOPES = ['agenda:read', 'agenda:write']

export const generateToken = () => TOKEN_PREFIX + randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
export const tokenPrefixOf = (token) => token.slice(0, TOKEN_PREFIX.length + 6)
export const isTokenShape = (value) => typeof value === 'string' && /^fbk_[A-Za-z0-9_-]{40,60}$/.test(value)

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export const isDate = (v) => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
export const isTime = (v) => typeof v === 'string' && TIME_RE.test(v)
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

const PRIORITIES = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

// Resolve o cliente por id ou por nome (sem acento/caixa; só vale se for único).
export function resolveClient(item, clients) {
  if (item.client_id) {
    const c = clients.find((x) => x.id === item.client_id)
    return c ? { id: c.id } : { error: 'cliente não encontrado' }
  }
  if (item.client_name) {
    const hits = clients.filter((x) => norm(x.name) === norm(item.client_name))
    if (hits.length === 1) return { id: hits[0].id }
    if (hits.length > 1) return { error: `há mais de um cliente chamado "${item.client_name}" — use o client_id` }
    return { error: `cliente "${item.client_name}" não encontrado` }
  }
  return { id: null }
}

// Valida e normaliza UMA tarefa do lote. Devolve { task } ou { errors: [...] }.
export function normalizeTaskInput(item, { clients = [], today }) {
  const errors = []
  if (!item || typeof item !== 'object') return { errors: ['item inválido'] }
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (!title) errors.push('título obrigatório')
  else if (title.length > 200) errors.push('título passa de 200 caracteres')

  let description = ''
  if (item.description != null) {
    if (typeof item.description !== 'string') errors.push('descrição deve ser texto')
    else description = item.description.trim()
  }
  if (description.length > 2000) errors.push('descrição passa de 2000 caracteres')

  let priority = 'Média'
  if (item.priority != null && item.priority !== '') {
    priority = PRIORITIES[norm(item.priority)]
    if (!priority) errors.push('prioridade deve ser Baixa, Média, Alta ou Urgente')
  }

  const due_date = item.due_date ?? null
  const due_date_end = item.due_date_end ?? null
  const due_time = item.due_time ?? null
  const due_time_end = item.due_time_end ?? null
  if (due_date != null) {
    if (!isDate(due_date)) errors.push('due_date deve ser AAAA-MM-DD')
    else if (today) {
      const d = daysBetween(today, due_date)
      if (d < -30 || d > 400) errors.push('due_date fora do intervalo aceito (30 dias atrás até 400 dias à frente)')
    }
  }
  if (due_date_end != null) {
    if (!isDate(due_date_end)) errors.push('due_date_end deve ser AAAA-MM-DD')
    else if (!due_date) errors.push('due_date_end exige due_date')
    else if (isDate(due_date) && due_date_end < due_date) errors.push('a data final não pode ser antes da inicial')
    else if (isDate(due_date) && daysBetween(due_date, due_date_end) > 60) errors.push('intervalo de datas passa de 60 dias')
  }
  if (due_time != null) {
    if (!isTime(due_time)) errors.push('due_time deve ser HH:MM')
    else if (!due_date) errors.push('due_time exige due_date')
  }
  if (due_time_end != null) {
    if (!isTime(due_time_end)) errors.push('due_time_end deve ser HH:MM')
    else if (!due_time) errors.push('due_time_end exige due_time')
    else if (isTime(due_time) && (!due_date_end || due_date_end === due_date) && due_time_end < due_time) {
      errors.push('o horário final não pode ser antes do inicial')
    }
  }

  const client = resolveClient(item, clients)
  if (client.error) errors.push(client.error)

  if (errors.length) return { errors }
  return {
    task: {
      title, description, priority, due_date,
      due_date_end: due_date ? due_date_end : null,
      due_time: due_date ? due_time : null,
      due_time_end: due_date && due_time ? due_time_end : null,
      client_id: client.id,
    },
  }
}

// Intervalo ocupado por uma tarefa com horário num dia (sem fim = 60 min).
function slotOf(t) {
  if (!t.due_date || !t.due_time) return null
  const start = toMin(t.due_time)
  const sameDay = !t.due_date_end || t.due_date_end === t.due_date
  const end = t.due_time_end && sameDay ? Math.max(toMin(t.due_time_end), start + 1) : start + 60
  return { date: t.due_date, start, end }
}

// Conflitos de horário entre as tarefas novas e a agenda existente (e entre as próprias novas).
export function findConflicts(newTasks, existing) {
  const out = []
  newTasks.forEach((n, i) => {
    const a = slotOf(n)
    if (!a) return
    existing.forEach((e) => {
      const b = slotOf(e)
      if (b && b.date === a.date && a.start < b.end && b.start < a.end) {
        out.push({ index: i, with: { id: e.id, title: e.title, due_date: e.due_date, due_time: hhmm(e.due_time) } })
      }
    })
    for (let j = 0; j < i; j++) {
      const b = slotOf(newTasks[j])
      if (b && b.date === a.date && a.start < b.end && b.start < a.end) {
        out.push({ index: i, with_index: j, with: { title: newTasks[j].title, due_date: newTasks[j].due_date, due_time: newTasks[j].due_time } })
      }
    }
  })
  return out
}

// Postgres devolve colunas `time` como "10:00:00"; o contrato do assistente usa sempre "HH:MM".
export const hhmm = (t) => (typeof t === 'string' && t.length >= 5 ? t.slice(0, 5) : t ?? null)

// Já existe tarefa com o mesmo título, data e horário?
export function findDuplicates(newTasks, existing) {
  const out = []
  newTasks.forEach((n, i) => {
    const hit = existing.find((e) => norm(e.title) === norm(n.title) && e.due_date === n.due_date && hhmm(e.due_time) === hhmm(n.due_time))
    if (hit) out.push({ index: i, existing_id: hit.id })
  })
  return out
}

export const isValidBatchId = (v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{8,80}$/.test(v)

// ---- Contrato OpenAPI (GPT Actions) ----
export function buildOpenApi(baseUrl) {
  const taskItem = {
    type: 'object', required: ['title'],
    properties: {
      title: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      priority: { type: 'string', enum: ['Baixa', 'Média', 'Alta', 'Urgente'], default: 'Média' },
      due_date: { type: 'string', format: 'date', description: 'AAAA-MM-DD (fuso de Brasília)' },
      due_date_end: { type: 'string', format: 'date', description: 'Só para tarefas de vários dias' },
      due_time: { type: 'string', example: '09:00', description: 'HH:MM, exige due_date' },
      due_time_end: { type: 'string', example: '10:30', description: 'HH:MM, exige due_time' },
      client_name: { type: 'string', description: 'Nome de um cliente já cadastrado (veja listarClientes)' },
      client_id: { type: 'string', description: 'Alternativa ao client_name' },
    },
  }
  const batchBody = {
    required: true,
    content: { 'application/json': { schema: {
      type: 'object', required: ['batch_id', 'tasks'],
      properties: {
        batch_id: { type: 'string', description: 'Identificador único deste lote (8 a 80 caracteres). Repetir o mesmo não duplica as tarefas.' },
        tasks: { type: 'array', maxItems: MAX_BATCH, items: taskItem },
      },
    } } },
  }
  const ok = (description) => ({ 200: { description } })
  return {
    openapi: '3.1.0',
    info: { title: 'fourbase — Agenda', version: '1.0.0', description: 'Consulta a agenda do usuário e cria tarefas no calendário do fourbase.' },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths: {
      '/api/assistant/agenda': { get: {
        operationId: 'verAgenda', summary: 'Ver as tarefas do usuário num período (máx. 62 dias)',
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ], responses: ok('Tarefas do período'),
      } },
      '/api/assistant/clients': { get: { operationId: 'listarClientes', summary: 'Listar os clientes cadastrados', responses: ok('Clientes') } },
      '/api/assistant/tasks/preview': { post: {
        operationId: 'prever', summary: 'Validar um lote SEM criar nada; aponta erros, conflitos de horário e duplicatas',
        requestBody: batchBody, responses: ok('Prévia'),
      } },
      '/api/assistant/tasks': { post: {
        operationId: 'criarTarefas', summary: 'Criar um lote de tarefas (só depois do usuário confirmar a lista)',
        requestBody: batchBody, responses: { 201: { description: 'Criadas' }, 200: { description: 'Lote já criado antes (idempotente)' } },
      } },
      '/api/assistant/batches/{batchId}/undo': { post: {
        operationId: 'desfazerLote', summary: 'Desfazer um lote criado nas últimas 48 horas',
        parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }], responses: ok('Desfeito'),
      } },
    },
  }
}
