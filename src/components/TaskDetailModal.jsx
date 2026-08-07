import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTimeTracker } from '../hooks/useTimeTracker.js'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
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
  IconPlus,
  IconKanban,
  IconUser,
  IconClock,
  IconArrowRight,
  IconPaperclip,
  IconExpandSearch,
} from '../icons.jsx'
import { assigneeColor } from '../colors.js'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

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

// Etiquetas pré-definidas — persistidas em localStorage enquanto o DB não tem a coluna
const LABEL_OPTIONS = [
  { id: 'urg', label: 'Urgente', color: '#e85d75', bg: '#fdedf0' },
  { id: 'rev', label: 'Em Revisão', color: '#f2a93b', bg: '#fdf4e3' },
  { id: 'bug', label: 'Bug', color: '#d63384', bg: '#fce7f3' },
  { id: 'feat', label: 'Feature', color: '#4f8ff7', bg: '#ecf3fe' },
  { id: 'mkt', label: 'Marketing', color: '#a855f7', bg: '#f5e8ff' },
  { id: 'vendas', label: 'Vendas', color: '#14b8c4', bg: '#e6fafb' },
]

// ─── Utilitários ──────────────────────────────────────────────────────────────

const getInitials = (name = '') =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

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

// ─── Sub-componente: widget de etiquetas ──────────────────────────────────────
function LabelPicker({ taskId }) {
  const key = `fb_labels_${taskId}`
  const [activeIds, setActiveIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
  })
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (id) => {
    const next = activeIds.includes(id) ? activeIds.filter((x) => x !== id) : [...activeIds, id]
    setActiveIds(next)
    localStorage.setItem(key, JSON.stringify(next))
  }

  const activeLabels = LABEL_OPTIONS.filter((l) => activeIds.includes(l.id))

  return (
    <div className="tdv2-labels-container" ref={containerRef}>
      {activeLabels.map((l) => (
        <button
          key={l.id}
          className="tdv2-label-pill"
          style={{ background: l.bg, color: l.color }}
          onClick={() => toggle(l.id)}
          title="Clique para remover"
        >
          {l.label}
        </button>
      ))}
      <div style={{ position: 'relative' }}>
        <button className="tdv2-label-add" onClick={() => setOpen(!open)}>
          <IconPlus size={10} />
          Adicionar
        </button>
        {open && (
          <div className="tdv2-label-dropdown">
            {LABEL_OPTIONS.map((l) => {
              const active = activeIds.includes(l.id)
              return (
                <button
                  key={l.id}
                  className={`tdv2-label-option${active ? ' active' : ''}`}
                  onClick={() => toggle(l.id)}
                >
                  <span className="tdv2-label-dot" style={{ background: l.color }} />
                  <span>{l.label}</span>
                  {active && <IconCheckPlain size={12} style={{ marginLeft: 'auto', color: l.color }} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componente: anexos e imagens ─────────────────────────────────────────
function AttachmentsSection({ taskId, attachments, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!previewImage) return
    const handler = (e) => { if (e.key === 'Escape') setPreviewImage(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewImage])

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from(CLIENT_MEDIA_BUCKET)
          .upload(path, file, { cacheControl: '3600', contentType: file.type })
        if (error) throw error
        const { data } = supabase.storage.from(CLIENT_MEDIA_BUCKET).getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
      onChange([...(attachments || []), ...uploaded])
    } catch (err) {
      alert(err.message || 'Falha ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  const handleSelect = (e) => {
    uploadFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(e.dataTransfer.files)
  }

  const removeAttachment = (url) => {
    if (!confirm('Remover esta imagem?')) return
    onChange((attachments || []).filter((a) => a !== url))
    const path = storagePathFromUrl(url, CLIENT_MEDIA_BUCKET)
    if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
  }

  return (
    <div className="tdv2-attachments">
      <span className="tdv2-label">
        <IconPaperclip size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
        Anexos e Imagens
      </span>

      <div
        className={`tdv2-dropzone${dragActive ? ' active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <IconPlus size={14} />
        <span>{uploading ? 'Enviando...' : 'Adicionar imagem'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={handleSelect}
        />
      </div>

      {attachments && attachments.length > 0 && (
        <div className="tdv2-attachments-grid">
          {attachments.map((url) => (
            <div className="tdv2-attachment-item" key={url}>
              <img src={url} alt="Anexo" />
              <div className="tdv2-attachment-overlay">
                <button
                  className="tdv2-attachment-btn"
                  title="Ver em tamanho cheio"
                  onClick={() => setPreviewImage(url)}
                >
                  <IconExpandSearch size={15} />
                </button>
                <button
                  className="tdv2-attachment-btn danger"
                  title="Excluir imagem"
                  onClick={() => removeAttachment(url)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewImage && createPortal(
        <div className="lightbox-backdrop" onClick={() => setPreviewImage(null)}>
          <button className="lightbox-close" title="Fechar (Esc)" onClick={() => setPreviewImage(null)}>
            <IconClose size={20} />
          </button>
          <img src={previewImage} alt="Anexo" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function TaskDetailModal({ task, members, currentUser, columns: colsProp, onClose, onUpdate, onMove, onDelete, embedded = false }) {
  // Usa as colunas recebidas do Kanban (inclui customizadas) com fallback para o padrão
  const COLUMNS = colsProp || DEFAULT_COLUMNS
  const isGestor = currentUser?.role === 'gestor'

  // Estado local espelhando a tarefa para reflexo imediato das edições no UI
  const [local, setLocal] = useState({ ...task })

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [descDraft, setDescDraft] = useState(task.description || '')
  const [fullscreen, setFullscreen] = useState(false)

  // Hook de cronômetro — soma ao tempo já persistido na tarefa (logged_time_seconds)
  const { isTracking, toggle, display } = useTimeTracker(
    task.id,
    local.logged_time_seconds || 0,
    (total) => updateField('logged_time_seconds', total),
  )

  // Fecha modal com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Helpers para atualizar campo localmente e chamar onUpdate
  const updateField = (field, value) => {
    setLocal((prev) => ({ ...prev, [field]: value }))
    onUpdate(task.id, { [field]: value })
  }

  const moveColumn = (columnKey) => {
    setLocal((prev) => ({ ...prev, column_key: columnKey }))
    onMove(task.id, columnKey)
  }

  const saveTitle = () => {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== local.title) {
      updateField('title', trimmed)
    }
  }

  const saveDescription = () => {
    if (descDraft !== (local.description || '')) {
      updateField('description', descDraft)
    }
  }

  const handleDelete = () => {
    if (!confirm('Excluir esta tarefa permanentemente?')) return
    onDelete(task.id)
    onClose()
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
              Tarefa
            </span>

            {editingTitle ? (
              <input
                className="tdv2-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle() }}
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
              <div className="tdv2-attr">
                <span className="tdv2-label">Vencimento</span>
                <input
                  type="date"
                  className="tdv2-date-input"
                  value={local.due_date || ''}
                  onChange={(e) => updateField('due_date', e.target.value || null)}
                />
              </div>

              {/* Estimativa de tempo */}
              <div className="tdv2-attr">
                <span className="tdv2-label">Estimativa</span>
                <TimeEstimateField taskId={task.id} />
              </div>

              {/* Etiquetas */}
              <div className="tdv2-attr tdv2-attr-wrap">
                <span className="tdv2-label">
                  <IconTag size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Etiquetas
                </span>
                <LabelPicker taskId={task.id} />
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
                        <div className="tdv2-avatar" style={{ background: assigneeColor(assigneeMember.id) }}>{getInitials(assigneeMember.name)}</div>
                        <span className="tdv2-assignee-name">{assigneeMember.name}</span>
                      </>
                    ) : (
                      <span className="tdv2-muted-text">Sem responsável</span>
                    )}
                  </div>
                )}
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

              {/* Rastrear Tempo */}
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

              {/* Criado em */}
              <div className="tdv2-attr">
                <span className="tdv2-label">Criado em</span>
                <span className="tdv2-muted-text">{formatDate(local.created_at)}</span>
              </div>
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
          <AttachmentsSection
            taskId={task.id}
            attachments={local.attachments || []}
            onChange={(next) => updateField('attachments', next)}
          />
        </div>

        {/* ══ Footer ══════════════════════════════════════════════════════════ */}
        <div className="tdv2-footer">
          <button className="secondary danger-text" onClick={handleDelete}>
            <IconTrash size={14} />
            Excluir tarefa
          </button>
        </div>
    </>
  )

  if (embedded) {
    return <div className="tdv2-embedded-panel">{panel}</div>
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal task-detail-v2${fullscreen ? ' task-detail-fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  )
}
