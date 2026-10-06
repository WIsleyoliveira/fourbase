import { useState, useRef, useEffect, useMemo } from 'react'
import {
  IconPlus,
  IconArrowLeft,
  IconArrowRight,
  IconCheckPlain,
  IconClose,
  IconCalendar,
  IconChevronDown,
} from '../icons.jsx'
import TaskDetailModal from './TaskDetailModal.jsx'
import TagPicker from './TagPicker.jsx'
import MemberPicker from './MemberPicker.jsx'
import TaskAttachments from './TaskAttachments.jsx'
import Avatar from './Avatar.jsx'
import LoadingBlock, { anyLoading } from './LoadingBlock.jsx'
import KanbanFilterBar from './KanbanFilterBar.jsx'
import { EMPTY_FILTERS, filterTasks, hasActiveFilters, sortTasks } from '../kanbanFilters.js'
import { localToday } from '../notificationText.js'
import {
  buildTaskFields, countAdvanced, emptyDraft, setDraftField, validateDraft,
} from '../newTaskForm.js'
import { useToast } from '../toast.jsx'
import { useMyTasks, useTaskActions } from '../hooks/useTasks.js'
import {
  useClients, useColumnActions, useColumns, useMembers, useTagActions, useTags,
} from '../hooks/useWorkspaceData.js'

const EMPTY = []
import { memberColor, tagColor } from '../colors.js'

const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }

