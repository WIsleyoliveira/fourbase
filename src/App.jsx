import { useCallback, useEffect, useState } from 'react'
import { api, getAuth, setAuth } from './api.js'
import { supabase, MEDIA_BUCKET, storagePathFromUrl } from './supabase.js'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Kanban from './components/Kanban.jsx'
import NotesView from './components/NotesView.jsx'
import MediaPanel from './components/MediaPanel.jsx'
import Checklist from './components/Checklist.jsx'
import TeamView from './components/TeamView.jsx'
import {
  IconDashboard,
  IconKanban,
  IconNotes,
  IconMedia,
  IconCheck,
  IconRefresh,
  IconTeam,
  IconLogout,
} from './icons.jsx'

const VIEWS = [
  { key: 'painel', label: 'Painel principal', icon: IconDashboard, title: 'Painel principal', subtitle: 'Visão geral do seu workspace' },
  { key: 'kanban', label: 'Kanban', icon: IconKanban, title: 'Kanban de tarefas', subtitle: 'Organize o fluxo de trabalho arrastando os cartões' },
  { key: 'notas', label: 'Notas', icon: IconNotes, title: 'Notas e documentação', subtitle: 'Escrita livre para ideias, decisões e registros' },
  { key: 'midia', label: 'Mídia', icon: IconMedia, title: 'Imagens e vídeos', subtitle: 'Anexos visuais do projeto' },
  { key: 'checklist', label: 'Checklist', icon: IconCheck, title: 'Checklist rápido', subtitle: 'Acompanhamento operacional do dia a dia' },
  { key: 'equipe', label: 'Equipe', icon: IconTeam, title: 'Visão da equipe', subtitle: 'Acompanhe as tarefas e o progresso de todos', gestorOnly: true },
]

export default function App() {
  const [session, setSession] = useState(getAuth)
  const [view, setView] = useState('painel')
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [todos, setTodos] = useState([])
  const [media, setMedia] = useState({ image: '', video: '' })
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(true)
  const [toast, setToast] = useState('')

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
      const [t, n, q, m] = await Promise.all([
        api.getTasks(),
        api.getNotes(),
        api.getTodos(),
        api.getMedia(),
      ])
      setTasks(t)
      setNotes(n)
      setTodos(q)
      setMedia(m)
      setOnline(true)
    } catch (err) {
      setOnline(false)
      handleError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) loadAll()
  }, [session, loadAll])

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
    setTodos([])
    setMedia({ image: '', video: '' })
  }

  // ---- tarefas ----
  const addTask = (title, priority) =>
    api.addTask(title, priority).then((t) => setTasks((prev) => [...prev, t])).catch(handleError)

  const moveTask = (id, column_key) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_key } : t)))
    api.moveTask(id, column_key).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    api.deleteTask(id).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

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

  // ---- checklist ----
  const addTodo = (text) =>
    api.addTodo(text).then((item) => setTodos((prev) => [...prev, item])).catch(handleError)

  const toggleTodo = (id, done) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)))
    api.toggleTodo(id, done).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  const deleteTodo = (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    api.deleteTodo(id).catch((err) => {
      handleError(err)
      loadAll()
    })
  }

  // ---- mídia ----
  const mediaUploaded = async (kind, url) => {
    await api.saveMedia(kind, url)
    setMedia((prev) => ({ ...prev, [kind]: url }))
    showToast('Mídia salva.')
  }

  const clearMedia = () => {
    const paths = [media.image, media.video]
      .map((url) => (url ? storagePathFromUrl(url) : null))
      .filter(Boolean)
    setMedia({ image: '', video: '' })
    api.clearMedia().catch(handleError)
    if (paths.length) {
      supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => {})
    }
  }

  if (!session) return <Login onLogin={login} />

  const user = session.user
  const isGestor = user.role === 'gestor'
  const visibleViews = VIEWS.filter((v) => !v.gestorOnly || isGestor)
  const current = VIEWS.find((v) => v.key === view) || VIEWS[0]

  const renderView = () => {
    switch (view) {
      case 'kanban':
        return <Kanban tasks={tasks} onAdd={addTask} onMove={moveTask} onDelete={deleteTask} />
      case 'notas':
        return (
          <NotesView notes={notes} onCreate={createNote} onSave={saveNote} onDelete={deleteNote} />
        )
      case 'midia':
        return (
          <MediaPanel
            media={media}
            onUploaded={mediaUploaded}
            onError={handleError}
            onClear={clearMedia}
          />
        )
      case 'checklist':
        return (
          <Checklist todos={todos} onAdd={addTodo} onToggle={toggleTodo} onDelete={deleteTodo} />
        )
      case 'equipe':
        return isGestor ? <TeamView onError={handleError} /> : null
      default:
        return (
          <Dashboard tasks={tasks} todos={todos} notes={notes} media={media} onNavigate={setView} />
        )
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">4B</div>
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
                onClick={() => setView(v.key)}
              >
                <Ico />
                <span>{v.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="user-box">
          <div className="member-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="user-box-id">
            <strong>{user.name}</strong>
            <span className={`role-badge ${user.role}`}>
              {isGestor ? 'Gestor' : 'Funcionário'}
            </span>
          </div>
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
      <main className="main">
        <section className="topbar">
          <div>
            <h2>{current.title}</h2>
            <p>{current.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span className={`status-pill${online ? '' : ' offline'}`}>
              <span className="dot" />
              {online ? 'Conectado ao banco' : 'Sem conexão com a API'}
            </span>
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
    </div>
  )
}
