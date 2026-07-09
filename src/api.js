const AUTH_KEY = 'fourbase_auth'

export const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
  } catch {
    return null
  }
}

export const setAuth = (auth) => {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
  else localStorage.removeItem(AUTH_KEY)
}

const request = async (path, options = {}) => {
  const auth = getAuth()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401 && auth) {
    // sessão expirada — volta para o login
    setAuth(null)
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erro ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // auth
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name, email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  // tarefas
  getTasks: () => request('/api/tasks'),
  addTask: (title, priority) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify({ title, priority }) }),
  moveTask: (id, column_key) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ column_key }) }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),

  // notas
  getNotes: () => request('/api/notes'),
  createNote: (title, content) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify({ title, content }) }),
  updateNote: (id, title, content) =>
    request(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify({ title, content }) }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),

  // checklist
  getTodos: () => request('/api/todos'),
  addTodo: (text) => request('/api/todos', { method: 'POST', body: JSON.stringify({ text }) }),
  toggleTodo: (id, done) =>
    request(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  deleteTodo: (id) => request(`/api/todos/${id}`, { method: 'DELETE' }),

  // mídia
  getMedia: () => request('/api/media'),
  saveMedia: (kind, data_url) =>
    request(`/api/media/${kind}`, { method: 'PUT', body: JSON.stringify({ data_url }) }),
  clearMedia: () => request('/api/media', { method: 'DELETE' }),

  // equipe (gestor)
  getTeamOverview: () => request('/api/team/overview'),
  getTeamTasks: () => request('/api/team/tasks'),
}
