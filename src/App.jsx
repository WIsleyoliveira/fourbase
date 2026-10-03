import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from './toast.jsx'
import { api, getAuth, setAuth } from './api.js'
import { useTaskActions } from './hooks/useTasks.js'
import { patchMemberInCache, useClients } from './hooks/useWorkspaceData.js'
import { DEFAULT_VIEW, GESTOR_ONLY_VIEWS, clientPath, parseLocation, viewPath, withTaskParam } from './routes.js'

import Login from './components/Login.jsx'
import Activate from './components/Activate.jsx'
import Dashboard from './components/Dashboard.jsx'
import { MyKanban } from './components/Kanban.jsx'
import Calendar from './components/Calendar.jsx'
import NotesView from './components/NotesView.jsx'
import TeamView from './components/TeamView.jsx'
import RegistryView from './components/RegistryView.jsx'
import ClientsView from './components/ClientsView.jsx'
import ClientWorkspace from './components/ClientWorkspace.jsx'
import ReportsView from './components/ReportsView.jsx'
import ProfileView from './components/ProfileView.jsx'
import SendToKanbanModal from './components/SendToKanbanModal.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import TaskPeekModal from './components/TaskPeekModal.jsx'
import {
  IconDashboard,
  IconKanban,
  IconCalendar,
  IconNotes,
  IconRefresh,
  IconTeam,
  IconUserPlus,
  IconBuilding,
  IconFileSpreadsheet,
  IconLogout,
  IconUserCog,
  IconChevronRight,
} from './icons.jsx'

const VIEWS = [
  { key: 'painel', label: 'Painel principal', icon: IconDashboard, title: 'Painel principal', subtitle: 'Visão geral do seu workspace' },
  { key: 'kanban', label: 'Kanban', icon: IconKanban, title: 'Kanban de tarefas', subtitle: 'Organize o fluxo de trabalho arrastando os cartões' },
  { key: 'calendario', label: 'Calendário', icon: IconCalendar, title: 'Calendário', subtitle: 'Prazos de entrega das suas tarefas' },
  { key: 'notas', label: 'Notas', icon: IconNotes, title: 'Notas e documentação', subtitle: 'Escrita livre para ideias, decisões e registros' },
  { key: 'clientes', label: 'Clientes', icon: IconBuilding, title: 'Clientes', subtitle: 'Empresas e clientes cadastrados' },
  { key: 'relatorios', label: 'Relatórios', icon: IconFileSpreadsheet, title: 'Relatórios', subtitle: 'Planilha de atividades por responsável e cliente', gestorOnly: true },
]

// Fica fora de VIEWS de propósito: é renderizado no bloco inferior da sidebar,
// junto do card do usuário, e não na lista principal de navegação.
const PROFILE_VIEW = {
  key: 'perfil',
  label: 'Meu Perfil',
  icon: IconUserCog,
  title: 'Meu Perfil',
  subtitle: 'Seus dados pessoais, foto e segurança de acesso',
}

// Também fica fora de VIEWS de propósito: renderizado como botão próprio,
// logo acima de "Meu Perfil" — exclusivo de gestor, então não faz sentido
// competir por espaço na lista principal de navegação.
const CADASTRO_VIEW = {
  key: 'cadastro',
  label: 'Cadastro',
  icon: IconUserPlus,
  title: 'Central de Cadastros',
  subtitle: 'Inicie o cadastro de membros da equipe e clientes',
}

