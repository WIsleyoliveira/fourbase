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
export const DEFAULT_TOKEN_DAYS = 365
export const TIMEZONE = 'America/Sao_Paulo'
// Versão do aviso de privacidade da tela Assistente. O gestor autoriza ESTA versão ao criar a chave;
// se o texto mudar, suba a versão aqui e em src/assistant/notice.js (um teste confere que são iguais).
export const NOTICE_VERSION = '2026-11-01'

// Liberação por empresa (ASSISTANT_WORKSPACE_IDS): vazio = ninguém; "*" = todas; senão, lista de ids
// separados por vírgula. Fechado por padrão: abrir para outra empresa exige política de privacidade e
// termos publicados (fase B — docs/assistente-chatgpt.md).
export function assistantEnabledFor(workspaceId, setting = process.env.ASSISTANT_WORKSPACE_IDS) {
  const list = String(setting || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.includes('*')) return true
  return !!workspaceId && list.includes(workspaceId)
}

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

// "Hoje" no fuso de Brasília (AAAA-MM-DD). O servidor roda em UTC: depois das 21h ele já estaria no dia seguinte.
export const todayIn = (timeZone = TIMEZONE, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

// ---- Lotes: retrato das tarefas e desfazer seguro ----
// Impressão digital dos campos que uma pessoa pode editar. Postgres não atualiza updated_at das tarefas
// (não há trigger), então é o único jeito de saber se alguém mexeu numa tarefa criada pelo assistente.
const sortedList = (v) => (Array.isArray(v) ? v.map(String).sort() : [])
export function taskFingerprint(t) {
  const canon = [
    t.title ?? '', t.description ?? '', t.priority ?? '',
    t.due_date ?? null, t.due_date_end ?? null, hhmm(t.due_time) ?? null, hhmm(t.due_time_end) ?? null,
    t.column_key ?? null, t.assigned_to ?? null, t.client_id ?? null,
    sortedList(t.tags), sortedList(t.mentioned_users), sortedList(t.attachments), Number(t.logged_time_seconds) || 0,
  ]
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex').slice(0, 32)
}

// Retrato guardado no lote: só id, impressão digital e datas — nunca título nem descrição.
export const batchItemOf = (t) => ({ id: t.id, fp: taskFingerprint(t), due_date: t.due_date ?? null, due_date_end: t.due_date_end ?? null })

// Por que uma tarefa do lote fica (precedência: concluída > reatribuída > movida > editada).
export function keepReason(item, task, { userId, firstColumn }) {
  if (task.column_key === 'done') return 'done'
  if (task.assigned_to !== userId) return 'reassigned'
  if (!item.fp) return 'edited' // lote sem retrato (versão antiga): na dúvida, não apaga
  if (taskFingerprint(task) === item.fp) return null
  if (firstColumn && task.column_key !== firstColumn) return 'moved'
  return 'edited'
}

export const undoDeadline = (batch) => new Date(Date.parse(batch.created_at) + UNDO_WINDOW_MS).toISOString()

const itemsOf = (batch) => (Array.isArray(batch.items) && batch.items.length ? batch.items : (batch.task_ids || []).map((id) => ({ id })))

// Regra única do desfazer (porta do GPT e porta da tela). currentTasks = tarefas do lote que ainda existem.
// onlyIds (tela) limita ao que o usuário viu na prévia: nunca remove mais do que ele confirmou.
export function planUndo(batch, currentTasks, { userId, firstColumn, now = Date.now(), onlyIds = null } = {}) {
  if (batch.undone_at) return { already_undone: true, remove: [], keep: [], gone: 0 }
  if (now - Date.parse(batch.created_at) > UNDO_WINDOW_MS) return { expired: true, remove: [], keep: [], gone: 0 }
  const byId = new Map(currentTasks.map((t) => [t.id, t]))
  const allow = onlyIds ? new Set(onlyIds) : null
  const remove = []
  const keep = []
  let gone = 0
  for (const item of itemsOf(batch)) {
    const task = byId.get(item.id)
    if (!task) { gone += 1; continue }
    const reason = keepReason(item, task, { userId, firstColumn })
    const view = { id: task.id, title: task.title, due_date: task.due_date ?? null }
    if (reason) keep.push({ ...view, reason })
    else if (allow && !allow.has(task.id)) keep.push({ ...view, reason: 'not_confirmed' })
    else remove.push(view)
  }
  return { remove, keep, gone }
}

// Resumo de um lote para o histórico (as duas portas). Títulos vêm das tarefas que ainda existem.
export function toBatchView(batch, currentTasks = [], now = Date.now()) {
  const items = itemsOf(batch)
  const byId = new Map(currentTasks.map((t) => [t.id, t]))
  const dates = items.flatMap((i) => [i.due_date, i.due_date_end]).filter(Boolean).sort()
  const open = !batch.undone_at && now - Date.parse(batch.created_at) <= UNDO_WINDOW_MS
  return {
    batch_id: batch.batch_id,
    created_at: batch.created_at,
    count: items.length,
    titles: items.map((i) => byId.get(i.id)?.title).filter(Boolean).slice(0, 5),
    date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    undone_at: batch.undone_at ?? null,
    undo_until: open ? undoDeadline(batch) : null,
    // depois de desfeito: quantas saíram e quantas ficaram (porque alguém mexeu)
    undo_result: batch.undone_at
      ? { removed: items.filter((i) => i.result === 'removed').length, kept: items.filter((i) => String(i.result || '').startsWith('kept_')).length }
      : null,
  }
}

// ---- Contrato OpenAPI (GPT Actions) ----
// Só cresce: nenhum operationId é renomeado. x-openai-isConsequential: true faz o ChatGPT pedir "Permitir"
// a cada escrita (é a confirmação do usuário); leituras ficam false.
export function buildOpenApi(baseUrl) {
  const taskItem = {
    type: 'object', required: ['title'],
    properties: {
      title: { type: 'string', maxLength: 200, description: 'Título curto; detalhes vão na descrição' },
      description: { type: 'string', maxLength: 2000 },
      priority: { type: 'string', enum: ['Baixa', 'Média', 'Alta', 'Urgente'], default: 'Média' },
      due_date: { type: 'string', format: 'date', description: 'AAAA-MM-DD (fuso de Brasília)' },
      due_date_end: { type: 'string', format: 'date', description: 'Só para tarefas de vários dias' },
      due_time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '09:00', description: 'HH:MM, exige due_date' },
      due_time_end: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '10:30', description: 'HH:MM, exige due_time' },
      client_name: { type: 'string', description: 'Nome de um cliente já cadastrado (veja listarClientes); nunca invente' },
      client_id: { type: 'string', description: 'Alternativa ao client_name' },
    },
  }
  const batchBody = {
    required: true,
    content: { 'application/json': { schema: {
      type: 'object', required: ['batch_id', 'tasks'],
      properties: {
        batch_id: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{8,80}$', description: 'Código único deste lote (ex.: gpt-20261102-0930-a1b2). Ao repetir uma chamada que falhou, use o MESMO código: não duplica.' },
        tasks: { type: 'array', minItems: 1, maxItems: MAX_BATCH, items: taskItem },
      },
    } } },
  }
  const json = (description, schema) => ({ description, content: { 'application/json': { schema } } })
  const errorRef = { $ref: '#/components/schemas/Error' }
  const errors = {
    400: json('Dados inválidos: nada foi feito; veja details', errorRef),
    401: json('Conexão desligada ou chave inválida', errorRef),
    429: json('Muitas chamadas; espere 1 minuto', errorRef),
  }
  const read = { 'x-openai-isConsequential': false }
  const write = { 'x-openai-isConsequential': true }
  return {
    openapi: '3.1.0',
    info: { title: 'fourbase — Agenda', version: '1.1.0', description: 'Consulta a agenda do usuário e cria tarefas no calendário do fourbase. Datas no fuso de Brasília; "today" nas respostas é a data de hoje.' },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } },
        UndoResult: {
          type: 'object',
          properties: {
            undone: { type: 'integer', description: 'Quantas tarefas foram removidas agora' },
            removed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } } },
            kept: { type: 'array', description: 'Tarefas mantidas porque alguém já mexeu nelas', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string', enum: ['edited', 'moved', 'done', 'reassigned'] } } } },
            gone: { type: 'integer', description: 'Já tinham sido apagadas' },
            already_undone: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearer: [] }],
    paths: {
      '/api/assistant/me': { get: {
        operationId: 'verificarConexao', summary: 'Confirmar a conexão e saber a data de hoje e os limites',
        description: 'Use na primeira mensagem da conversa.', ...read,
        responses: { 200: json('Conectado', { type: 'object', properties: { user_name: { type: 'string' }, workspace_name: { type: 'string' }, today: { type: 'string', format: 'date' }, timezone: { type: 'string' } } }), ...errors },
      } },
      '/api/assistant/agenda': { get: {
        operationId: 'verAgenda', summary: 'Ver as tarefas do usuário num período (máx. 62 dias)', ...read,
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: json('Tarefas do período, com today e timezone', { type: 'object' }), ...errors },
      } },
      '/api/assistant/clients': { get: {
        operationId: 'listarClientes', summary: 'Listar os clientes cadastrados', ...read,
        responses: { 200: json('Clientes', { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }), ...errors },
      } },
      '/api/assistant/tasks/preview': { post: {
        operationId: 'prever', summary: 'Conferir um lote SEM criar nada: aponta erros, choques de horário e tarefas repetidas', ...read,
        requestBody: batchBody, responses: { 200: json('Prévia', { type: 'object' }), ...errors },
      } },
      '/api/assistant/tasks': { post: {
        operationId: 'criarTarefas', summary: 'Criar um lote de tarefas para o usuário',
        description: 'Só depois de mostrar a lista ao usuário. Ao repetir uma chamada que falhou, use o mesmo batch_id. A resposta traz undo_until (prazo para desfazer).', ...write,
        requestBody: batchBody,
        responses: { 201: json('Criadas', { type: 'object' }), 200: json('Lote já criado antes (nada duplicado)', { type: 'object' }), 409: json('Lote desfeito ou em processamento', errorRef), ...errors },
      } },
      '/api/assistant/batches': { get: {
        operationId: 'listarLotes', summary: 'Ver os últimos lotes criados pelo assistente (para desfazer o certo)', ...read,
        parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }],
        responses: { 200: json('Lotes, mais recentes primeiro', { type: 'object' }), ...errors },
      } },
      '/api/assistant/batches/{batchId}/undo': { post: {
        operationId: 'desfazerLote', summary: 'Desfazer um lote criado nas últimas 48 horas',
        description: 'Só quando o usuário pedir. Tarefas já editadas, concluídas, movidas ou reatribuídas são mantidas e voltam em kept.', ...write,
        parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json('Resultado', { $ref: '#/components/schemas/UndoResult' }), 404: json('Lote não encontrado', errorRef), ...errors },
      } },
    },
  }
}
