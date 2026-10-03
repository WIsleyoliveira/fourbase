import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNotificationActions, useNotifications } from '../hooks/useNotifications.js'
import { useMembers } from '../hooks/useWorkspaceData.js'
import { localToday, notificationText, relativeTime } from '../notificationText.js'
import { withTaskParam } from '../routes.js'
import { IconBell } from '../icons.jsx'

// Sino de avisos (menções, atribuições, prazos). Dados e ações vêm dos hooks;
// clicar num aviso o marca como lido e abre a tarefa na própria tela (?tarefa=).
export default function NotificationBell({ className = '' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { data } = useNotifications()
  const { data: members } = useMembers()
  const { markRead, markAllRead } = useNotificationActions()

  const items = data?.items ?? []
  const unread = data?.unread ?? 0

  // Fecha ao clicar fora ou pressionar ESC (devolve o foco ao sino)
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const openNotification = (n) => {
    if (!n.read_at) markRead(n.id)
    setOpen(false)
    navigate({ pathname: location.pathname, search: withTaskParam(location.search, n.task_id) })
  }

  const today = localToday()

  return (
    <div className={`notif-wrap ${className}`.trim()} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="notif-bell"
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : 'Notificações'}
        aria-expanded={open}
        title="Notificações"
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-popover" role="region" aria-label="Notificações">
          <div className="notif-head">
            <strong>Notificações</strong>
            {unread > 0 && (
              <button type="button" className="notif-readall" onClick={() => markAllRead()}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="notif-empty">Nenhuma notificação</p>
          ) : (
            <ul className="notif-list" role="list">
              {items.map((n) => (
                <li key={n.id} role="listitem">
                  <button
                    type="button"
                    className={`notif-item${n.read_at ? '' : ' unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <span className="notif-item-dot" aria-hidden="true" />
                    <span className="notif-item-body">
                      <span className="notif-item-text">{notificationText(n, members, today)}</span>
                      <small className="notif-item-time">{relativeTime(n.created_at)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
