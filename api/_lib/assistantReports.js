// Relatórios pelo ChatGPT (MCP): o gestor pede "faça o relatório do cliente X de tal a tal data", o ChatGPT lê os dados
// (dados_relatorio), escreve a introdução e salva um RASCUNHO (gerar_relatorio) que o gestor abre na tela Relatórios
// do fourbase, confere, ajusta e exporta (PDF/CSV). Só parâmetros e texto ficam guardados: as tarefas vêm ao vivo.
// Mesmas regras do resto do Assistente: só gestor ativo e só o próprio workspace (ctx vem do token).
import { supabase } from './supabase.js'
import { loadBucketer } from './columnBuckets.js'
import { daysBetween, isDate, todayIn, TIMEZONE } from './assistant.js'
import { appUrl } from './assistantService.js'

export const MAX_REPORT_DAYS = 366
export const MAX_REPORT_TASKS = 200
export const MAX_INTRO = 4000
const REQUEST_ID = /^[A-Za-z0-9_.:-]{8,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const bad = (op, error, extra = {}) => ({ status: 400, activity: { op }, body: { error, ...extra } })

async function resolveClient(ctx, { client_id, client_name }) {
  const { data, error } = await supabase.from('fourbase_clients').select('id, name').eq('workspace_id', ctx.user.workspace_id)
  if (error) throw error
  const all = data || []
  if (client_id) {
    const c = UUID.test(String(client_id)) ? all.find((x) => x.id === client_id) : null
    return c ? { client: c } : { error: 'Cliente não encontrado. Use listar_clientes.' }
  }
  const q = fold(client_name)
  if (!q) return { error: 'Informe o cliente (client_name ou client_id). Use listar_clientes.' }
  const exact = all.filter((c) => fold(c.name) === q)
  const hits = exact.length ? exact : all.filter((c) => fold(c.name).includes(q))
  if (hits.length === 1) return { client: hits[0] }
  if (!hits.length) return { error: 'Cliente não encontrado. Use listar_clientes e peça ao usuário para escolher.' }
  return { error: 'Há mais de um cliente com esse nome. Pergunte ao usuário qual deles.', candidates: hits.map((c) => ({ id: c.id, name: c.name })) }
}

function checkPeriod(op, from, to) {
  if (!isDate(from) || !isDate(to)) return bad(op, 'Informe from e to no formato AAAA-MM-DD')
  if (to < from) return bad(op, 'to não pode ser antes de from')
  if (daysBetween(from, to) + 1 > MAX_REPORT_DAYS) return bad(op, `Período máximo de ${MAX_REPORT_DAYS} dias`)
  return null
}

// Tarefas do cliente no período (o prazo, ou o intervalo de prazos, encosta no período).
async function clientReportData(ctx, client, from, to) {
  const workspaceId = ctx.user.workspace_id
  const [tasksR, usersR, colsR, bucket] = await Promise.all([
    supabase.from('fourbase_tasks').select('*').eq('workspace_id', workspaceId).eq('client_id', client.id),
    supabase.from('fourbase_users').select('id, name').eq('workspace_id', workspaceId),
    supabase.from('fourbase_columns').select('key, label').eq('workspace_id', workspaceId),
    loadBucketer(workspaceId),
  ])
  for (const r of [tasksR, usersR, colsR]) if (r.error) throw r.error
  const names = Object.fromEntries((usersR.data || []).map((u) => [u.id, u.name]))
  const labels = Object.fromEntries((colsR.data || []).map((c) => [c.key, c.label]))
  const all = tasksR.data || []
  const inPeriod = all.filter((t) => t.due_date && t.due_date <= to && (t.due_date_end || t.due_date) >= from)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))
  const counts = { total: inPeriod.length, todo: 0, doing: 0, done: 0 }
  for (const t of inPeriod) counts[bucket(t.column_key)] += 1
  return {
    counts,
    undated: all.filter((t) => !t.due_date).length,
    truncated: inPeriod.length > MAX_REPORT_TASKS,
    tasks: inPeriod.slice(0, MAX_REPORT_TASKS).map((t) => ({
      title: t.title, status: labels[t.column_key] || t.column_key, done: bucket(t.column_key) === 'done',
      priority: t.priority, assignee: names[t.assigned_to] || null, due_date: t.due_date, due_date_end: t.due_date_end,
    })),
  }
}

