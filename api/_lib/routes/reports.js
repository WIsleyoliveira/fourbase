import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { inWorkspace, isUuid } from '../validation.js'

const router = Router()
export default router

// ---------- Relatórios (planilha de atividades) ----------
const REPORT_STATUSES = ['A fazer', 'Em progresso', 'Pendente', 'Concluído']

const reportFields = (body) => {
  const fields = {}
  if (body.activity_name !== undefined) fields.activity_name = (body.activity_name || '').trim() || null
  if (body.date !== undefined) fields.date = body.date || null
  if (body.status !== undefined) fields.status = REPORT_STATUSES.includes(body.status) ? body.status : 'A fazer'
  if (body.assigned_to !== undefined) fields.assigned_to = body.assigned_to || null
  if (body.client_id !== undefined) fields.client_id = body.client_id || null
  return fields
}

// Responsável e cliente de uma atividade precisam existir no mesmo workspace.
const validReportRefs = async (fields, workspaceId) =>
  (await inWorkspace('fourbase_users', fields.assigned_to, workspaceId)) &&
  (await inWorkspace('fourbase_clients', fields.client_id, workspaceId))

router.get('/api/report-activities', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

router.post('/api/report-activities', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const fields = { activity_name: '', date: null, status: 'A fazer', assigned_to: null, client_id: null, ...reportFields(req.body) }
  if (!(await validReportRefs(fields, workspaceId))) {
    return res.status(400).json({ error: 'Responsável ou cliente inválido' })
  }
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .insert({ ...fields, workspace_id: workspaceId, created_by: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.patch('/api/report-activities/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const fields = reportFields(req.body)
  if (!(await validReportRefs(fields, workspaceId))) {
    return res.status(400).json({ error: 'Responsável ou cliente inválido' })
  }
  const updates = { ...fields, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .update(updates)
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

// Rascunhos gerados pelo ChatGPT (só parâmetros e introdução; as tarefas vêm ao vivo).
router.get('/api/reports/generated', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const [reps, clients] = await Promise.all([
    supabase.from('fourbase_reports').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50),
    supabase.from('fourbase_clients').select('id, name').eq('workspace_id', workspaceId),
  ])
  for (const r of [reps, clients]) if (r.error) throw r.error
  const names = Object.fromEntries((clients.data || []).map((c) => [c.id, c.name]))
  res.json((reps.data || []).map((r) => ({ ...r, client_name: names[r.client_id] || '' })))
}))

router.get('/api/reports/generated/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Registro não encontrado' })
  const { data, error } = await supabase.from('fourbase_reports').select('*').eq('id', req.params.id).eq('workspace_id', workspaceOf(req)).maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Registro não encontrado' })
  res.json(data)
}))

router.patch('/api/reports/generated/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Registro não encontrado' })
  const b = req.body || {}
  const { data: current, error: cErr } = await supabase.from('fourbase_reports').select('*').eq('id', req.params.id).eq('workspace_id', workspaceId).maybeSingle()
  if (cErr) throw cErr
  if (!current) return res.status(404).json({ error: 'Registro não encontrado' })

  const fields = {}
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
  if (b.period_from !== undefined) { if (!isDay(b.period_from)) return res.status(400).json({ error: 'Data inicial inválida' }); fields.period_from = b.period_from }
  if (b.period_to !== undefined) { if (!isDay(b.period_to)) return res.status(400).json({ error: 'Data final inválida' }); fields.period_to = b.period_to }
  if ((fields.period_to ?? current.period_to) < (fields.period_from ?? current.period_from)) return res.status(400).json({ error: 'A data final não pode ser antes da inicial' })
  if (b.intro_text !== undefined) {
    const text = String(b.intro_text ?? '').replace(/\r\n/g, '\n').trim()
    if (text.length > 4000) return res.status(400).json({ error: 'A introdução passa de 4000 caracteres' })
    fields.intro_text = text || null
  }
  if (b.client_id !== undefined) {
    if (!(await inWorkspace('fourbase_clients', b.client_id, workspaceId))) return res.status(400).json({ error: 'Cliente inválido' })
    fields.client_id = b.client_id
  }
  if (b.manager_id !== undefined) {
    if (b.manager_id && !(await inWorkspace('fourbase_users', b.manager_id, workspaceId))) return res.status(400).json({ error: 'Responsável inválido' })
    fields.manager_id = b.manager_id || null
  }
  const { data, error } = await supabase.from('fourbase_reports').update(fields).eq('id', req.params.id).eq('workspace_id', workspaceId).select().single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/reports/generated/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Registro não encontrado' })
  const { error } = await supabase.from('fourbase_reports').delete().eq('id', req.params.id).eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

router.delete('/api/report-activities/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_report_activities')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