const formatDate = (iso) => {
  if (!iso) return ''
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// due_time vem do Postgres como "HH:MM:SS" — só interessa "HH:MM" na UI.
const formatTime = (time) => (time ? time.slice(0, 5) : '')

// Compara contra due_date_end quando a tarefa dura vários dias — só está
// atrasada depois do último dia, não do primeiro.
const dueState = (due_date, due_date_end) => {
  if (!due_date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date_end || due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

// Ordem dos cartões escolhida pela pessoa — lembrada entre visitas (só a ordem; os
// filtros recomeçam limpos para ninguém achar que "sumiram" tarefas).
const SORT_KEY = 'fb_kanban_sort'
const loadSort = () => {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return ['priority', 'due', 'recent', 'title'].includes(saved) ? saved : 'priority'
  } catch { return 'priority' }
}

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
// Quadro de tarefas. Recebe só o que muda de um uso para outro — a lista de
// tarefas, os clientes disponíveis e como criar (`onAdd`) — porque é usado no
// Kanban pessoal (MyKanban, abaixo) e no quadro de um cliente (ClientWorkspace,
// que passa `clients={[client]}` e vincula as novas tarefas a ele). Membros,
// colunas, etiquetas e as ações de mover/editar/excluir vêm direto do cache.
export default function Kanban({ tasks, clients = [], currentUser, onAdd }) {
  const members = useMembers().data ?? EMPTY
  const columns = useColumns().data
  const tags = useTags().data ?? EMPTY
  const { createTag: onCreateTag } = useTagActions()
  const { addColumn: onAddColumn } = useColumnActions()
  const { moveTask: onMove, updateTask: onUpdate, deleteTask: onDelete } =
    useTaskActions({ userId: currentUser?.id })
  const { showToast } = useToast()
  // Rascunho da nova tarefa: todos os campos que uma tarefa aceita. "Opções avançadas"
  // só mostra/esconde os campos além do título.
  const formDefaults = { assignedTo: currentUser?.id || '', columnKey: columns[0]?.key || 'todo' }
  const [draft, setDraft] = useState(() => emptyDraft(formDefaults))
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  // Id provisório: as imagens anexadas antes de a tarefa existir vão para tasks/<id>
  const newId = () => (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [draftId, setDraftId] = useState(newId)
  const setField = (field, value) => setDraft((d) => setDraftField(d, field, value))
  const advancedCount = countAdvanced(draft, formDefaults)
  // Busca, filtros e ordem: tudo no navegador, sobre as tarefas já carregadas
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState(loadSort)
  const changeSort = (next) => {
    setSort(next)
    try { localStorage.setItem(SORT_KEY, next) } catch { /* armazenamento indisponível */ }
  }
  const today = localToday()
  const shownTasks = useMemo(() => filterTasks(tasks, filters, today), [tasks, filters, today])
  const filtering = hasActiveFilters(filters)
  const [dragId, setDragId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // Armazena apenas o ID para que o modal sempre leia os dados mais recentes de `tasks`
  const [detailTaskId, setDetailTaskId] = useState(null)

  // Ordem dos keys para as setas de navegação dos cards
  const ORDER = columns.map((c) => c.key)

  const isGestor = currentUser?.role === 'gestor'
  const memberName = (id) => members.find((m) => m.id === id)?.name || 'Sem responsável'

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    const problem = validateDraft(draft)
    if (problem) { showToast(problem); return }
    setSaving(true)
    try {
      const task = await onAdd(buildTaskFields(draft, { isGestor }))
      // Só limpa quando a tarefa foi criada; se falhou, o rascunho fica para tentar de novo
      if (task) {
        setDraft(emptyDraft(formDefaults))
        setDraftId(newId())
      }
    } finally {
      setSaving(false)
    }
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
      {/* Barra de criação rápida: só o título à vista; o resto abre em "Opções avançadas" */}
      <form className="task-form" onSubmit={submit}>
        <div className="task-form-main">
          <input
            type="text"
            className="task-form-title"
            placeholder="O que precisa ser feito?"
            aria-label="Título da nova tarefa"
            value={draft.title}
            onChange={(e) => setField('title', e.target.value)}
          />
          <button
            type="button"
            className={`task-form-more${showMore ? ' open' : ''}`}
            aria-expanded={showMore}
            aria-controls="task-form-extra"
            onClick={() => setShowMore((v) => !v)}
          >
            <span>Opções avançadas</span>
            {advancedCount > 0 && <span className="task-form-badge">{advancedCount}</span>}
            <IconChevronDown size={14} />
          </button>
          <button type="submit" className="task-form-submit" disabled={saving}>
            <IconPlus size={16} />
            <span>{saving ? 'Adicionando…' : 'Adicionar'}</span>
          </button>
        </div>

        {showMore && (
          <div className="task-form-extra" id="task-form-extra">
            <label className="task-form-field">
              <span>Prioridade</span>
              <select value={draft.priority} onChange={(e) => setField('priority', e.target.value)}>
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </label>
            <label className="task-form-field">
              <span>Status</span>
              <select value={draft.columnKey} onChange={(e) => setField('columnKey', e.target.value)}>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            {isGestor && (
              <label className="task-form-field">
                <span>Responsável</span>
                <select
                  value={draft.assignedTo}
                  onChange={(e) => {
                    setField('assignedTo', e.target.value)
                    // quem é o responsável não precisa ser "mencionado"
                    setDraft((d) => ({ ...d, mentioned: d.mentioned.filter((id) => id !== e.target.value) }))
                  }}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="task-form-field">
              <span>Cliente</span>
              <select
                value={draft.clientId}
                title="Vincular a um cliente (opcional)"
                onChange={(e) => setField('clientId', e.target.value)}
              >
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || 'Cliente sem nome'}</option>
                ))}
              </select>
            </label>
            <label className="task-form-field">
              <span>Prazo (início)</span>
              <input
                type="date"
                title="Prazo de entrega"
                value={draft.dueDate}
                onChange={(e) => setField('dueDate', e.target.value)}
              />
            </label>
            <label className="task-form-field">
              <span>Data final</span>
              <input
                type="date"
                title="Data final (para tarefas de vários dias)"
                value={draft.dueDateEnd}
                min={draft.dueDate || undefined}
                disabled={!draft.dueDate}
                onChange={(e) => setField('dueDateEnd', e.target.value)}
              />
            </label>
            <label className="task-form-field">
              <span>Horário de início</span>
              <input
                type="time"
                value={draft.dueTime}
                disabled={!draft.dueDate}
                onChange={(e) => setField('dueTime', e.target.value)}
              />
            </label>
            <label className="task-form-field">
              <span>Horário final</span>
              <input
                type="time"
                value={draft.dueTimeEnd}
                disabled={!draft.dueTime}
                onChange={(e) => setField('dueTimeEnd', e.target.value)}
              />
            </label>
            <div className="task-form-field task-form-field-wide">
              <span>Pessoas mencionadas</span>
              <MemberPicker
                value={draft.mentioned}
                members={members}
                excludeId={draft.assignedTo}
                onChange={(next) => setField('mentioned', next)}
              />
            </div>
            <label className="task-form-field task-form-field-wide">
              <span>Descrição</span>
              <textarea
                className="task-form-description"
                placeholder="Descrição (opcional)"
                rows={2}
                value={draft.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </label>
            <div className="task-form-field task-form-field-wide task-form-tags">
              <span>Etiquetas</span>
              <TagPicker
                value={draft.tags}
                availableTags={tags}
                onCreateTag={onCreateTag}
                onChange={(next) => setField('tags', next)}
                placeholder="Etiquetas (opcional)..."
              />
            </div>
            <div className="task-form-field task-form-field-wide task-form-attachments">
              <span>Anexos e imagens</span>
              <TaskAttachments
                taskId={draftId}
                attachments={draft.attachments}
                onChange={(next) => setField('attachments', next)}
              />
            </div>
          </div>
        )}
      </form>

      {/* ── Busca, filtros, ordenação e resumo ── */}
      <KanbanFilterBar
        tasks={tasks}
        shownTasks={shownTasks}
        members={members}
        clients={clients}
        tags={tags}
        currentUser={currentUser}
        today={today}
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={changeSort}
      />

      {/* ── Board de colunas dinâmicas ── */}
      <div className="kanban">
        {columns.map((col) => {
          const colTasks = sortTasks(shownTasks.filter((t) => t.column_key === col.key), sort)
          const colTotal = tasks.filter((t) => t.column_key === col.key).length
          return (
            <div className={`column column-${col.key}`} key={col.key}>
              <h4>
                <span className="column-title">
                  {/* Dot colorido dinamicamente — compatível com colunas padrão e customizadas */}
                  <span className="column-dot" style={{ background: col.color }} />
                  {col.label}
                </span>
                <span className="count" title={filtering ? `${colTasks.length} de ${colTotal} nesta coluna` : undefined}>
                  {filtering ? `${colTasks.length}/${colTotal}` : colTasks.length}
                </span>
              </h4>
              <div
                className={`dropzone${overColumn === col.key ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key) }}
                onDragLeave={() => setOverColumn(null)}
                onDrop={() => drop(col.key)}
              >
                {colTasks.length === 0 && (
                  <div className="empty-hint">
                    {filtering && colTotal > 0 ? 'Nenhuma tarefa com esses filtros' : 'Solte cartões aqui'}
                  </div>
                )}
                {colTasks.map((task) => {
                  const due = dueState(task.due_date, task.due_date_end)
                  const isDone = task.column_key === 'done'
                  // Código de cores único por responsável — identifica a tarefa por pessoa
                  const ownerColor = memberColor(task.assigned_to, members)
                  return (
                    <div
                      className={`card ${PRIORITY_CLASS[task.priority] || 'p-media'}${dragId === task.id ? ' dragging' : ''}`}
                      style={{ '--owner': ownerColor }}
                      key={task.id}
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={`${task.title}. Prioridade ${task.priority || 'Média'}. Abrir detalhes`}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setDetailTaskId(task.id)}
                      onKeyDown={(e) => {
                        // Só quando o foco está no próprio cartão (não nos botões internos)
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetailTaskId(task.id)
                        }
                      }}
                    >
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

                      {/* ── Rodapé: prioridade + prazo | setas (hover/foco) + pessoas ── */}
                      <div className="card-footer">
                        <div className="card-footer-meta">
                          <small className={`priority-tag ${PRIORITY_CLASS[task.priority] || 'p-media'}`}>
                            {task.priority || 'Média'}
                          </small>
                          {task.due_date && (
                            <span className={`due-tag due-${due}`}>
                              <IconCalendar size={11} />
                              {task.due_date_end
                                ? `${formatDate(task.due_date)} — ${formatDate(task.due_date_end)}`
                                : formatDate(task.due_date)}
                              {task.due_time && (
                                <>
                                  {' · '}
                                  {formatTime(task.due_time)}
                                  {task.due_time_end && `–${formatTime(task.due_time_end)}`}
                                </>
                              )}
                            </span>
                          )}
                        </div>

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

                          {task.mentioned_users?.length > 0 && (
                            <div className="card-mentions" title={task.mentioned_users.map(memberName).join(', ')}>
                              {task.mentioned_users.slice(0, 3).map((id) => (
                                <Avatar key={id} id={id} name={memberName(id)} list={members} className="card-mention-avatar" />
                              ))}
                              {task.mentioned_users.length > 3 && (
                                <span className="card-mention-more">+{task.mentioned_users.length - 3}</span>
                              )}
                            </div>
                          )}

                          {task.assigned_to && (
                            <Avatar
                              id={task.assigned_to}
                              name={memberName(task.assigned_to)}
                              list={members}
                              className="assignee-avatar"
                            />
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
            clients={clients}
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

// Kanban pessoal: as tarefas atribuídas a quem está logado.
export function MyKanban({ currentUser }) {
  const tasksQuery = useMyTasks(currentUser.id)
  const clients = useClients().data ?? EMPTY
  const membersQuery = useMembers()
  const { createTask } = useTaskActions({ userId: currentUser.id })

  if (anyLoading(tasksQuery, membersQuery)) return <LoadingBlock text="Carregando tarefas..." />
  return <Kanban tasks={tasksQuery.data ?? EMPTY} clients={clients} currentUser={currentUser} onAdd={createTask} />
}
