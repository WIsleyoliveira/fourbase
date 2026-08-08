import { useState, useRef, useEffect } from 'react'
import {
  IconPlus,
  IconArrowLeft,
  IconArrowRight,
  IconCheckPlain,
  IconClose,
  IconCalendar,
} from '../icons.jsx'
import TaskDetailModal from './TaskDetailModal.jsx'
import TagPicker from './TagPicker.jsx'
import { memberColor, tagColor } from '../colors.js'

const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const PRIORITY_RANK  = { Urgente: 0, Alta: 1, Média: 2, Baixa: 3 }

const formatDate = (iso) => {
  if (!iso) return ''
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const dueState = (due_date) => {
  if (!due_date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

const sortTasks = (list) =>
  list.slice().sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
    if (rankDiff !== 0) return rankDiff
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

// ─── Botão "+ Adicionar grupo" ─────────────────────────────────────────────────
function AddGroupButton({ onAdd }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const formRef = useRef(null)

  // Foca o input quando entra no modo de edição
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Cancela ao clicar fora do formulário
  useEffect(() => {
    if (!editing) return
    const handler = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) cancel()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editing])

  const cancel = () => {
    setEditing(false)
    setValue('')
  }

  const confirm = async () => {
    const trimmed = value.trim()
    if (!trimmed) { cancel(); return }
    setLoading(true)
    try {
      await onAdd(trimmed)
    } finally {
      setLoading(false)
      cancel()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') confirm()
    if (e.key === 'Escape') cancel()
  }

  if (!editing) {
    return (
      <button className="add-group-btn" onClick={() => setEditing(true)}>
        <IconPlus size={14} />
        Adicionar grupo
      </button>
    )
  }

  return (
    <div className="add-group-form" ref={formRef}>
      <input
        ref={inputRef}
        className="add-group-input"
        value={value}
        placeholder="Nome do status..."
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      <div className="add-group-actions">
        <button
          className="add-group-confirm"
          onClick={confirm}
          disabled={loading || !value.trim()}
        >
          {loading ? 'Criando…' : 'Criar'}
        </button>
        <button className="add-group-cancel" onClick={cancel} disabled={loading} title="Cancelar (Esc)">
          <IconClose size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function Kanban({ tasks, members, currentUser, columns, tags = [], onAdd, onMove, onUpdate, onDelete, onAddColumn, onCreateTag }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Média')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id || '')
  const [newTaskTags, setNewTaskTags] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // Armazena apenas o ID para que o modal sempre leia os dados mais recentes de `tasks`
  const [detailTaskId, setDetailTaskId] = useState(null)

  // Ordem dos keys para as setas de navegação dos cards
  const ORDER = columns.map((c) => c.key)

  const isGestor = currentUser?.role === 'gestor'
  const memberName = (id) => members.find((m) => m.id === id)?.name || 'Sem responsável'

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), priority, dueDate || null, isGestor ? assignedTo : undefined, description.trim(), undefined, newTaskTags)
    setTitle('')
    setDueDate('')
    setDescription('')
    setNewTaskTags([])
  }

  const step = (task, direction) => {
    const next = ORDER[ORDER.indexOf(task.column_key) + direction]
    if (next) onMove(task.id, next)
  }

  const drop = (columnKey) => {
    setOverColumn(null)
    if (dragId) onMove(dragId, columnKey)
    setDragId(null)
  }

  return (
    <div className="panel">
      {/* ── Formulário de criação de tarefa ── */}
      <form className="task-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="O que precisa ser feito?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="Baixa">Prioridade: Baixa</option>
          <option value="Média">Prioridade: Média</option>
          <option value="Alta">Prioridade: Alta</option>
          <option value="Urgente">Prioridade: Urgente</option>
        </select>
        <input
          type="date"
          title="Prazo de entrega"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {isGestor && (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <textarea
          className="task-form-description"
          placeholder="Descrição (opcional)"
          rows={1}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="task-form-tags">
          <TagPicker
            value={newTaskTags}
            availableTags={tags}
            onCreateTag={onCreateTag}
            onChange={setNewTaskTags}
            placeholder="Etiquetas (opcional)..."
          />
        </div>
        <button type="submit">
          <IconPlus size={16} />
          <span>Adicionar</span>
        </button>
      </form>

      {/* ── Board de colunas dinâmicas ── */}
      <div className="kanban">
        {columns.map((col) => {
          const colTasks = sortTasks(tasks.filter((t) => t.column_key === col.key))
          return (
            <div className={`column column-${col.key}`} key={col.key}>
              <h4>
                <span className="column-title">
                  {/* Dot colorido dinamicamente — compatível com colunas padrão e customizadas */}
                  <span className="column-dot" style={{ background: col.color }} />
                  {col.label}
                </span>
                <span className="count">{colTasks.length}</span>
              </h4>
              <div
                className={`dropzone${overColumn === col.key ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key) }}
                onDragLeave={() => setOverColumn(null)}
                onDrop={() => drop(col.key)}
              >
                {colTasks.length === 0 && <div className="empty-hint">Solte cartões aqui</div>}
                {colTasks.map((task) => {
                  const due = dueState(task.due_date)
                  const isDone = task.column_key === 'done'
                  const initials = memberName(task.assigned_to).charAt(0).toUpperCase()
                  // Código de cores único por responsável — identifica a tarefa por pessoa
                  const ownerColor = memberColor(task.assigned_to, members)
                  return (
                    <div
                      className={`card ${PRIORITY_CLASS[task.priority] || 'p-media'}${dragId === task.id ? ' dragging' : ''}`}
                      style={{ borderLeft: `3px solid ${ownerColor}` }}
                      key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setDetailTaskId(task.id)}
                    >
                      {/* ── Badge de prioridade ── */}
                      <div className="card-top">
                        <small className={`priority-tag ${PRIORITY_CLASS[task.priority] || 'p-media'}`}>
                          {task.priority}
                        </small>
                      </div>

                      {/* ── Círculo de conclusão + título ── */}
                      <div className="card-title-row">
                        <button
                          className={`card-complete-btn${isDone ? ' is-done' : ''}`}
                          title={isDone ? 'Tarefa concluída' : 'Marcar como concluída'}
                          disabled={isDone}
                          onClick={(e) => { e.stopPropagation(); onMove(task.id, 'done') }}
                        >
                          {isDone && <IconCheckPlain size={9} />}
                        </button>
                        <h5>{task.title}</h5>
                      </div>

                      {/* ── Descrição (max 2 linhas) ── */}
                      {task.description && (
                        <p className="card-description">{task.description}</p>
                      )}

                      {/* ── Etiquetas ── */}
                      {task.tags?.length > 0 && (
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
                      )}

                      {/* ── Rodapé: prazo | setas (hover) + avatar ── */}
                      <div className="card-footer">
                        {task.due_date ? (
                          <span className={`due-tag due-${due}`}>
                            <IconCalendar size={10} />
                            {formatDate(task.due_date)}
                          </span>
                        ) : <span />}

                        <div className="card-footer-end">
                          <div className="card-nav-arrows">
                            <button
                              className="icon-btn"
                              title="Voltar coluna"
                              disabled={task.column_key === ORDER[0]}
                              onClick={(e) => { e.stopPropagation(); step(task, -1) }}
                            >
                              <IconArrowLeft size={13} />
                            </button>
                            <button
                              className="icon-btn"
                              title="Avançar coluna"
                              disabled={task.column_key === ORDER[ORDER.length - 1]}
                              onClick={(e) => { e.stopPropagation(); step(task, 1) }}
                            >
                              <IconArrowRight size={13} />
                            </button>
                          </div>

                          {task.assigned_to && (
                            <div
                              className="assignee-avatar"
                              style={{ background: ownerColor }}
                              title={memberName(task.assigned_to)}
                            >
                              {initials}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* ── Botão "+ Adicionar grupo" ── */}
        <AddGroupButton onAdd={onAddColumn} />
      </div>

      {/* ── Modal de detalhes da tarefa ── */}
      {detailTaskId && (() => {
        const detailTask = tasks.find((t) => t.id === detailTaskId)
        if (!detailTask) return null
        return (
          <TaskDetailModal
            task={detailTask}
            members={members}
            currentUser={currentUser}
            columns={columns}
            tags={tags}
            onCreateTag={onCreateTag}
            onClose={() => setDetailTaskId(null)}
            onUpdate={onUpdate}
            onMove={onMove}
            onDelete={onDelete}
          />
        )
      })()}
    </div>
  )
}
