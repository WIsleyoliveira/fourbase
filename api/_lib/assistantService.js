// Operações do Assistente (ChatGPT), sem HTTP: usadas pela API REST (/api/assistant/*) e pelo servidor MCP
// (/api/mcp) — as duas portas do ChatGPT seguem EXATAMENTE as mesmas regras. Cada operação recebe o contexto
// ctx = { user: { id, name, workspace_id }, token: <linha de fourbase_api_tokens> } e devolve
// { status, body, activity }: activity são metadados da chamada (nunca título nem descrição).
import { supabase } from './supabase.js'
import { resolveColumnKey, workspaceColumnKeys } from './columnKeys.js'
import {
  ASSISTANT_TAG, MAX_AGENDA_DAYS, MAX_AGENDA_ITEMS, MAX_BATCH, TIMEZONE, UNDO_WINDOW_MS,
  batchItemOf, daysBetween, findConflicts, findDuplicates, hhmm, isDate, isValidBatchId, normalizeTaskInput,
  planUndo, toBatchView, todayIn, undoDeadline,
} from './assistant.js'

export const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '')

export const taskView = (t, labels = {}) => ({
  id: t.id, title: t.title, description: t.description || '', priority: t.priority,
  due_date: t.due_date, due_date_end: t.due_date_end, due_time: hhmm(t.due_time), due_time_end: hhmm(t.due_time_end),
  status: labels[t.column_key] || t.column_key, client_id: t.client_id, tags: t.tags || [],
})
const clock = () => ({ today: todayIn(), timezone: TIMEZONE })

// ---------- leitura de dados ----------
async function myTasks(ctx) {
  const { data, error } = await supabase
    .from('fourbase_tasks').select('*')
    .eq('workspace_id', ctx.user.workspace_id).eq('assigned_to', ctx.user.id)
  if (error) throw error
  return data || []
}

export async function loadBatch(userId, workspaceId, batchId) {
  if (!isValidBatchId(batchId)) return null
  const { data } = await supabase.from('fourbase_assistant_batches').select('*')
    .eq('user_id', userId).eq('workspace_id', workspaceId).eq('batch_id', batchId).maybeSingle()
  return data
}

export const batchTaskIds = (b) => (Array.isArray(b.items) && b.items.length ? b.items.map((i) => i.id) : b.task_ids || [])

export async function tasksByIds(ids, workspaceId) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('fourbase_tasks').select('*').in('id', ids).eq('workspace_id', workspaceId)
  if (error) throw error
  return data || []
}

export async function listBatches(userId, workspaceId, { limit, before } = {}) {
  const { data, error } = await supabase.from('fourbase_assistant_batches').select('*')
    .eq('user_id', userId).eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const all = (data || []).filter((b) => !before || b.created_at < before)
  const page = all.slice(0, limit)
  const tasks = await tasksByIds([...new Set(page.flatMap(batchTaskIds))], workspaceId)
  return { page, tasks, hasMore: all.length > page.length }
}

async function firstColumnOf(workspaceId) {
  const keys = await workspaceColumnKeys(workspaceId)
  return keys.find((k) => k !== 'done') || null
}

export async function planFor(batch, userId, workspaceId, onlyIds) {
  const current = await tasksByIds(batchTaskIds(batch), workspaceId)
  return planUndo(batch, current, { userId, firstColumn: await firstColumnOf(workspaceId), onlyIds })
}

// Executa o desfazer. Só remove o que o plano diz (inalteradas, do dono, dentro de onlyIds) e grava o resultado.
export async function undoBatch(batch, userId, workspaceId, onlyIds = null) {
  const plan = await planFor(batch, userId, workspaceId, onlyIds)
  if (plan.already_undone) return { status: 200, body: { undone: 0, removed: [], kept: [], gone: 0, already_undone: true } }
  if (plan.expired) return { status: 400, body: { error: 'Só dá para desfazer pedidos das últimas 48 horas.' } }
  const ids = plan.remove.map((t) => t.id)
  if (ids.length) {
    const { error } = await supabase.from('fourbase_tasks').delete()
      .in('id', ids).eq('workspace_id', workspaceId).eq('assigned_to', userId)
    if (error) throw error
  }
  const result = new Map([...plan.remove.map((t) => [t.id, 'removed']), ...plan.keep.map((t) => [t.id, `kept_${t.reason}`])])
  const items = (Array.isArray(batch.items) ? batch.items : []).map((i) => ({ ...i, result: result.get(i.id) || 'gone' }))
  const { error: e2 } = await supabase.from('fourbase_assistant_batches')
    .update({ undone_at: new Date().toISOString(), items }).eq('id', batch.id)
  if (e2) throw e2
  return {
    status: 200,
    body: {
      undone: ids.length,
      removed: plan.remove.map(({ id, title }) => ({ id, title })),
      kept: plan.keep.map(({ id, title, reason }) => ({ id, title, reason })),
      gone: plan.gone,
    },
  }
}

