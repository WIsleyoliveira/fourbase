import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTimeTracker } from '../hooks/useTimeTracker.js'
import {
  IconClose,
  IconTrash,
  IconCheckPlain,
  IconPlay,
  IconPause,
  IconFlag,
  IconExpand,
  IconShrink,
  IconTag,
  IconKanban,
  IconUser,
  IconClock,
  IconArrowRight,
  IconBuilding,
} from '../icons.jsx'
import TagPicker from './TagPicker.jsx'
import MemberPicker from './MemberPicker.jsx'
import TaskAttachments from './TaskAttachments.jsx'
import Avatar from './Avatar.jsx'


// ─── Colunas padrão — usadas como fallback se a prop `columns` não for fornecida ─
const DEFAULT_COLUMNS = [
  { key: 'todo', label: 'A Fazer' },
  { key: 'doing', label: 'Em Progresso' },
  { key: 'done', label: 'Concluído' },
]

const PRIORITIES = [
  { value: 'Urgente', color: '#e85d75' },
  { value: 'Alta', color: '#f2a93b' },
  { value: 'Média', color: '#4f8ff7' },
  { value: 'Baixa', color: '#2ec27e' },
]

// ─── Utilitários ──────────────────────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return '—'
  const val = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Sub-componente: campo de estimativa de tempo ────────────────────────────