const reportView = (r, clientName) => ({
  id: r.id, client_id: r.client_id, client_name: clientName ?? null, period_from: r.period_from, period_to: r.period_to,
  intro_text: r.intro_text || '', created_at: r.created_at,
  link: `${appUrl()}/relatorios?relatorio=${r.id}`,
})

// Leitura: o que há para o relatório (o ChatGPT usa para escrever a introdução). Não grava nada.
export async function opReportData(ctx, { client_id, client_name, from, to } = {}) {
  const op = 'dadosRelatorio'
  const p = checkPeriod(op, from, to)
  if (p) return p
  const c = await resolveClient(ctx, { client_id, client_name })
  if (c.error) return bad(op, c.error, c.candidates ? { candidates: c.candidates } : {})
  const data = await clientReportData(ctx, c.client, from, to)
  return {
    status: 200, activity: { op, count: data.counts.total },
    body: { today: todayIn(), timezone: TIMEZONE, client: c.client, from, to, ...data },
  }
}

// Escrita: salva o RASCUNHO. request_id repetido devolve o mesmo relatório (idempotente, como os lotes de tarefas).
export async function opReportCreate(ctx, { request_id, client_id, client_name, from, to, intro } = {}) {
  const op = 'gerarRelatorio'
  if (!REQUEST_ID.test(String(request_id ?? ''))) return bad(op, 'request_id inválido (8 a 80 caracteres: letras, números e _ . : -)')
  const p = checkPeriod(op, from, to)
  if (p) return p
  const text = String(intro ?? '').replace(/\r\n/g, '\n').trim()
  if (text.length > MAX_INTRO) return bad(op, `A introdução passa de ${MAX_INTRO} caracteres`)
  const workspaceId = ctx.user.workspace_id

  const { data: existing, error: exErr } = await supabase
    .from('fourbase_reports').select('*').eq('workspace_id', workspaceId).eq('request_id', request_id).maybeSingle()
  if (exErr) throw exErr
  if (existing) {
    const { data: cl } = await supabase.from('fourbase_clients').select('name').eq('id', existing.client_id).maybeSingle()
    return { status: 200, activity: { op }, body: { already_created: true, report: reportView(existing, cl?.name) } }
  }

  const c = await resolveClient(ctx, { client_id, client_name })
  if (c.error) return bad(op, c.error, c.candidates ? { candidates: c.candidates } : {})
  const data = await clientReportData(ctx, c.client, from, to)
  const { data: row, error } = await supabase.from('fourbase_reports').insert({
    workspace_id: workspaceId, client_id: c.client.id, manager_id: ctx.user.id, period_from: from, period_to: to,
    intro_text: text || null, source: 'chatgpt', request_id, created_by: ctx.user.id,
  }).select().single()
  if (error) throw error
  return {
    status: 201, activity: { op, count: data.counts.total },
    body: { report: reportView(row, c.client.name), counts: data.counts, status: 'rascunho' },
  }
}

export async function opReportList(ctx, { limit } = {}) {
  const n = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 20)
  const workspaceId = ctx.user.workspace_id
  const [reps, clients] = await Promise.all([
    supabase.from('fourbase_reports').select('*').eq('workspace_id', workspaceId).eq('source', 'chatgpt').order('created_at', { ascending: false }).limit(n),
    supabase.from('fourbase_clients').select('id, name').eq('workspace_id', workspaceId),
  ])
  for (const r of [reps, clients]) if (r.error) throw r.error
  const names = Object.fromEntries((clients.data || []).map((c) => [c.id, c.name]))
  return {
    status: 200, activity: { op: 'listarRelatorios', count: (reps.data || []).length },
    body: { today: todayIn(), reports: (reps.data || []).map((r) => reportView(r, names[r.client_id])) },
  }
}

