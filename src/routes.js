// Mapa entre URLs e o estado de navegação do app (view, cliente aberto, sub-aba).
// Funções puras, sem React — testadas em tests/routes.test.js.
//
//   /painel  /kanban  /calendario  /notas  /clientes  /relatorios
//   /cadastro  /equipe  /perfil
//   /clientes/:id            Espaço do cliente (Kanban)
//   /clientes/:id?aba=docs   Espaço do cliente, aba Documentações
//   /activate/:token         Ativação de convite (link enviado pelo gestor)

export const DEFAULT_VIEW = 'painel'

export const VIEW_KEYS = [
  'painel', 'kanban', 'calendario', 'notas', 'clientes',
  'relatorios', 'cadastro', 'equipe', 'perfil',
]

// Telas que só o gestor pode abrir (o backend também barra os dados).
export const GESTOR_ONLY_VIEWS = ['relatorios', 'equipe', 'cadastro']

const ACTIVATE_RE = /^\/activate\/([A-Za-z0-9._-]+)\/?$/
const CLIENT_ID_RE = /^[A-Za-z0-9_-]+$/

// Lê pathname + search e devolve o estado de navegação. `valid` é false quando
// a URL não corresponde a nenhuma tela — o chamador redireciona para o painel.
export function parseLocation(pathname, search = '') {
  const activate = pathname.match(ACTIVATE_RE)
  if (activate) {
    return { activationToken: activate[1], view: DEFAULT_VIEW, clientId: null, tab: 'kanban', valid: true }
  }

  const parts = pathname.split('/').filter(Boolean)
  const base = { activationToken: null, view: DEFAULT_VIEW, clientId: null, tab: 'kanban' }

  if (parts.length === 0) return { ...base, valid: false }
  if (!VIEW_KEYS.includes(parts[0])) return { ...base, valid: false }

  const view = parts[0]
  if (view === 'clientes' && parts.length === 2 && CLIENT_ID_RE.test(parts[1])) {
    const tab = new URLSearchParams(search).get('aba') === 'docs' ? 'docs' : 'kanban'
    return { ...base, view, clientId: parts[1], tab, valid: true }
  }
  if (parts.length > 1) return { ...base, valid: false }
  return { ...base, view, valid: true }
}

export const viewPath = (view) => `/${VIEW_KEYS.includes(view) ? view : DEFAULT_VIEW}`

export const clientPath = (clientId, tab = 'kanban') =>
  `/clientes/${encodeURIComponent(clientId)}${tab === 'docs' ? '?aba=docs' : ''}`
