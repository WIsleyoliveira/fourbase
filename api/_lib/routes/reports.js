import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { inWorkspace } from '../validation.js'

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

router.delete('/api/report-activities/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_report_activities')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

