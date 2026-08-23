import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getAuth, setAuth } from './api.js'
import { tagColor } from './colors.js'

// Colunas padrão — usadas como fallback antes de qualquer persistência
const DEFAULT_COLUMNS = [
  { id: 'col-todo',  key: 'todo',  label: 'A Fazer',       position: 0, color: '#9ca3af' },
  { id: 'col-doing', key: 'doing', label: 'Em Progresso',  position: 1, color: '#14b8c4' },
  { id: 'col-done',  key: 'done',  label: 'Concluído',     position: 2, color: '#2ec27e' },
]

// Paleta de cores para novas colunas (evita conflito com as 3 padrão)
const EXTRA_COLORS = ['#a855f7', '#f2a93b', '#e85d75', '#4f8ff7', '#f97316', '#0ea5e9', '#ec4899']

const colsLsKey = (uid) => `fb_cols_${uid}`

// Gera um slug URL-safe + sufixo único baseado em timestamp
const toColKey = (label) => {
  const slug = label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'col'
  return `${slug}-${Date.now().toString(36)}`
}
import Login from './components/Login.jsx'
import Activate from './components/Activate.jsx'
import Dashboard from './components/Dashboard.jsx'
import Kanban from './components/Kanban.jsx'
import Calendar from './components/Calendar.jsx'
import NotesView from './components/NotesView.jsx'
import TeamView from './components/TeamView.jsx'
import RegistryView from './components/RegistryView.jsx'
import ClientsView from './components/ClientsView.jsx'
import ClientWorkspace from './components/ClientWorkspace.jsx'
import ReportsView from './components/ReportsView.jsx'
import ProfileView from './components/ProfileView.jsx'
import SendToKanbanModal from './components/SendToKanbanModal.jsx'
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

// Token de ativação vindo do link de convite (/activate/:token). É a única
// rota do app — não há react-router, então lemos direto do path.
const activationTokenFromUrl = () => {
  const match = window.location.pathname.match(/^\/activate\/([A-Za-z0-9._-]+)\/?$/)
  return match ? match[1] : null
}

