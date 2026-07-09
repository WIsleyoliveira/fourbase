import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uokpmlzdwnilqaujohov.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_B3FzeCCWZTVQbTvw8lcueA_7gLHY9bN'
const JWT_SECRET = process.env.JWT_SECRET || 'fourbase-dev-secret-troque-em-producao'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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

// ---------- Tarefas (do usuário logado) ----------
app.get('/api/tasks', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

app.post('/api/tasks', auth, asyncRoute(async (req, res) => {
  const { title, priority = 'Média' } = req.body
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título obrigatório' })
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .insert({ title: title.trim(), priority, column_key: 'todo', user_id: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const { column_key, title, priority } = req.body
  const updates = {}
  if (column_key) updates.column_key = column_key
  if (title) updates.title = title
  if (priority) updates.priority = priority
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

app.delete('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_tasks')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
  if (error) throw error
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
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'Texto obrigatório' })
  const { data, error } = await supabase
    .from('fourbase_todos')
    .insert({ text: text.trim(), user_id: req.user.id })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

app.patch('/api/todos/:id', auth, asyncRoute(async (req, res) => {
  const { done } = req.body
  const { data, error } = await supabase
    .from('fourbase_todos')
    .update({ done })
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
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*, fourbase_users(name, email)')
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(
    data.map(({ fourbase_users: owner, ...task }) => ({
      ...task,
      owner_name: owner?.name || 'Sem dono',
      owner_email: owner?.email || '',
    }))
  )
}))

export default app
