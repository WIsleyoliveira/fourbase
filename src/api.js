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

  // perfil do usuário logado
  getProfile: () => request('/api/auth/me'),
  updateProfile: (updates) =>
    request('/api/profile', { method: 'PATCH', body: JSON.stringify(updates) }),
  changePassword: (current_password, new_password) =>
    request('/api/profile/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // tarefas
  getTasks: () => request('/api/tasks'),
  // todas as tarefas de um cliente (qualquer responsável) — usada pela aba Relatórios
  getTasksByClient: (clientId) => request(`/api/tasks/by-client/${clientId}`),
  addTask: (title, priority, due_date, assigned_to, description, client_id = null, tags = []) =>
    request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, priority, due_date, assigned_to, description, client_id, tags }),
    }),
  // Criação com o objeto completo — usada pelo modal de especificações da tarefa
  // (o `addTask` posicional continua servindo os formulários rápidos)
  createTask: (fields) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(fields) }),
  moveTask: (id, column_key) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ column_key }) }),
  updateTask: (id, updates) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),

  // etiquetas de tarefas (registro global — pré-cadastradas + criadas sob demanda)
  getTags: () => request('/api/tags'),
  createTag: (name, color) =>
    request('/api/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),

  // membros
  getMembers: () => request('/api/members'),
  createMember: (member) =>
    request('/api/members', { method: 'POST', body: JSON.stringify(member) }),
  deleteMember: (id) => request(`/api/members/${id}`, { method: 'DELETE' }),

  // clientes
  getClients: () => request('/api/clients'),
  createClient: (client) =>
    request('/api/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id, updates) =>
    request(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  // mode: 'archive' (desvincula as pastas) | 'cascade' (exclui as pastas)
  deleteClient: (id, mode = 'archive') =>
    request(`/api/clients/${id}?folders=${mode}`, { method: 'DELETE' }),

  // notas
  getNotes: () => request('/api/notes'),
  createNote: (title, content) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify({ title, content }) }),
  updateNote: (id, title, content) =>
    request(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify({ title, content }) }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  updateNoteFolder: (id, folderId) =>
    request(`/api/notes/${id}/folder`, { method: 'PATCH', body: JSON.stringify({ folder_id: folderId }) }),
  updateNoteAttachments: (id, attachments) =>
    request(`/api/notes/${id}/attachments`, { method: 'PATCH', body: JSON.stringify({ attachments }) }),

  // checklist
  getTodos: () => request('/api/todos'),
  addTodo: (text, priority, due_at) =>
    request('/api/todos', { method: 'POST', body: JSON.stringify({ text, priority, due_at }) }),
  toggleTodo: (id, done) =>
    request(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  updateTodo: (id, updates) =>
    request(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTodo: (id) => request(`/api/todos/${id}`, { method: 'DELETE' }),

  // colunas do kanban
  getColumns: () => request('/api/columns'),
  createColumn: (label, key, position, color) =>
    request('/api/columns', { method: 'POST', body: JSON.stringify({ label, key, position, color }) }),
  deleteColumn: (key) => request(`/api/columns/${key}`, { method: 'DELETE' }),

  // equipe (gestor)
  getTeamOverview: () => request('/api/team/overview'),
  getTeamTasks: () => request('/api/team/tasks'),

  // pastas de documentos
  getFolders: () => request('/api/folders'),
  createFolder: (name, color, parentId = null, clientId = null) =>
    request('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, color, parent_id: parentId || null, client_id: clientId || null }),
    }),
  updateFolder: (id, updates) =>
    request(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteFolder: (id) => request(`/api/folders/${id}`, { method: 'DELETE' }),
  getFolderDocuments: (folderId) => request(`/api/folders/${folderId}/documents`),
  addFolderDocument: (folderId, kind, url, name) =>
    request(`/api/folders/${folderId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ kind, url, name }),
    }),
  deleteFolderDocument: (folderId, docId) =>
    request(`/api/folders/${folderId}/documents/${docId}`, { method: 'DELETE' }),

  // relatórios (planilha de atividades)
  getReportActivities: () => request('/api/report-activities'),
  createReportActivity: (fields = {}) =>
    request('/api/report-activities', { method: 'POST', body: JSON.stringify(fields) }),
  updateReportActivity: (id, updates) =>
    request(`/api/report-activities/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteReportActivity: (id) => request(`/api/report-activities/${id}`, { method: 'DELETE' }),
}