export default function App() {
  const [activationToken, setActivationToken] = useState(activationTokenFromUrl)
  const [session, setSession] = useState(getAuth)
  const [view, setView] = useState('painel')
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [members, setMembers] = useState([])
  const [clients, setClients] = useState([])
  const [tags, setTags] = useState([])
  // Cliente aberto no "Espaço dos Clientes" (null = listagem)
  const [selectedClientId, setSelectedClientId] = useState(null)
  // Sub-aba ativa dentro do Espaço do Cliente ('kanban' | 'docs') — controlada
  // aqui para permitir abrir direto em Documentações (ex.: link de uma nota)
  const [clientTab, setClientTab] = useState('kanban')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
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

  // Colunas do Kanban — inicializa do localStorage; sincroniza com a API quando disponível
  const [columns, setColumns] = useState(() => {
    const auth = getAuth()
    if (!auth?.user?.id) return DEFAULT_COLUMNS
    try {
      const saved = JSON.parse(localStorage.getItem(colsLsKey(auth.user.id)) || 'null')
      if (Array.isArray(saved) && saved.length > 0) return saved
    } catch {}
    return DEFAULT_COLUMNS
  })

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleError = (err) => {
    console.error(err)
    showToast(`Erro: ${err.message}`)
  }

  const loadAll = useCallback(async () => {
    try {
      const [t, n, mb] = await Promise.all([
        api.getTasks(),
        api.getNotes(),
        api.getMembers(),
      ])
      setTasks(t)
      setNotes(n)
      setMembers(mb)
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }

    // Clientes — tabela pode não existir ainda (antes da migração); falha silenciosa
    api.getClients()
      .then((c) => { if (Array.isArray(c)) setClients(c) })
      .catch(() => { /* tabela fourbase_clients ainda não criada */ })

    // Etiquetas — tabela pode não existir ainda (antes da migração); falha silenciosa
    api.getTags()
      .then((tg) => { if (Array.isArray(tg)) setTags(tg) })
      .catch(() => { /* tabela fourbase_tags ainda não criada */ })

    // Tenta carregar colunas da API (tabela pode não existir ainda — falha silenciosa)
    api.getColumns()
      .then((cols) => {
        if (Array.isArray(cols) && cols.length > 0) {
          setColumns(cols)
          const auth = getAuth()
          if (auth?.user?.id) {
            localStorage.setItem(colsLsKey(auth.user.id), JSON.stringify(cols))
          }
        }
      })
      .catch(() => { /* tabela ainda não criada — usa localStorage/padrão */ })
  }, [])

  useEffect(() => {
    if (session && !activationToken) loadAll()
  }, [session, activationToken, loadAll])

  const login = (auth) => {
    setAuth(auth)
    setSession(auth)
    setLoading(true)
    setView('painel')
  }

  const logout = () => {
    setAuth(null)
    setSession(null)
    setTasks([])
    setNotes([])
  }

  // Perfil salvo: o backend devolve {token, user} com um JWT novo (o nome vai
  // assinado nele). Regrava a sessão para a sidebar refletir na hora, sem F5.
  const applyProfileUpdate = ({ token, user: updated }) => {
    const next = { token, user: updated }
    setAuth(next)
    setSession(next)
    // A lista de membros alimenta avatares/cores em Kanban, Calendário etc.
    setMembers((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? { ...m, name: updated.name, color: updated.color, avatar_url: updated.avatar_url }
          : m,
      ),
    )
  }

  // ---- colunas ----
  const addColumn = (label) => {
    const key = toColKey(label)
    const color = EXTRA_COLORS[columns.length % EXTRA_COLORS.length]
    const newCol = { id: `col-${key}`, key, label: label.trim(), position: columns.length, color }

    setColumns((prev) => {
      const next = [...prev, newCol]
      const auth = getAuth()
      if (auth?.user?.id) localStorage.setItem(colsLsKey(auth.user.id), JSON.stringify(next))
      return next
    })

    // Tenta sincronizar com o banco — silencioso se a tabela ainda não existir
    api.createColumn(newCol.label, key, newCol.position, color).catch(() => {})
  }

  // ---- tarefas ----
  const addTask = (title, priority, due_date, assigned_to, description, client_id = null, tags = []) =>
    api
      .addTask(title, priority, due_date, assigned_to, description, client_id, tags)
      .then((t) => setTasks((prev) => [...prev, t]))
      .catch(handleError)

  // Criação com o objeto completo, vinda do modal de especificações da tarefa
  const createTask = (draft) =>
    api
      .createTask(draft)
      .then((t) => {
        setTasks((prev) => [...prev, t])
        if (t.client_id) setClientLinkedTasks((prev) => [...prev, t])
        showToast('Tarefa criada.')
        return t
      })
      .catch(handleError)

  const openSendToKanban = (title, description = '') => setKanbanDraft({ title, description })

  const confirmSendToKanban = (data) =>
    api
      .addTask(data.title, data.priority, data.due_date, data.assigned_to, data.description)
      .then((t) => {
        setTasks((prev) => [...prev, t])
        setKanbanDraft(null)
        showToast('Enviado para o Kanban.')
      })
      .catch(handleError)

  const moveTask = (id, column_key) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    setClientLinkedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    api.moveTask(id, column_key).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  const updateTask = (id, updates) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
    setClientLinkedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
    api.updateTask(id, updates).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setClientLinkedTasks((prev) => prev.filter((t) => t.id !== id))
    api.deleteTask(id).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  // Cria uma etiqueta nova (usada pelo TagPicker ao digitar um nome inexistente).
  // Se o nome já existir, a API devolve a etiqueta existente em vez de duplicar.
  const createTag = (name) =>
    api.createTag(name.trim(), tagColor(name.trim(), tags)).then((tag) => {
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
      return tag
    }).catch((err) => { handleError(err); throw err })

  // ---- notas ----
  const createNote = () =>
    api
      .createNote('Nova nota', '')
      .then((n) => {
        setNotes((prev) => [n, ...prev])
        return n
      })
      .catch((err) => {
        handleError(err)
        return null
      })

  const saveNote = (id, title, content) =>
    api
      .updateNote(id, title, content)
      .then((n) => {
        setNotes((prev) => {
          const rest = prev.filter((x) => x.id !== id)
          return [n, ...rest]
        })
        showToast('Nota salva.')
      })
      .catch(handleError)

  const deleteNote = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    api.deleteNote(id).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  const linkNoteFolder = (id, folderId) =>
    api
      .updateNoteFolder(id, folderId)
      .then((n) => setNotes((prev) => prev.map((x) => (x.id === id ? n : x))))
      .catch(handleError)

  const updateNoteAttachments = (id, attachments) =>
    api
      .updateNoteAttachments(id, attachments)
      .then((n) => setNotes((prev) => prev.map((x) => (x.id === id ? n : x))))
      .catch(handleError)

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
    setClientTab('docs')
    setSelectedClientId(clientId)
    setView('clientes')
  }

  // Navega para a aba Notas já com a nota indicada selecionada
  const navigateToNote = (noteId) => {
    setTargetNoteId(noteId)
    setView('notas')
  }

  // ---- convite de membro (gestor) ----
  // Devolve { invitation, activation_url } para o modal exibir o link — a
  // pessoa convidada só vira membro depois de ativar a conta, então a lista de
  // membros não muda aqui.
  const inviteMember = (invite) =>
    api.inviteMember(invite).then((result) => {
      showToast('Convite criado.')
      return result
    })
    // erro propagado para o modal exibir a mensagem

  // ---- clientes ----
  const createClient = (client) =>
    api.createClient(client).then((c) => {
      setClients((prev) => [c, ...prev])
      showToast('Cliente cadastrado.')
      return c
    }).catch((err) => { handleError(err); throw err })

  const updateClient = (id, updates) =>
    api.updateClient(id, updates).then((c) => {
      setClients((prev) => prev.map((x) => (x.id === id ? c : x)))
      showToast('Cliente atualizado.')
      return c
    }).catch((err) => { handleError(err); throw err })

  // mode: 'archive' mantém as pastas de documentação (desvinculadas) |
  //       'cascade' exclui as pastas do cliente
  const deleteClient = (id, mode = 'archive') => {
    setClients((prev) => prev.filter((c) => c.id !== id))
    // Se o cliente aberto foi excluído, volta para a listagem
    setSelectedClientId((prev) => (prev === id ? null : prev))
    return api.deleteClient(id, mode)
      .then(() => showToast(mode === 'cascade' ? 'Cliente e pastas excluídos.' : 'Cliente excluído; pastas arquivadas.'))
      .catch((err) => {
        handleError(err)
        loadAll()
      })
  }

  // Cliente aberto no workspace
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  )

  // Backlog do Kanban do cliente — TODAS as tarefas daquele client_id, de
  // qualquer responsável (não só as do usuário logado). `GET /api/tasks`
  // filtra por `assigned_to = usuário logado`, então o Kanban do cliente
  // precisa de uma busca própria para que um funcionário veja as atividades
  // que outro funcionário/gestor colocou no quadro do mesmo cliente.
  const [clientTasks, setClientTasks] = useState([])

  // Progresso por cliente da listagem — vem agregado do servidor contando as
  // tarefas de toda a equipe, não só as do usuário logado.
  const [clientStats, setClientStats] = useState({})

  const fetchClientStats = useCallback(() => {
    api.getClientTaskStats()
      .then((s) => { if (s && typeof s === 'object') setClientStats(s) })
      .catch(() => { /* rota ainda não disponível — mantém o último valor */ })
  }, [])

  // Todas as tarefas vinculadas a algum cliente, de qualquer responsável —
  // juntadas com `tasks` (pessoais) para o Calendário mostrar também o que a
  // equipe agenda nos Kanbans de cliente, e não só o que está atribuído ao
  // usuário logado.
  const [clientLinkedTasks, setClientLinkedTasks] = useState([])

  const fetchClientLinkedTasks = useCallback(() => {
    api.getClientLinkedTasks()
      .then((list) => { if (Array.isArray(list)) setClientLinkedTasks(list) })
      .catch(() => { /* rota ainda não disponível — mantém o último valor */ })
  }, [])

  // Ativo enquanto o Calendário está aberto: carrega e revalida periodicamente
  // (e ao voltar o foco pra aba) para refletir tarefas criadas/movidas por
  // outras pessoas nos Kanbans de cliente, sem precisar de F5.
  useEffect(() => {
    if (view !== 'calendario') return
    fetchClientLinkedTasks()
    const poll = setInterval(fetchClientLinkedTasks, 15000)
    window.addEventListener('focus', fetchClientLinkedTasks)
    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', fetchClientLinkedTasks)
    }
  }, [view, fetchClientLinkedTasks])

  // Lista efetiva do Calendário: tarefas pessoais + tarefas de cliente de toda
  // a equipe, sem duplicar quando a mesma tarefa aparece nas duas (ela é
  // pessoal E de cliente ao mesmo tempo quando o responsável é o usuário logado).
  const calendarTasks = useMemo(() => {
    const merged = new Map(tasks.map((t) => [t.id, t]))
    for (const t of clientLinkedTasks) merged.set(t.id, { ...merged.get(t.id), ...t })
    return Array.from(merged.values())
  }, [tasks, clientLinkedTasks])

  const fetchClientTasks = useCallback((id) => {
    if (!id) { setClientTasks([]); return }
    api.getTasksByClient(id).then(setClientTasks).catch(handleError)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchClientTasks(selectedClientId)
  }, [selectedClientId, fetchClientTasks])

  // Polling leve: mantém o quadro do cliente atualizado com o que outras
  // pessoas da equipe adicionarem/moverem, sem precisar recarregar a página.
  useEffect(() => {
    if (!selectedClientId) return
    const poll = setInterval(() => fetchClientTasks(selectedClientId), 6000)
    const onFocus = () => fetchClientTasks(selectedClientId)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
    }
  }, [selectedClientId, fetchClientTasks])

  // Progresso da listagem de clientes: recarrega ao abrir a lista e enquanto
  // ela estiver visível, para refletir o que a equipe concluiu sem exigir F5.
  useEffect(() => {
    if (view !== 'clientes' || selectedClientId) return
    fetchClientStats()
    const poll = setInterval(fetchClientStats, 15000)
    window.addEventListener('focus', fetchClientStats)
    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', fetchClientStats)
    }
  }, [view, selectedClientId, fetchClientStats])

  // CRUD do Kanban do cliente — atua sobre `clientTasks` (visão compartilhada
  // de todo mundo) e replica em `tasks` quando a tarefa também pertence à
  // lista pessoal do usuário logado, mantendo Painel/Calendário coerentes.
  const addClientTask = (title, priority, due_date, assigned_to, description, client_id = null, tags = []) =>
    api
      .addTask(title, priority, due_date, assigned_to, description, client_id, tags)
      .then((t) => {
        setClientTasks((prev) => [...prev, t])
        setClientLinkedTasks((prev) => [...prev, t])
        if (t.assigned_to === user?.id) setTasks((prev) => [...prev, t])
      })
      .catch(handleError)

  const moveClientTask = (id, column_key) => {
    setClientTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    setClientLinkedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    api.moveTask(id, column_key).catch((err) => {
      handleError(err)
      fetchClientTasks(selectedClientId)
    })
  }

  const updateClientTask = (id, updates) => {
    setClientTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
    setClientLinkedTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
    api.updateTask(id, updates).catch((err) => {
      handleError(err)
      fetchClientTasks(selectedClientId)
    })
  }

  const deleteClientTask = (id) => {
    setClientTasks((prev) => prev.filter((t) => t.id !== id))
    setClientLinkedTasks((prev) => prev.filter((t) => t.id !== id))
    setTasks((prev) => prev.filter((t) => t.id !== id))
    api.deleteTask(id).catch((err) => {
      handleError(err)
      fetchClientTasks(selectedClientId)
    })
  }

  // Trocar de aba sempre volta o módulo de clientes para a listagem
  const changeView = (next) => {
    setSelectedClientId(null)
    setView(next)
    setMobileMenuOpen(false)
  }

  // Fecha o drawer mobile com ESC, igual aos modais do app
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mobileMenuOpen])

  // Abre o Espaço de um cliente sempre começando pelo Kanban
  const openClient = (id) => {
    setSelectedClientId(id)
    setClientTab('kanban')
  }

  // Ativação de convite — única "rota" do app (não há react-router). O token
  // sai do path; ao terminar, limpamos a URL. Convite inválido cai no Login;
  // ativação bem-sucedida entra direto (a resposta do accept já tem token +
  // user, mesmo formato do login normal — sem pedir e-mail/senha de novo).
  if (activationToken) {
    return (
      <Activate
        token={activationToken}
        onActivated={() => {
          window.history.replaceState({}, '', '/')
          setActivationToken(null)
        }}
        onLogin={(auth) => {
          window.history.replaceState({}, '', '/')
          setActivationToken(null)
          login(auth)
        }}
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
          <Kanban
            tasks={tasks}
            members={members}
            clients={clients}
            currentUser={user}
            columns={columns}
            tags={tags}
            onAdd={addTask}
            onMove={moveTask}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onAddColumn={addColumn}
            onCreateTag={createTag}
          />
        )
      case 'calendario':
        return (
          <Calendar
            tasks={calendarTasks}
            members={members}
            clients={clients}
            currentUser={user}
            columns={columns}
            tags={tags}
            onCreate={createTask}
            onUpdate={updateTask}
            onMove={moveTask}
            onDelete={deleteTask}
            onCreateTag={createTag}
          />
        )
      case 'notas':
        return (
          <NotesView
            notes={notes}
            onCreate={createNote}
            onSave={saveNote}
            onDelete={deleteNote}
            onSendToKanban={openSendToKanban}
            onLinkFolder={linkNoteFolder}
            onUpdateAttachments={updateNoteAttachments}
            onNavigateToFolder={navigateToFolder}
            targetNoteId={targetNoteId}
            onConsumeNoteTarget={() => setTargetNoteId(null)}
          />
        )
      case 'cadastro':
        return (
          <RegistryView
            isGestor={isGestor}
            onCreateMember={inviteMember}
            onCreateClient={createClient}
          />
        )
      case 'clientes':
        return selectedClient ? (
          <ClientWorkspace
            client={selectedClient}
            tasks={clientTasks}
            members={members}
            currentUser={user}
            columns={columns}
            tags={tags}
            tab={clientTab}
            onTabChange={setClientTab}
            targetFolderId={targetFolderId}
            onConsumeTarget={() => setTargetFolderId(null)}
            onBack={() => setSelectedClientId(null)}
            onAdd={addClientTask}
            onMove={moveClientTask}
            onUpdate={updateClientTask}
            onDelete={deleteClientTask}
            onAddColumn={addColumn}
            onCreateTag={createTag}
            onError={handleError}
            onOpenNote={navigateToNote}
            onUnlinkNote={(id) => linkNoteFolder(id, null)}
          />
        ) : (
          <ClientsView
            clients={clients}
            taskStats={clientStats}
            onUpdate={updateClient}
            onDelete={deleteClient}
            onOpenClient={openClient}
          />
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
          <ReportsView
            members={members}
            clients={clients}
            columns={columns}
            currentUser={user}
            onError={handleError}
          />
        ) : null
      default:
        return (
          <Dashboard
            tasks={tasks}
            notes={notes}
            members={members}
            clients={clients}
            currentUser={user}
            columns={columns}
            tags={tags}
            onNavigate={changeView}
            onCreateTask={() => openSendToKanban('', '')}
            onUpdateTask={updateTask}
            onMoveTask={moveTask}
            onDeleteTask={deleteTask}
            onCreateTag={createTag}
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
        <button className="action" onClick={loadAll}>
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
        </section>
        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <p>Carregando dados do banco...</p>
          </div>
        ) : (
          <section className="view" key={view}>
            {renderView()}
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
      {kanbanDraft && (
        <SendToKanbanModal
          draft={kanbanDraft}
          members={members}
          currentUser={user}
          onCancel={() => setKanbanDraft(null)}
          onConfirm={confirmSendToKanban}
        />
      )}
    </div>
  )
}
