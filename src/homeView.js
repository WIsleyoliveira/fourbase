// Tela inicial escolhida por cada pessoa (Meu Perfil → Tela inicial). Fica neste navegador, por usuário:
// quem divide o computador cada um com a sua, e nunca vaza para outra conta.
import { DEFAULT_VIEW } from './routes.js'

const key = (userId) => `fb_home_${userId}`

// Telas que a pessoa pode escolher (as mesmas que o menu mostra para ela).
export function homeChoices({ isGestor = false, assistantEnabled = false } = {}) {
  const base = [
    ['painel', 'Painel principal'], ['kanban', 'Kanban'], ['calendario', 'Calendário'],
    ['notas', 'Notas'], ['clientes', 'Clientes'],
  ]
  if (isGestor) base.push(['relatorios', 'Relatórios'], ['equipe', 'Equipe'], ['cadastro', 'Cadastro'])
  if (isGestor && assistantEnabled) base.push(['assistente', 'Assistente'])
  return base.map(([value, label]) => ({ value, label }))
}

export function getHomeView(userId, perms = {}) {
  if (!userId) return DEFAULT_VIEW
  let saved = null
  try { saved = localStorage.getItem(key(userId)) } catch { /* sem armazenamento: painel */ }
  return homeChoices(perms).some((c) => c.value === saved) ? saved : DEFAULT_VIEW
}

export function setHomeView(userId, view, perms = {}) {
  if (!userId) return false
  const ok = homeChoices(perms).some((c) => c.value === view)
  try {
    if (!ok || view === DEFAULT_VIEW) localStorage.removeItem(key(userId))
    else localStorage.setItem(key(userId), view)
  } catch { return false }
  return ok
}
