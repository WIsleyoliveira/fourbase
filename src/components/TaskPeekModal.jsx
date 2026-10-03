import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTask } from '../hooks/useTasks.js'
import { useClients, useColumns, useMembers, useTags } from '../hooks/useWorkspaceData.js'
import { tagColor } from '../colors.js'
import { clientPath, viewPath } from '../routes.js'
import Avatar from './Avatar.jsx'
import LoadingBlock from './LoadingBlock.jsx'
import { IconClose, IconPaperclip } from '../icons.jsx'

const EMPTY = []

// Painel somente leitura aberto por link (?tarefa=ID) — destino dos avisos do
// sino. Quem foi só mencionado numa tarefa fora do seu Kanban também a enxerga
// aqui (GET /api/tasks/:id). Título e descrição entram sempre como TEXTO.

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(\?.*)?$/i

// "YYYY-MM-DD" -> "dd/mm/aaaa" (sem passar por Date: evita deslocar o dia por fuso)
const formatDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// due_time vem do Postgres como "HH:MM:SS" — só interessa "HH:MM".
const formatTime = (time) => (time ? String(time).slice(0, 5) : '')

function dueText(task) {
  if (!task.due_date) return 'Sem prazo'
  const start = formatDay(task.due_date)
  const end = task.due_date_end ? formatDay(task.due_date_end) : ''
  const t1 = formatTime(task.due_time)
  const t2 = t1 ? formatTime(task.due_time_end) : ''
  const left = t1 ? `${start} ${t1}` : start
  if (end) return `${left} – ${t2 ? `${end} ${t2}` : end}`
  return t2 ? `${left} – ${t2}` : left
}

const fileNameFromUrl = (url) => {
  const last = url.split('?')[0].split('/').pop() || ''
  try { return decodeURIComponent(last) } catch { return last }
}

// Anexo de tarefa: normalmente a URL pura; aceita também {name|file_name, url|file_url}.
const normalizeAttachment = (att, index) => {
  const url = typeof att === 'string' ? att : (att?.url || att?.file_url || '')
  if (!/^https?:\/\//i.test(url)) return null
  const name = (typeof att === 'object' && (att.name || att.file_name))
    || fileNameFromUrl(url) || `Anexo ${index + 1}`
  const type = typeof att === 'object' ? (att.type || att.file_type || '') : ''
  const image = type.startsWith('image/') || IMAGE_EXT_RE.test(url)
  return { url, name, image }
}

const priorityClass = (priority) =>
  `p-${String(priority || 'Média').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`

export default function TaskPeekModal({ taskId, onClose }) {
  const navigate = useNavigate()
  const taskQuery = useTask(taskId)
  const members = useMembers().data ?? EMPTY
  const clients = useClients().data ?? EMPTY
  const columns = useColumns().data ?? EMPTY
  const tags = useTags().data ?? EMPTY
  const dialogRef = useRef(null)
  // onClose muda de identidade a cada navegação; a ref evita refazer o efeito
  // (e roubar o foco de novo) por isso.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Esc fecha; o foco vai para o diálogo ao abrir e volta ao elemento anterior
  // ao fechar (se ele ainda existir).
  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    const handler = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const task = taskQuery.data
  const failed = taskQuery.isError || (taskQuery.isSuccess && !task)

  const goTo = (path) => {
    onClose()
    navigate(path)
  }

  let body
  if (failed) {
    body = (
      <div className="task-peek-body task-peek-empty">
        <h3 id="task-peek-title">Tarefa não encontrada</h3>
        <p>O link pode estar desatualizado ou você não tem acesso a esta tarefa.</p>
        <button type="button" onClick={onClose}>Fechar</button>
      </div>
    )
  } else if (!task) {
    body = (
      <div className="task-peek-body">
        <h3 id="task-peek-title" className="sr-only">Carregando tarefa</h3>
        <LoadingBlock text="Carregando tarefa..." />
      </div>
    )
  } else {
    const column = columns.find((c) => c.key === task.column_key)
    const assignee = members.find((m) => m.id === task.assigned_to)
    const mentioned = (task.mentioned_users || EMPTY)
      .map((id) => members.find((m) => m.id === id))
      .filter(Boolean)
    const client = task.client_id ? clients.find((c) => c.id === task.client_id) : null
    const attachments = (task.attachments || EMPTY).map(normalizeAttachment).filter(Boolean)
    const priority = task.priority || 'Média'

    body = (
      <>
        <div className="task-peek-header">
          <h3 id="task-peek-title" className="task-peek-title">{task.title || 'Tarefa sem título'}</h3>
          <button type="button" className="icon-btn" title="Fechar" aria-label="Fechar" onClick={onClose}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="task-peek-body">
          {task.description ? (
            <p className="task-peek-description">{task.description}</p>
          ) : (
            <p className="task-peek-description task-peek-muted">Sem descrição.</p>
          )}

          <dl className="task-peek-fields">
            <div>
              <dt>Status</dt>
              <dd>{column?.label || task.column_key || '—'}</dd>
            </div>
            <div>
              <dt>Prioridade</dt>
              <dd><span className={`priority-tag ${priorityClass(priority)}`}>{priority}</span></dd>
            </div>
            <div>
              <dt>Prazo</dt>
              <dd>{dueText(task)}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{task.client_id ? (client?.name || 'Cliente') : 'Sem cliente'}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>
                {assignee ? (
                  <span className="task-peek-person">
                    <Avatar id={assignee.id} name={assignee.name} list={members} className="member-avatar sm" />
                    {assignee.name}
                  </span>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt>Menções</dt>
              <dd>
                {mentioned.length > 0 ? (
                  <span className="task-peek-people">
                    {mentioned.map((m) => (
                      <span className="task-peek-person" key={m.id}>
                        <Avatar id={m.id} name={m.name} list={members} className="member-avatar sm" />
                        {m.name}
                      </span>
                    ))}
                  </span>
                ) : '—'}
              </dd>
            </div>
          </dl>

          {task.tags?.length > 0 && (
            <div className="task-peek-section">
              <span className="task-peek-label">Etiquetas</span>
              <div className="card-tags">
                {task.tags.map((name) => {
                  const color = tagColor(name, tags)
                  return (
                    <span key={name} className="card-tag-pill" style={{ background: `${color}1f`, color }}>
                      {name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="task-peek-section">
              <span className="task-peek-label">
                <IconPaperclip size={13} /> Anexos
              </span>
              <ul className="task-peek-attachments">
                {attachments.map((att) => (
                  <li key={att.url}>
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      {att.image && <img src={att.url} alt="" loading="lazy" />}
                      <span>{att.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="task-peek-footer">
          {task.client_id ? (
            <button type="button" onClick={() => goTo(clientPath(task.client_id))}>Ver no cliente</button>
          ) : (
            <button type="button" onClick={() => goTo(viewPath('kanban'))}>Ver no Kanban</button>
          )}
          <button type="button" className="secondary" onClick={onClose}>Fechar</button>
        </div>
      </>
    )
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal task-peek"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-peek-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>,
    document.body,
  )
}