// Idem: fica fora de VIEWS porque é renderizado dentro do agrupamento
// "Área do gestor", junto de Cadastro e Meu Perfil, e não na lista principal.
const EQUIPE_VIEW = {
  key: 'equipe',
  label: 'Equipe',
  icon: IconTeam,
  title: 'Visão da equipe',
  subtitle: 'Acompanhe as tarefas e o progresso de todos',
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  // A URL é a fonte da verdade da navegação (ver src/routes.js): tela, cliente
  // aberto e sub-aba saem dela, o que dá deep link, botão voltar e F5 que
  // mantém o lugar. /activate/:token é o link de convite.
  const route = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search],
  )
  const { activationToken, view, clientId: selectedClientId, tab: clientTab } = route
  const queryClient = useQueryClient()
  const [session, setSession] = useState(getAuth)
  // Barra lateral recolhível — lembra a preferência entre sessões
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('fb_sidebar_open') !== '0')
  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem('fb_sidebar_open', next ? '1' : '0')
      return next
    })
  }
  // Drawer da sidebar em telas < 768px — não persiste entre sessões, é
  // sempre fechado ao carregar (comportamento normal de menu mobile).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [kanbanDraft, setKanbanDraft] = useState(null)
  const [targetFolderId, setTargetFolderId] = useState(null)
  const [targetNoteId, setTargetNoteId] = useState(null)

  const { showToast, handleError } = useToast()

  // Só o cliente aberto na URL precisa dos dados aqui (título, guarda de rota e o
  // quadro do cliente); cada tela lê o resto direto do cache (hooks/*).
  const clientsQuery = useClients()
  const clients = clientsQuery.data ?? []
  const userId = session?.user?.id
  const { addTask } = useTaskActions({ userId })

  const login = (auth) => {
    setAuth(auth)
    setSession(auth)
    // Quem chegou por um link direto (ex.: /kanban) entra nele; URL que não
    // é tela (ex.: "/") vai para o painel.
    if (!route.valid || route.activationToken) navigate(viewPath(DEFAULT_VIEW), { replace: true })
  }

  const logout = () => {
    setAuth(null)
    setSession(null)
    // Descarta o cache: a próxima pessoa a entrar neste navegador não pode
    // ver nem por um instante os dados de quem saiu.
    queryClient.clear()
    navigate('/', { replace: true })
  }

  // Perfil salvo: o backend devolve {token, user} com um JWT novo (o nome vai
  // assinado nele). Regrava a sessão para a sidebar refletir na hora, sem F5.
  const applyProfileUpdate = ({ token, user: updated }) => {
    const next = { token, user: updated }
    setAuth(next)
    setSession(next)
    // A lista de membros alimenta avatares/cores em Kanban, Calendário etc.
    patchMemberInCache(queryClient, updated)
  }

  // Onboarding do primeiro acesso — a flag mora no banco (não em
  // localStorage), então não reaparece ao trocar de navegador/dispositivo.
  const completeOnboarding = () =>
    api.updateProfile({ has_completed_onboarding: true })
      .then(applyProfileUpdate)
      .catch(handleError)

  const openSendToKanban = (title, description = '') => setKanbanDraft({ title, description })

  const confirmSendToKanban = async (data) => {
    const t = await addTask(data.title, data.priority, data.due_date, data.assigned_to, data.description)
    if (!t) return
    setKanbanDraft(null)
    showToast('Enviado para o Kanban.')
  }

  // Navega para o Espaço do Cliente dono da pasta, já na sub-aba Documentações
  // com a pasta indicada aberta/selecionada. Documentações não existe mais como
  // rota global — toda pasta vive dentro do Espaço de um cliente (exceto pastas
  // arquivadas de um cliente excluído, que ficam sem client_id).
  const navigateToFolder = (folderId, clientId) => {
    if (!clientId) {
      showToast('Esta pasta não está vinculada a um cliente ativo.')
      return
    }
    setTargetFolderId(folderId)
    navigate(clientPath(clientId, 'docs'))
  }

  // Navega para a aba Notas já com a nota indicada selecionada
  const navigateToNote = (noteId) => {
    setTargetNoteId(noteId)
    navigate(viewPath('notas'))
  }

  // Cliente aberto no workspace
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  )

  // Trocar de aba sempre volta o módulo de clientes para a listagem
  const changeView = (next) => {
    navigate(viewPath(next))
    setMobileMenuOpen(false)
  }

  // URL que não é uma tela, ou tela de gestor aberta por quem não é gestor,
  // cai no painel (replace: não deixa a URL ruim no histórico).
  const isGestorSession = session?.user?.role === 'gestor'
  const blockedForRole = GESTOR_ONLY_VIEWS.includes(view) && !isGestorSession
  useEffect(() => {
    if (activationToken || !session) return
    if (!route.valid || blockedForRole) navigate(viewPath(DEFAULT_VIEW), { replace: true })
  }, [activationToken, session, route.valid, blockedForRole, navigate])

  // /clientes/:id com um id que não existe (apagado, de outro workspace, link
  // velho) volta para a listagem em vez de mostrar uma tela vazia.
  useEffect(() => {
    if (!session || clientsQuery.isPending || !selectedClientId) return
    if (!clients.some((c) => c.id === selectedClientId)) {
      navigate(viewPath('clientes'), { replace: true })
    }
  }, [session, clientsQuery.isPending, clients, selectedClientId, navigate])

  // Fecha o drawer mobile com ESC, igual aos modais do app
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mobileMenuOpen])

  // Fecha o painel da tarefa (?tarefa=): tira o parâmetro da URL com replace,
  // sem criar entrada no histórico e mantendo a tela de baixo.
  const closeTaskPeek = useCallback(() => {
    navigate(
      { pathname: location.pathname, search: withTaskParam(location.search, null) },
      { replace: true },
    )
  }, [navigate, location.pathname, location.search])

  // Abre o Espaço de um cliente sempre começando pelo Kanban
  const openClient = (id) => navigate(clientPath(id))

  // Troca de sub-aba (Kanban/Documentações) do Espaço do Cliente. replace: as
  // abas não enchem o histórico — o botão voltar sai do cliente.
  const changeClientTab = (tab) => navigate(clientPath(selectedClientId, tab), { replace: true })

  // Ativação de convite (/activate/:token). Ao terminar, sai da URL do token.
  // Convite inválido cai no Login; ativação bem-sucedida entra direto (a
  // resposta do accept já tem token + user, mesmo formato do login normal —
  // sem pedir e-mail/senha de novo).
  if (activationToken) {
    return (
      <Activate
        token={activationToken}
        onActivated={() => navigate('/', { replace: true })}
        onLogin={login}
      />
    )
  }

  if (!session) return <Login onLogin={login} />

  const user = session.user
  const isGestor = user.role === 'gestor'
  const visibleViews = VIEWS.filter((v) => !v.gestorOnly || isGestor)
  const baseView = [...VIEWS, PROFILE_VIEW, CADASTRO_VIEW, EQUIPE_VIEW].find((v) => v.key === view) || VIEWS[0]
  // No workspace de um cliente, o cabeçalho passa a identificar o cliente aberto
  const current = selectedClient
    ? { title: selectedClient.name || 'Cliente sem nome', subtitle: 'Espaço do cliente · Kanban e Documentações' }
    : baseView

  const renderView = () => {
    switch (view) {
      case 'kanban':
        return (
          <MyKanban currentUser={user} />
        )
      case 'calendario':
        return (
          <Calendar currentUser={user} />
        )
      case 'notas':
        return (
          <NotesView
            currentUser={user}
            onSendToKanban={openSendToKanban}
            onNavigateToFolder={navigateToFolder}
            targetNoteId={targetNoteId}
            onConsumeNoteTarget={() => setTargetNoteId(null)}
          />
        )
      case 'cadastro':
        return (
          <RegistryView isGestor={isGestor} />
        )
      case 'clientes':
        return selectedClient ? (
          <ClientWorkspace
            client={selectedClient}
            currentUser={user}
            tab={clientTab}
            onTabChange={changeClientTab}
            targetFolderId={targetFolderId}
            onConsumeTarget={() => setTargetFolderId(null)}
            onBack={() => navigate(viewPath('clientes'))}
            onOpenNote={navigateToNote}
          />
        ) : (
          <ClientsView onOpenClient={openClient} />
        )
      case 'equipe':
        return isGestor ? <TeamView onError={handleError} /> : null
      case 'perfil':
        return (
          <ProfileView
            currentUser={user}
            onProfileSaved={applyProfileUpdate}
            onToast={showToast}
            onError={handleError}
          />
        )
      case 'relatorios':
        return isGestor ? (
          <ReportsView currentUser={user} onError={handleError} />
        ) : null
      default:
        return (
          <Dashboard
            currentUser={user}
            onNavigate={changeView}
            onCreateTask={() => openSendToKanban('', '')}
            onCompleteOnboarding={completeOnboarding}
          />
        )
    }
  }

  return (
    <div className={`app${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      {/* Cabeçalho compacto — só visível abaixo de 768px (ver styles.css) */}
      <header className="mobile-topbar">
        <button
          className="mobile-topbar-menu"
          title="Abrir menu"
          aria-label="Abrir menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <img src="/fourbase-logo.png" alt="fourbase" className="mobile-topbar-logo" />
        <div className="mobile-topbar-actions">
          <NotificationBell className="notif-wrap-mobile" />
          <button
            className="mobile-topbar-profile"
            title="Abrir Meu Perfil"
            onClick={() => changeView('perfil')}
          >
            <div className="member-avatar">
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.name} />
                : user.name.charAt(0).toUpperCase()}
            </div>
          </button>
        </div>
      </header>

      {/* Overlay escurecido atrás do drawer — clicar fecha o menu */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}${mobileMenuOpen ? ' mobile-open' : ''}`}>
        <button
          className="sidebar-toggle"
          title={sidebarOpen ? 'Recolher barra lateral' : 'Expandir barra lateral'}
          onClick={toggleSidebar}
        >
          <IconChevronRight size={13} />
        </button>
        <button
          className="sidebar-mobile-close"
          title="Fechar menu"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        >
          ×
        </button>
        <div className="brand">
          <img src="/fourbase-logo.png" alt="fourbase" className="brand-logo" />
          <div>
            <h1>fourbase</h1>
            <p>Gestão visual de tarefas</p>
          </div>
        </div>
        <nav className="menu">
          {visibleViews.map((v) => {
            const Ico = v.icon
            return (
              <button
                key={v.key}
                className={view === v.key ? 'active' : ''}
                onClick={() => changeView(v.key)}
              >
                <Ico />
                <span>{v.label}</span>
              </button>
            )
          })}
        </nav>
        {isGestor ? (
          <div className="sidebar-group">
            <p className="sidebar-group-label">Área do gestor</p>
            <button
              className={`sidebar-profile-btn${view === 'cadastro' ? ' active' : ''}`}
              onClick={() => changeView('cadastro')}
            >
              <IconUserPlus size={17} />
              <span>{CADASTRO_VIEW.label}</span>
            </button>
            <button
              className={`sidebar-profile-btn${view === 'perfil' ? ' active' : ''}`}
              onClick={() => changeView('perfil')}
            >
              <IconUserCog size={17} />
              <span>{PROFILE_VIEW.label}</span>
            </button>
            <button
              className={`sidebar-profile-btn${view === 'equipe' ? ' active' : ''}`}
              onClick={() => changeView('equipe')}
            >
              <IconTeam size={17} />
              <span>{EQUIPE_VIEW.label}</span>
            </button>
          </div>
        ) : (
          <button
            className={`sidebar-profile-btn${view === 'perfil' ? ' active' : ''}`}
            onClick={() => changeView('perfil')}
          >
            <IconUserCog size={17} />
            <span>{PROFILE_VIEW.label}</span>
          </button>
        )}
        <div className="user-box">
          <button
            className="user-box-identity"
            title="Abrir Meu Perfil"
            onClick={() => changeView('perfil')}
          >
            <div className="member-avatar">
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.name} />
                : user.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-box-id">
              <strong>{user.name}</strong>
              <span className={`role-badge ${user.role}`}>
                {isGestor ? 'Gestor' : 'Funcionário'}
              </span>
            </div>
          </button>
          <button className="icon-btn logout-btn" title="Sair" onClick={logout}>
            <IconLogout size={16} />
          </button>
        </div>
        <button className="action" onClick={() => queryClient.invalidateQueries()}>
          <IconRefresh />
          <span>Recarregar dados</span>
        </button>
        <div className="footer-note">fourbase workspace</div>
      </aside>
      <main className={`main${view === 'calendario' ? ' main-full' : ''}`}>
        <section className="topbar">
          <div>
            <h2>{current.title}</h2>
            <p>{current.subtitle}</p>
          </div>
          <NotificationBell className="notif-wrap-desktop" />
        </section>
        <section className="view" key={view}>
          {renderView()}
        </section>
      </main>
      {kanbanDraft && (
        <SendToKanbanModal
          draft={kanbanDraft}
          currentUser={user}
          onCancel={() => setKanbanDraft(null)}
          onConfirm={confirmSendToKanban}
        />
      )}
      {route.taskId && <TaskPeekModal taskId={route.taskId} onClose={closeTaskPeek} />}
    </div>
  )
}