// Aceita formatos amigáveis: "2h", "30m", "1d 4h". Persiste em localStorage.
function TimeEstimateField({ taskId }) {
  const key = `fb_estimate_${taskId}`
  const [value, setValue] = useState(() => localStorage.getItem(key) || '')
  const [editing, setEditing] = useState(false)

  const save = (v) => {
    setEditing(false)
    setValue(v)
    localStorage.setItem(key, v)
  }

  if (editing) {
    return (
      <input
        className="tdv2-estimate-input"
        value={value}
        placeholder="ex: 2h, 30m, 1d 4h"
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(e.target.value) }}
        autoFocus
      />
    )
  }

  return (
    <span
      className={value ? 'tdv2-estimate-value' : 'tdv2-estimate-empty'}
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      {value || 'Vazio'}
    </span>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function TaskDetailModal({
  task, members, clients = [], currentUser, columns: colsProp, tags = [], onCreateTag,
  onClose, onUpdate, onMove, onDelete, onCreate, embedded = false,
}) {
  // Usa as colunas recebidas do Kanban (inclui customizadas) com fallback para o padrão
  const COLUMNS = colsProp || DEFAULT_COLUMNS
  const isGestor = currentUser?.role === 'gestor'

  // Sem `id` = tarefa em rascunho: o modal vira formulário de criação e só
  // persiste ao clicar em "Criar tarefa" (nada de PATCH campo a campo).
  const creating = !task?.id

  // Id efêmero só para os caminhos que precisam de uma chave estável antes de a
  // tarefa existir (pasta dos anexos no storage e estimativa em localStorage).
  const draftIdRef = useRef(null)
  if (creating && !draftIdRef.current) {
    draftIdRef.current = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  }
  const entityId = task?.id || draftIdRef.current

  // Estado local espelhando a tarefa para reflexo imediato das edições no UI
  const [local, setLocal] = useState({ ...task })

  const [editingTitle, setEditingTitle] = useState(creating)
  const [titleDraft, setTitleDraft] = useState(task.title || '')
  const [descDraft, setDescDraft] = useState(task.description || '')
  const [fullscreen, setFullscreen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Hook de cronômetro — soma ao tempo já persistido na tarefa (logged_time_seconds)
  const { isTracking, toggle, display } = useTimeTracker(
    entityId,
    local.logged_time_seconds || 0,
    (total) => updateField('logged_time_seconds', total),
  )

  // Fecha modal com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Helpers para atualizar campo localmente e chamar onUpdate.
  // No modo criação as mudanças ficam só no rascunho local.
  const updateField = (field, value) => {
    setLocal((prev) => ({ ...prev, [field]: value }))
    if (!creating) onUpdate(task.id, { [field]: value })
  }

  const moveColumn = (columnKey) => {
    setLocal((prev) => ({ ...prev, column_key: columnKey }))
    if (!creating) onMove(task.id, columnKey)
  }

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    if (creating) {
      setLocal((prev) => ({ ...prev, title: trimmed }))
      return
    }
    setEditingTitle(false)
    if (trimmed && trimmed !== local.title) {
      updateField('title', trimmed)
    }
  }

  const saveDescription = () => {
    if (creating) {
      setLocal((prev) => ({ ...prev, description: descDraft }))
      return
    }
    if (descDraft !== (local.description || '')) {
      updateField('description', descDraft)
    }
  }

  // Confirmação via modal próprio em vez de window.confirm(): o navegador
  // suprime/auto-rejeita diálogos nativos repetidos (ex.: após "Impedir que
  // esta página crie caixas de diálogo adicionais"), fazendo a exclusão
  // parecer que "não faz nada" ao clicar — mesmo problema já corrigido em
  // DocumentsView.
  const handleDelete = () => setConfirmingDelete(true)

  const confirmDelete = () => {
    setConfirmingDelete(false)
    onDelete(task.id)
    onClose()
  }

  // Cria a tarefa com tudo que foi preenchido no rascunho
  const handleCreate = async () => {
    const title = titleDraft.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      await onCreate({
        title,
        description: descDraft.trim(),
        priority: local.priority || 'Média',
        due_date: local.due_date || null,
        due_date_end: local.due_date ? (local.due_date_end || null) : null,
        due_time: local.due_date ? (local.due_time || null) : null,
        due_time_end: local.due_date && local.due_time ? (local.due_time_end || null) : null,
        column_key: local.column_key || COLUMNS[0]?.key || 'todo',
        assigned_to: local.assigned_to || null,
        client_id: local.client_id || null,
        tags: local.tags || [],
        attachments: local.attachments || [],
        mentioned_users: local.mentioned_users || [],
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const currentPriority = PRIORITIES.find((p) => p.value === local.priority) || PRIORITIES[2]
  const assigneeMember = members.find((m) => m.id === local.assigned_to)

  const panel = (
    <>
        {/* ══ Header ══════════════════════════════════════════════════════════ */}
        <div className="tdv2-header">
          <div className="tdv2-header-left">
            <span className="tdv2-type-tag">
              <IconKanban size={11} />
              {creating ? 'Nova tarefa' : 'Tarefa'}
            </span>

            {editingTitle ? (
              <input
                className="tdv2-title-input"
                value={titleDraft}
                placeholder={creating ? 'Título da tarefa…' : undefined}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') { saveTitle(); if (creating) handleCreate() } }}
                autoFocus
              />
            ) : (
              <h2 className="tdv2-title" onClick={() => setEditingTitle(true)} title="Clique para editar">
                {titleDraft}
              </h2>
            )}
          </div>

          <div className="tdv2-header-actions">
            {!embedded && (
              <button
                className="icon-btn"
                title={fullscreen ? 'Sair da tela cheia' : 'Expandir tela cheia'}
                onClick={() => setFullscreen(!fullscreen)}
              >
                {fullscreen ? <IconShrink size={16} /> : <IconExpand size={16} />}
              </button>
            )}
            <button className="icon-btn" title={embedded ? 'Recolher' : 'Fechar'} onClick={onClose}>
              {embedded ? <IconArrowRight size={16} /> : <IconClose size={16} />}
            </button>
          </div>
        </div>

        {/* ══ Body (rolável) ════════════════════════════════════════════════ */}
        <div className="tdv2-body">

          {/* ── Grid de atributos 2 colunas ─────────────────────────────── */}
          <div className="tdv2-grid">

            {/* Coluna esquerda */}
            <div className="tdv2-col">

              {/* Status */}
              <div className="tdv2-attr">
                <span className="tdv2-label">Status</span>
                <div className="tdv2-status-row">
                  <select
                    className={`tdv2-status-badge tdv2-status-${local.column_key}`}
                    value={local.column_key}
                    onChange={(e) => moveColumn(e.target.value)}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    className="icon-btn success"
                    title="Concluir tarefa"
                    disabled={local.column_key === 'done'}
                    onClick={() => moveColumn('done')}
                  >
                    <IconCheckPlain size={14} />
                  </button>
                </div>
              </div>

              {/* Datas */}
              <div className="tdv2-attr tdv2-attr-wrap tdv2-attr-dates">
                <span className="tdv2-label">
                  {local.due_date_end ? 'Início' : 'Vencimento'}
                </span>
                <input
                  type="date"
                  className="tdv2-date-input"
                  value={local.due_date || ''}
                  onChange={(e) => {
                    const next = e.target.value || null
                    updateField('due_date', next)
                    // Reflete localmente — o backend também limpa due_date_end
                    // do lado dele quando due_date vira null.
                    if (!next && local.due_date_end) setLocal((prev) => ({ ...prev, due_date_end: null }))
                  }}
                />
                <label className="tdv2-multiday-toggle">
                  <input
                    type="checkbox"
                    checked={!!local.due_date_end}
                    disabled={!local.due_date}
                    onChange={(e) => updateField('due_date_end', e.target.checked ? local.due_date : null)}
                  />
                  Vários dias
                </label>
                {local.due_date_end !== null && local.due_date_end !== undefined && (
                  <>
                    <span className="tdv2-label">Até</span>
                    <input
                      type="date"
                      className="tdv2-date-input"
                      min={local.due_date || undefined}
                      value={local.due_date_end || ''}
                      onChange={(e) => updateField('due_date_end', e.target.value || local.due_date)}
                    />
                  </>
                )}
                <label className="tdv2-multiday-toggle">
                  <input
                    type="checkbox"
                    checked={!!local.due_time}
                    disabled={!local.due_date}
                    onChange={(e) => {
                      updateField('due_time', e.target.checked ? '09:00' : null)
                      // Sem horário de início, o horário final fica órfão — some junto.
                      if (!e.target.checked && local.due_time_end) {
                        setLocal((prev) => ({ ...prev, due_time_end: null }))
                      }
                    }}
                  />
                  Definir horário
                </label>
                {local.due_time && (
                  <>
                    <span className="tdv2-label">Início</span>
                    <input
                      type="time"
                      className="tdv2-date-input"
                      value={local.due_time || ''}
                      onChange={(e) => updateField('due_time', e.target.value || null)}
                    />
                    <span className="tdv2-label">Fim</span>
                    <input
                      type="time"
                      className="tdv2-date-input"
                      value={local.due_time_end || ''}
                      onChange={(e) => updateField('due_time_end', e.target.value || null)}
                    />
                  </>
                )}
              </div>

              {/* Cliente */}
              <div className="tdv2-attr">
                <span className="tdv2-label">
                  <IconBuilding size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Cliente
                </span>
                <select
                  className="tdv2-select"
                  value={local.client_id || ''}
                  onChange={(e) => updateField('client_id', e.target.value || null)}
                >
                  <option value="">Sem cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || 'Cliente sem nome'}</option>
                  ))}
                </select>
              </div>

              {/* Estimativa de tempo */}
              <div className="tdv2-attr">
                <span className="tdv2-label">Estimativa</span>
                <TimeEstimateField taskId={entityId} />
              </div>

              {/* Etiquetas */}
              <div className="tdv2-attr tdv2-attr-wrap">
                <span className="tdv2-label">
                  <IconTag size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Etiquetas
                </span>
                <TagPicker
                  value={local.tags || []}
                  availableTags={tags}
                  onCreateTag={onCreateTag}
                  onChange={(next) => updateField('tags', next)}
                />
              </div>
            </div>

            {/* Coluna direita */}
            <div className="tdv2-col">

              {/* Responsável */}
              <div className="tdv2-attr">
                <span className="tdv2-label">
                  <IconUser size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Responsável
                </span>
                {isGestor ? (
                  <select
                    className="tdv2-select"
                    value={local.assigned_to || ''}
                    onChange={(e) => updateField('assigned_to', e.target.value || null)}
                  >
                    <option value="">Sem responsável</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="tdv2-assignee">
                    {assigneeMember ? (
                      <>
                        <Avatar id={assigneeMember.id} name={assigneeMember.name} list={members} className="tdv2-avatar" />
                        <span className="tdv2-assignee-name">{assigneeMember.name}</span>
                      </>
                    ) : (
                      <span className="tdv2-muted-text">Sem responsável</span>
                    )}
                  </div>
                )}
              </div>

              {/* Mencionados — opcional, além do responsável */}
              <div className="tdv2-attr tdv2-attr-wrap">
                <span className="tdv2-label">
                  <IconUser size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Mencionados
                </span>
                <MemberPicker
                  value={local.mentioned_users || []}
                  members={members}
                  excludeId={local.assigned_to}
                  onChange={(next) => updateField('mentioned_users', next)}
                />
              </div>

              {/* Prioridade */}
              <div className="tdv2-attr">
                <span className="tdv2-label">
                  <IconFlag size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Prioridade
                </span>
                <div className="tdv2-priority-row">
                  <span className="tdv2-priority-dot" style={{ background: currentPriority.color }} />
                  <select
                    className="tdv2-select"
                    value={local.priority || 'Média'}
                    onChange={(e) => updateField('priority', e.target.value)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.value}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rastrear Tempo — só faz sentido depois que a tarefa existe */}
              {!creating && (
                <div className="tdv2-attr">
                  <span className="tdv2-label">
                    <IconClock size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Tempo
                  </span>
                  <div className="tdv2-tracker">
                    <button
                      className={`tdv2-tracker-btn${isTracking ? ' tracking' : ''}`}
                      onClick={toggle}
                      title={isTracking ? 'Pausar cronômetro' : 'Iniciar cronômetro'}
                    >
                      {isTracking ? <IconPause size={12} /> : <IconPlay size={12} />}
                    </button>
                    <span className={`tdv2-tracker-time${isTracking ? ' tracking' : ' paused'}`}>
                      {display}
                    </span>
                    {isTracking && <span className="tdv2-tracker-live-dot" />}
                  </div>
                </div>
              )}

              {/* Criado em */}
              {!creating && (
                <div className="tdv2-attr">
                  <span className="tdv2-label">Criado em</span>
                  <span className="tdv2-muted-text">{formatDate(local.created_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Descrição ──────────────────────────────────────────────────── */}
          <div className="tdv2-description">
            <textarea
              rows={5}
              placeholder="Adicione uma descrição ou escreva com IA..."
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={saveDescription}
            />
          </div>

          {/* ── Anexos e Imagens ───────────────────────────────────────────── */}
          <TaskAttachments
            taskId={entityId}
            attachments={local.attachments || []}
            onChange={(next) => updateField('attachments', next)}
          />
        </div>

        {/* ══ Footer ══════════════════════════════════════════════════════════ */}
        <div className="tdv2-footer">
          {creating ? (
            <div className="tdv2-footer-create">
              <button className="secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button
                className="tdv2-create-btn"
                onClick={handleCreate}
                disabled={saving || !titleDraft.trim()}
              >
                <IconCheckPlain size={14} />
                {saving ? 'Criando…' : 'Criar tarefa'}
              </button>
            </div>
          ) : (
            <button className="secondary danger-text" onClick={handleDelete}>
              <IconTrash size={14} />
              Excluir tarefa
            </button>
          )}
        </div>
    </>
  )

  const deleteConfirmModal = confirmingDelete && createPortal(
    <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
      <div className="modal remove-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="remove-confirm-header">
          <div className="remove-confirm-icon">
            <IconTrash size={20} />
          </div>
          <button className="icon-btn" title="Fechar" onClick={() => setConfirmingDelete(false)}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="remove-confirm-body">
          <h3>Excluir tarefa</h3>
          <p>
            Tem certeza que deseja excluir <strong>{local.title || 'esta tarefa'}</strong> permanentemente?{' '}
            Esta ação não poderá ser desfeita.
          </p>
        </div>
        <div className="remove-confirm-actions">
          <button className="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancelar
          </button>
          <button className="remove-confirm-btn" onClick={confirmDelete}>
            <IconTrash size={14} />
            Sim, excluir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )

  if (embedded) {
    return (
      <div className="tdv2-embedded-panel">
        {panel}
        {deleteConfirmModal}
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal task-detail-v2${fullscreen ? ' task-detail-fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
      {deleteConfirmModal}
    </div>
  )
}