// ---------- operações (porta do ChatGPT: REST e MCP) ----------
export async function opMe(ctx) {
  const { data: ws } = await supabase.from('weflow_workspaces').select('name').eq('id', ctx.user.workspace_id).maybeSingle()
  return {
    status: 200,
    activity: { op: 'verificarConexao' },
    body: {
      user_name: ctx.user.name, workspace_name: ws?.name ?? null, connection_name: ctx.token.name,
      ...clock(), scopes: ctx.token.scopes,
      limits: { max_batch: MAX_BATCH, undo_hours: UNDO_WINDOW_MS / 3600000, max_agenda_days: MAX_AGENDA_DAYS },
    },
  }
}

export async function opClients(ctx) {
  const { data, error } = await supabase
    .from('fourbase_clients').select('id, name').eq('workspace_id', ctx.user.workspace_id).order('name', { ascending: true })
  if (error) throw error
  return { status: 200, activity: { op: 'listarClientes' }, body: data || [] }
}

export async function opAgenda(ctx, { from, to } = {}) {
  if (!isDate(from) || !isDate(to)) return { status: 400, activity: { op: 'verAgenda' }, body: { error: 'Informe from e to no formato AAAA-MM-DD' } }
  if (to < from) return { status: 400, activity: { op: 'verAgenda' }, body: { error: 'to não pode ser antes de from' } }
  if (daysBetween(from, to) + 1 > MAX_AGENDA_DAYS) return { status: 400, activity: { op: 'verAgenda' }, body: { error: `Período máximo de ${MAX_AGENDA_DAYS} dias` } }
  const { data: cols } = await supabase.from('fourbase_columns').select('key, label').eq('workspace_id', ctx.user.workspace_id)
  const labels = Object.fromEntries((cols || []).map((c) => [c.key, c.label]))
  const items = (await myTasks(ctx))
    .filter((t) => t.due_date && t.due_date <= to && (t.due_date_end || t.due_date) >= from)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))
  return {
    status: 200,
    activity: { op: 'verAgenda', from, to, count: items.length },
    body: {
      from, to, ...clock(), total: items.length, truncated: items.length > MAX_AGENDA_ITEMS,
      tasks: items.slice(0, MAX_AGENDA_ITEMS).map((t) => taskView(t, labels)),
    },
  }
}

export async function opBatches(ctx, { limit } = {}) {
  const n = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 20)
  const { page, tasks } = await listBatches(ctx.user.id, ctx.user.workspace_id, { limit: n })
  return { status: 200, activity: { op: 'listarLotes', count: page.length }, body: { ...clock(), batches: page.map((b) => toBatchView(b, tasks)) } }
}

// Valida o lote inteiro (tudo ou nada) e calcula conflitos/duplicatas.
async function prepareBatch(ctx, body) {
  const { tasks } = body || {}
  if (!Array.isArray(tasks) || !tasks.length) return { status: 400, error: 'Envie uma lista "tasks" com pelo menos uma tarefa' }
  if (tasks.length > MAX_BATCH) return { status: 400, error: `Máximo de ${MAX_BATCH} tarefas por lote` }
  const { data: clients } = await supabase.from('fourbase_clients').select('id, name').eq('workspace_id', ctx.user.workspace_id)
  const today = todayIn()
  const normalized = []
  const errors = []
  tasks.forEach((item, index) => {
    const r = normalizeTaskInput(item, { clients: clients || [], today })
    if (r.errors) errors.push({ index, title: item?.title ?? null, errors: r.errors })
    else normalized.push(r.task)
  })
  if (errors.length) return { status: 400, error: 'Há tarefas inválidas; nada foi criado', details: errors }
  const existing = await myTasks(ctx)
  return { tasks: normalized, conflicts: findConflicts(normalized, existing), duplicates: findDuplicates(normalized, existing) }
}

