import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createLocalClient } from './localDb.js'

const JWT_SECRET = process.env.JWT_SECRET || 'fourbase-dev-secret-troque-em-producao'

// Banco de dados local mockado (data/db.json) — ver api/localDb.js.
// Para trocar por um Postgres/Supabase real em produção, troque esta linha
// por `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` do @supabase/supabase-js.
const supabase = createLocalClient()

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: err.message || 'Erro interno' })
  })

// ---------- Auth ----------
const signToken = (user) =>
  jwt.sign({ sub: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' })

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })

const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = { id: payload.sub, name: payload.name, role: payload.role }
    next()
  } catch {
    res.status(401).json({ error: 'Não autenticado' })
  }
}

const gestorOnly = (req, res, next) =>
  req.user.role === 'gestor' ? next() : res.status(403).json({ error: 'Acesso restrito ao gestor' })

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'fourbase-api' }))

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' })
  }
  const password_hash = bcrypt.hashSync(password, 10)
  const { data, error } = await supabase
    .from('fourbase_users')
    .insert({ name: name.trim(), email: email.trim().toLowerCase(), password_hash, role: 'funcionario' })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado' })
    throw error
  }
  res.status(201).json({ token: signToken(data), user: publicUser(data) })
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha' })
  const { data: user, error } = await supabase
    .from('fourbase_users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
}))

app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_users')
    .select('id, name, email, role')
    .eq('id', req.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return res.status(401).json({ error: 'Usuário não encontrado' })
  res.json(data)
}))

// ---------- Tarefas (atribuídas ao usuário logado) ----------
app.get('/api/tasks', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*')
    .eq('assigned_to', req.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

app.post('/api/tasks', auth, asyncRoute(async (req, res) => {
  const { title, priority = 'Média', due_date = null, assigned_to, description = '', client_id = null } = req.body
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título obrigatório' })
  const isGestor = req.user.role === 'gestor'
  const owner = isGestor && assigned_to ? assigned_to : req.user.id
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .insert({
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date,
      column_key: 'todo',
      user_id: req.user.id,
      assigned_to: owner,
      client_id: client_id || null,
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const { column_key, title, priority, due_date, assigned_to, description, logged_time_seconds, attachments, client_id } = req.body
  const updates = {}
  if (column_key) updates.column_key = column_key
  if (title) updates.title = title
  if (description !== undefined) updates.description = description
  if (priority) updates.priority = priority
  if (due_date !== undefined) updates.due_date = due_date
  if (assigned_to && req.user.role === 'gestor') updates.assigned_to = assigned_to
  if (logged_time_seconds !== undefined) updates.logged_time_seconds = Math.max(0, Math.floor(Number(logged_time_seconds)) || 0)
  if (attachments !== undefined) updates.attachments = Array.isArray(attachments) ? attachments : []
  if (client_id !== undefined) updates.client_id = client_id || null

  const query = supabase.from('fourbase_tasks').update(updates).eq('id', req.params.id)
  if (req.user.role !== 'gestor') query.eq('assigned_to', req.user.id)
  const { data, error } = await query.select().single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const query = supabase.from('fourbase_tasks').delete().eq('id', req.params.id)
  if (req.user.role !== 'gestor') query.eq('assigned_to', req.user.id)
  const { error } = await query
  if (error) throw error
  res.status(204).end()
}))

// ---------- Membros (para o seletor de responsável) ----------
// Cor personalizada (escolhida no seletor de espectro do cadastro) — só aceita
// um hex válido; qualquer outra coisa vira null (cor automática por hash).
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const normalizeColor = (value) => (typeof value === 'string' && HEX_COLOR.test(value) ? value : null)

app.get('/api/members', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_users')
    .select('id, name, color')
    .order('name')
  if (error) throw error
  res.json(data)
}))

// Criação de membro pelo gestor (Central de Cadastros → "Cadastrar Membro da Equipe")
app.post('/api/members', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { name, email, password, role = 'funcionario', job_title = '', color } = req.body
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' })
  }
  const roleValue = role === 'gestor' ? 'gestor' : 'funcionario'
  const password_hash = bcrypt.hashSync(password, 10)
  const { data, error } = await supabase
    .from('fourbase_users')
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      role: roleValue,
      job_title: job_title.trim() || null,
      color: normalizeColor(color),
    })
    .select('id, name, email, role, color')
    .single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado' })
    throw error
  }
  res.status(201).json(data)
}))

