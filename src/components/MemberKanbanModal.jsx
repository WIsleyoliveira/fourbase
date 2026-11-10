import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { IconClose } from '../icons.jsx'
import Avatar from './Avatar.jsx'
import { useColumns } from '../hooks/useWorkspaceData.js'

const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const todayKey = () => new Date().toLocaleDateString('en-CA')
const formatDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

const EMAIL_NOTE = {
  queued: 'O aviso apareceu no sino e o envio do e-mail foi solicitado.',
  recipient_opted_out: 'O aviso apareceu no sino. A pessoa desativou os e-mails, então nenhum e-mail foi enviado.',
  not_configured: 'O aviso apareceu no sino. O envio de e-mail não está configurado neste ambiente.',
  no_address: 'O aviso apareceu no sino. A pessoa não tem e-mail cadastrado.',
}

// Janela do gestor: o Kanban só de uma pessoa (leitura), com a barra de progresso dela e o sininho que
// sinaliza uma tarefa em aberto (aviso no sino + e-mail formal).
export default function MemberKanbanModal({ member, tasks, onClose, onToast }) {
  const columns = useColumns().data || []
  const [nudging, setNudging] = useState(null) // id da tarefa com o formulário aberto
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  const mine = tasks.filter((t) => t.assigned_to === member.id)
  const done = mine.filter((t) => t.column_key === 'done').length
  const progress = mine.length ? Math.round((done / mine.length) * 100) : 0
  const today = todayKey()
  // colunas do quadro + qualquer coluna que a tarefa tenha e o quadro não (nunca some tarefa)
  const known = new Set(columns.map((c) => c.key))
  const cols = [...columns, ...[...new Set(mine.map((t) => t.column_key))].filter((k) => !known.has(k)).map((k) => ({ key: k, label: k }))]

  const openNudge = (task) => { setNudging(task.id); setNote(''); setError('') }
  const send = async (task) => {
    setSending(true)
    setError('')
    try {
      const r = await api.nudgeMember(member.id, { task_id: task.id, message: note })
      onToast?.(`Sinalização enviada a ${member.name}. ${EMAIL_NOTE[r.email] || ''}`.trim())
      setNudging(null)
    } catch (err) {
      setError(err.message || 'Não foi possível enviar a sinalização.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => { if (!sending) onClose() }}>
      <div className="modal member-kanban-modal" role="dialog" aria-label={`Kanban de ${member.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="mkm-head">
          <Avatar id={member.id} name={member.name} list={[member]} className="member-avatar" />
          <div className="mkm-id">
            <strong>{member.name}</strong>
            <small>{member.email}</small>
          </div>
          <button type="button" className="icon-btn" title="Fechar" aria-label="Fechar" onClick={onClose} disabled={sending}><IconClose size={16} /></button>
        </header>

        <div className="mkm-progress">
          <div className="mkm-progress-top">
            <span>{done} de {mine.length} tarefa{mine.length === 1 ? '' : 's'} concluída{done === 1 ? '' : 's'}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>

        {mine.length === 0 && <p className="empty-hint">{member.name} não tem tarefas atribuídas.</p>}

        <div className="mkm-board">
          {cols.map((col) => {
            const list = mine.filter((t) => t.column_key === col.key)
            return (
              <section className="mkm-col" key={col.key}>
                <h4 style={{ '--col': col.color || 'var(--primary)' }}><span className="mkm-dot" />{col.label}<span className="mkm-count">{list.length}</span></h4>
                {list.length === 0 && <p className="mkm-empty">Nenhuma tarefa</p>}
                {list.map((t) => {
                  const isDone = t.column_key === 'done'
                  const late = !isDone && (t.due_date_end || t.due_date) && (t.due_date_end || t.due_date) < today
                  return (
                    <article className={`mkm-card${isDone ? ' done' : ''}`} key={t.id}>
                      <div className="mkm-card-top">
                        <strong className="mkm-title">{t.title}</strong>
                        {!isDone && (
                          <button type="button" className="mkm-bell" title={`Sinalizar esta tarefa a ${member.name}`} aria-label={`Sinalizar a tarefa ${t.title} a ${member.name}`} onClick={() => openNudge(t)} disabled={sending}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                          </button>
                        )}
                      </div>
                      <div className="mkm-meta">
                        <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>{t.priority}</span>
                        {t.due_date && <span className={`mkm-due${late ? ' late' : ''}`}>{late ? 'Atrasada · ' : 'Prazo '}{formatDate(t.due_date_end || t.due_date)}</span>}
                      </div>
                      {nudging === t.id && (
                        <div className="mkm-nudge">
                          <label htmlFor={`nudge-${t.id}`}>Recado opcional para {member.name}</label>
                          <textarea id={`nudge-${t.id}`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Precisamos desta entrega até sexta-feira." />
                          <small>{member.name} receberá um aviso no sino e um e-mail formal sinalizando esta tarefa.</small>
                          {error && <p className="mkm-error" role="alert">{error}</p>}
                          <div className="mkm-nudge-actions">
                            <button type="button" className="secondary" onClick={() => setNudging(null)} disabled={sending}>Cancelar</button>
                            <button type="button" className="primary" onClick={() => send(t)} disabled={sending}>{sending ? 'Enviando…' : 'Enviar sinalização'}</button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