export async function opPreview(ctx, body) {
  const p = await prepareBatch(ctx, body)
  const activity = { op: 'prever', count: p.tasks?.length ?? 0 }
  if (p.error) return { status: p.status, activity, body: { error: p.error, details: p.details } }
  return { status: 200, activity, body: { ok: true, ...clock(), count: p.tasks.length, tasks: p.tasks, conflicts: p.conflicts, duplicates: p.duplicates } }
}

async function ensureAssistantTag(workspaceId) {
  const { data } = await supabase.from('fourbase_tags').select('id').eq('workspace_id', workspaceId).eq('name', ASSISTANT_TAG.name).maybeSingle()
  if (data) return
  const { error } = await supabase.from('fourbase_tags').insert({ ...ASSISTANT_TAG, workspace_id: workspaceId })
  if (error && error.code !== '23505') console.error('tag ChatGPT:', error.message)
}

export async function opCreate(ctx, body) {
  const batchId = body?.batch_id
  const activity = { op: 'criarTarefas' }
  if (!isValidBatchId(batchId)) return { status: 400, activity, body: { error: 'batch_id obrigatório (8 a 80 caracteres: letras, números, _ . : -)' } }
  const workspaceId = ctx.user.workspace_id

  // Mesmo lote de novo = não cria nada; devolve o que já existe.
  const prior = await loadBatch(ctx.user.id, workspaceId, batchId)
  if (prior) {
    if (prior.undone_at) return { status: 409, activity, body: { error: 'Este lote foi desfeito. Use um batch_id novo para criar de novo.' } }
    const existing = await tasksByIds(batchTaskIds(prior), workspaceId)
    return { status: 200, activity, body: { already_created: true, batch_id: batchId, count: existing.length, undo_until: undoDeadline(prior), tasks: existing.map((t) => taskView(t)) } }
  }

  const p = await prepareBatch(ctx, body)
  if (p.error) return { status: p.status, activity, body: { error: p.error, details: p.details } }

  // Reserva o lote primeiro: a chave única (user_id, batch_id) barra a corrida de duas chamadas iguais.
  const { data: claimed, error: claimErr } = await supabase
    .from('fourbase_assistant_batches')
    .insert({ workspace_id: workspaceId, user_id: ctx.user.id, token_id: ctx.token.id, batch_id: batchId, task_ids: [], items: [] })
    .select().single()
  if (claimErr) {
    if (claimErr.code === '23505') return { status: 409, activity, body: { error: 'Este lote já está sendo processado. Consulte a agenda.' } }
    throw claimErr
  }

  try {
    await ensureAssistantTag(workspaceId)
    const column_key = await resolveColumnKey(workspaceId, undefined)
    const { data: created, error } = await supabase
      .from('fourbase_tasks')
      .insert(p.tasks.map((t) => ({
        workspace_id: workspaceId, ...t, column_key, user_id: ctx.user.id, assigned_to: ctx.user.id,
        tags: [ASSISTANT_TAG.name], attachments: [], mentioned_users: [],
      })))
      .select()
    if (error) throw error
    // retrato tirado da linha que o banco devolveu (defaults incluídos): é o que o desfazer compara
    const { error: upErr } = await supabase
      .from('fourbase_assistant_batches')
      .update({ task_ids: created.map((t) => t.id), items: created.map(batchItemOf) })
      .eq('id', claimed.id)
    if (upErr) throw upErr
    return {
      status: 201,
      activity: { op: 'criarTarefas', count: created.length },
      body: {
        batch_id: batchId, count: created.length, conflicts: p.conflicts, duplicates: p.duplicates,
        undo_until: undoDeadline(claimed),
        tasks: created.map((t) => ({ ...taskView(t), link: appUrl() ? `${appUrl()}/painel?tarefa=${t.id}` : null })),
      },
    }
  } catch (err) {
    // não deixa um lote "fantasma" travando o batch_id
    await supabase.from('fourbase_assistant_batches').delete().eq('id', claimed.id)
    throw err
  }
}

export async function opUndo(ctx, batchId) {
  const batch = await loadBatch(ctx.user.id, ctx.user.workspace_id, batchId)
  if (!batch) return { status: 404, activity: { op: 'desfazerLote' }, body: { error: 'Lote não encontrado' } }
  const r = await undoBatch(batch, ctx.user.id, ctx.user.workspace_id)
  return { status: r.status, activity: { op: 'desfazerLote', count: r.body.undone ?? 0 }, body: r.body }
}