app.delete('/api/members/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { id } = req.params

  // Impede auto-exclusão
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Você não pode remover sua própria conta' })
  }

  // Verifica existência e protege gestores
  const { data: target, error: fetchErr } = await supabase
    .from('fourbase_users')
    .select('role')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.role === 'gestor') {
    return res.status(403).json({ error: 'Não é possível remover um Gestor' })
  }

  // Reatribui tarefas ao gestor que está realizando a ação (evita órfãos)
  const { error: taskAssignErr } = await supabase
    .from('fourbase_tasks')
    .update({ assigned_to: req.user.id })
    .eq('assigned_to', id)
  if (taskAssignErr) throw taskAssignErr

  const { error: taskUserErr } = await supabase
    .from('fourbase_tasks')
    .update({ user_id: req.user.id })
    .eq('user_id', id)
  if (taskUserErr) throw taskUserErr

  const { error: deleteErr } = await supabase
    .from('fourbase_users')
    .delete()
    .eq('id', id)
  if (deleteErr) throw deleteErr

  res.status(204).end()
}))

// ---------- Notas ----------
app.get('/api/notes', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_notes')
    .select('*')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

app.post('/api/notes', auth, asyncRoute(async (req, res) => {
  const { title = 'Nova nota', content = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .insert({ title, content, user_id: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.put('/api/notes/:id', auth, asyncRoute(async (req, res) => {
  const { title = '', content = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/notes/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_notes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
  if (error) throw error
  res.status(204).end()
}))

// Relaciona (ou desvincula, com folder_id = null) uma nota a uma pasta de Documentações
app.patch('/api/notes/:id/folder', auth, asyncRoute(async (req, res) => {
  const { folder_id } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .update({ folder_id: folder_id || null })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

// ---------- Checklist ----------
app.get('/api/todos', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_todos')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

app.post('/api/todos', auth, asyncRoute(async (req, res) => {
  const { text, priority = 'Média', due_at = null } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'Texto obrigatório' })
  const { data, error } = await supabase
    .from('fourbase_todos')
    .insert({ text: text.trim(), priority, due_at, user_id: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/todos/:id', auth, asyncRoute(async (req, res) => {
  const { done, priority, due_at } = req.body
  const updates = {}
  if (done !== undefined) updates.done = done
  if (priority) updates.priority = priority
  if (due_at !== undefined) updates.due_at = due_at
  const { data, error } = await supabase
    .from('fourbase_todos')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/todos/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_todos')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
  if (error) throw error
  res.status(204).end()
}))

// ---------- Mídia ----------
app.get('/api/media', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_media')
    .select('kind, data_url')
    .eq('user_id', req.user.id)
  if (error) throw error
  const media = { image: '', video: '' }
  data.forEach((row) => { media[row.kind] = row.data_url })
  res.json(media)
}))

app.put('/api/media/:kind', auth, asyncRoute(async (req, res) => {
  const { kind } = req.params
  if (!['image', 'video'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' })
  const { data_url = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_media')
    .upsert(
      { kind, data_url, user_id: req.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,kind' }
    )
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/media', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_media')
    .update({ data_url: '', updated_at: new Date().toISOString() })
    .eq('user_id', req.user.id)
    .in('kind', ['image', 'video'])
  if (error) throw error
  res.status(204).end()
}))

// ---------- Pastas de documentos (hierárquicas, com vínculo a clientes) ----------
app.get('/api/folders', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_folders')
    .select('*')
    .order('name')
  if (error) throw error
  res.json(data)
}))

app.post('/api/folders', auth, asyncRoute(async (req, res) => {
  const { name, color = '#14b8c4', parent_id = null, client_id = null } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome da pasta obrigatório' })

  // Subpasta herda o cliente da pasta-pai (mantém a árvore coerente)
  let owner = client_id || null
  if (parent_id) {
    const { data: parent } = await supabase
      .from('fourbase_folders')
      .select('client_id')
      .eq('id', parent_id)
      .maybeSingle()
    if (parent && parent.client_id) owner = parent.client_id
  }

  const { data, error } = await supabase
    .from('fourbase_folders')
    .insert({ name: name.trim(), color, parent_id: parent_id || null, client_id: owner, created_by: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/folders/:id', auth, asyncRoute(async (req, res) => {
  const { name, color, parent_id, client_id } = req.body
  const updates = {}
  if (name !== undefined && name.trim()) updates.name = name.trim()
  if (color !== undefined) updates.color = color
  if (parent_id !== undefined) updates.parent_id = parent_id || null
  if (client_id !== undefined) updates.client_id = client_id || null
  const { data, error } = await supabase
    .from('fourbase_folders')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/folders/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase.from('fourbase_folders').delete().eq('id', req.params.id)
  if (error) throw error
  res.status(204).end()
}))

app.get('/api/folders/:id/documents', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_folder_media')
    .select('*')
    .eq('folder_id', req.params.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

app.post('/api/folders/:id/documents', auth, asyncRoute(async (req, res) => {
  const { kind, url, name = '' } = req.body
  if (!['image', 'video', 'document'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' })
  if (!url) return res.status(400).json({ error: 'URL obrigatória' })
  const { data, error } = await supabase
    .from('fourbase_folder_media')
    .insert({ folder_id: req.params.id, kind, url, name, uploaded_by: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.delete('/api/folders/:folderId/documents/:docId', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_folder_media')
    .delete()
    .eq('id', req.params.docId)
    .eq('folder_id', req.params.folderId)
  if (error) throw error
  res.status(204).end()
}))

// ---------- Colunas do Kanban ----------
app.get('/api/columns', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_columns')
    .select('*')
    .order('position', { ascending: true })
  if (error) throw error
  res.json(data)
}))

app.post('/api/columns', auth, asyncRoute(async (req, res) => {
  const { label, key, position = 0, color = '#14b8c4' } = req.body
  if (!label?.trim()) return res.status(400).json({ error: 'Nome da coluna obrigatório' })
  if (!key?.trim())   return res.status(400).json({ error: 'Chave da coluna obrigatória' })
  const { data, error } = await supabase
    .from('fourbase_columns')
    .insert({ label: label.trim(), key: key.trim(), position, color })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma coluna com essa chave' })
    throw error
  }
  res.status(201).json(data)
}))

app.delete('/api/columns/:key', auth, asyncRoute(async (req, res) => {
  if (['todo', 'doing', 'done'].includes(req.params.key)) {
    return res.status(400).json({ error: 'Não é possível excluir colunas padrão' })
  }
  const { error } = await supabase
    .from('fourbase_columns')
    .delete()
    .eq('key', req.params.key)
  if (error) throw error
  res.status(204).end()
}))

// ---------- Equipe (somente gestor) ----------
app.get('/api/team/overview', auth, gestorOnly, asyncRoute(async (req, res) => {
  const [users, tasks, todos, notes] = await Promise.all([
    supabase.from('fourbase_users').select('id, name, email, role').order('created_at'),
    supabase.from('fourbase_tasks').select('user_id, column_key'),
    supabase.from('fourbase_todos').select('user_id, done'),
    supabase.from('fourbase_notes').select('user_id, updated_at'),
  ])
  for (const r of [users, tasks, todos, notes]) if (r.error) throw r.error

  const overview = users.data.map((u) => {
    const uTasks = tasks.data.filter((t) => t.user_id === u.id)
    const uTodos = todos.data.filter((t) => t.user_id === u.id)
    const uNotes = notes.data.filter((n) => n.user_id === u.id)
    return {
      ...u,
      tasks: {
        todo: uTasks.filter((t) => t.column_key === 'todo').length,
        doing: uTasks.filter((t) => t.column_key === 'doing').length,
        done: uTasks.filter((t) => t.column_key === 'done').length,
        total: uTasks.length,
      },
      todos: { done: uTodos.filter((t) => t.done).length, total: uTodos.length },
      notes: uNotes.length,
      lastNoteAt: uNotes.length
        ? uNotes.map((n) => n.updated_at).sort().at(-1)
        : null,
    }
  })
  res.json(overview)
}))

app.get('/api/team/tasks', auth, gestorOnly, asyncRoute(async (req, res) => {
  // Join manual (nome/e-mail do responsável) — o banco local mockado não
  // interpreta a sintaxe de recurso embutido do supabase-js (`fk!join(...)`).
  const [{ data: tasks, error: tErr }, { data: users, error: uErr }] = await Promise.all([
    supabase.from('fourbase_tasks').select('*').order('created_at', { ascending: false }),
    supabase.from('fourbase_users').select('id, name, email'),
  ])
  if (tErr) throw tErr
  if (uErr) throw uErr
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  res.json(
    tasks.map((t) => {
      const assignee = byId[t.assigned_to]
      return { ...t, owner_name: assignee?.name || 'Sem dono', owner_email: assignee?.email || '' }
    })
  )
}))

// ---------- Clientes ----------
// Compartilhados no workspace (visíveis a todos os autenticados), no mesmo
// modelo das pastas de documentos.
app.get('/api/clients', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_clients')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

app.post('/api/clients', auth, asyncRoute(async (req, res) => {
  const { name = '', cnpj = '', phone = '', email = '', contact_name = '', address = '', color } = req.body
  const { data, error } = await supabase
    .from('fourbase_clients')
    .insert({
      name: name.trim() || null,
      cnpj: cnpj.trim() || null,
      phone: phone.trim() || null,
      email: email.trim().toLowerCase() || null,
      contact_name: contact_name.trim() || null,
      address: address.trim() || null,
      color: normalizeColor(color),
      created_by: req.user.id,
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/clients/:id', auth, asyncRoute(async (req, res) => {
  const updates = { updated_at: new Date().toISOString() }
  for (const key of ['name', 'cnpj', 'phone', 'email', 'contact_name', 'address']) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim()
      updates[key] = key === 'email' ? (v.toLowerCase() || null) : (v || null)
    }
  }
  if (req.body.color !== undefined) updates.color = normalizeColor(req.body.color)
  const { data, error } = await supabase
    .from('fourbase_clients')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

// Exclusão de cliente. O parâmetro ?folders= define o destino das pastas de
// documentação vinculadas:
//   archive (padrão) — mantém as pastas, apenas desvincula (client_id = NULL)
//   cascade          — exclui as pastas do cliente e seu conteúdo
app.delete('/api/clients/:id', auth, asyncRoute(async (req, res) => {
  const mode = req.query.folders === 'cascade' ? 'cascade' : 'archive'
  const clientId = req.params.id

  if (mode === 'cascade') {
    await supabase.from('fourbase_folders').delete().eq('client_id', clientId)
  } else {
    await supabase.from('fourbase_folders').update({ client_id: null }).eq('client_id', clientId)
  }

  const { error } = await supabase.from('fourbase_clients').delete().eq('id', clientId)
  if (error) throw error
  res.status(204).end()
}))

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

app.get('/api/report-activities', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

app.post('/api/report-activities', auth, asyncRoute(async (req, res) => {
  const fields = { activity_name: '', date: null, status: 'A fazer', assigned_to: null, client_id: null, ...reportFields(req.body) }
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .insert({ ...fields, created_by: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/report-activities/:id', auth, asyncRoute(async (req, res) => {
  const updates = { ...reportFields(req.body), updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('fourbase_report_activities')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/report-activities/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase.from('fourbase_report_activities').delete().eq('id', req.params.id)
  if (error) throw error
  res.status(204).end()
}))

export default app
