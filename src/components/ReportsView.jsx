import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconDownload, IconClose, IconChevronDown } from '../icons.jsx'
import { api } from '../api.js'
import { memberColor } from '../colors.js'

const STATUS_OPTIONS = ['A fazer', 'Em progresso', 'Pendente', 'Concluído']
const STATUS_CLASS = {
  'A fazer': 'report-status-todo',
  'Em progresso': 'report-status-doing',
  'Pendente': 'report-status-pending',
  'Concluído': 'report-status-done',
}

const formatDateBR = (iso) => {
  if (!iso) return ''
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Escapa um campo para CSV (aspas duplas + separador vírgula)
const csvField = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// ── Botão "Exportar" com opções CSV/PDF ─────────────────────────────────────
function ExportMenu({ onExportCsv, onExportPdf }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="reports-export" ref={ref}>
      <button type="button" className="reports-export-btn" onClick={() => setOpen((v) => !v)}>
        <IconDownload size={14} />
        Exportar
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div className="reports-export-menu">
          <button type="button" onClick={() => { setOpen(false); onExportCsv() }}>
            Exportar Excel (CSV)
          </button>
          <button type="button" onClick={() => { setOpen(false); onExportPdf() }}>
            Exportar PDF
          </button>
        </div>
      )}
    </div>
  )
}

export default function ReportsView({ members, clients, currentUser, onError }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  // ── Filtros do topo — aplicados em memória sobre os dados já carregados ──
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    api.getReportActivities()
      .then(setActivities)
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const memberName = (id) => members.find((m) => m.id === id)?.name || ''
  const clientName = (id) => clients.find((c) => c.id === id)?.name || ''

  const hasActiveFilters = assigneeFilter !== 'all' || clientFilter !== 'all' || dateFrom || dateTo

  const clearFilters = () => {
    setAssigneeFilter('all')
    setClientFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (assigneeFilter !== 'all' && a.assigned_to !== assigneeFilter) return false
      if (clientFilter !== 'all' && a.client_id !== clientFilter) return false
      if (dateFrom && (!a.date || a.date < dateFrom)) return false
      if (dateTo && (!a.date || a.date > dateTo)) return false
      return true
    })
  }, [activities, assigneeFilter, clientFilter, dateFrom, dateTo])

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const addActivity = () => {
    const draft = {
      client_id: clientFilter !== 'all' ? clientFilter : null,
      assigned_to: assigneeFilter !== 'all' ? assigneeFilter : (currentUser?.id || null),
    }
    api.createReportActivity(draft)
      .then((row) => setActivities((prev) => [...prev, row]))
      .catch(onError)
  }

  // Auto-salvamento: atualiza o estado local otimisticamente e persiste no banco
  const updateActivity = (id, updates) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
    api.updateReportActivity(id, updates).catch((err) => {
      onError(err)
      api.getReportActivities().then(setActivities).catch(() => {})
    })
  }

  const removeActivity = (id) => {
    setActivities((prev) => prev.filter((a) => a.id !== id))
    api.deleteReportActivity(id).catch((err) => {
      onError(err)
      api.getReportActivities().then(setActivities).catch(() => {})
    })
  }

  // ── Exportação ───────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ['Atividade', 'Data', 'Status', 'Responsável', 'Cliente']
    const rows = filtered.map((a) => [
      a.activity_name || '',
      formatDateBR(a.date),
      a.status,
      memberName(a.assigned_to),
      clientName(a.client_id),
    ])
    const csv = [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-fourbase-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Impressão focada na planilha (o usuário escolhe "Salvar como PDF" no diálogo do navegador)
  const exportPdf = () => window.print()

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <p>Carregando relatórios...</p>
      </div>
    )
  }

  return (
    <div className="reports-view">
      {/* ── Painel de filtros ── */}
      <div className="panel reports-filters">
        <div className="reports-filters-fields">
          <label>
            Responsável
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="all">Todos os responsáveis</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label>
            Cliente
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="all">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || 'Cliente sem nome'}</option>
              ))}
            </select>
          </label>
          <label>
            Data de início
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Data de fim
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        <div className="reports-filters-actions">
          {hasActiveFilters && (
            <button type="button" className="reports-clear-btn" onClick={clearFilters}>
              <IconClose size={12} />
              Limpar filtros
            </button>
          )}
          <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdf} />
        </div>
      </div>

      {/* ── Planilha editável ── */}
      <div className="panel reports-grid-panel">
        <div className="reports-grid-wrap">
          <table className="reports-grid">
            <thead>
              <tr>
                <th className="reports-col-activity">Atividades</th>
                <th className="reports-col-date">Data</th>
                <th className="reports-col-status">Status</th>
                <th className="reports-col-assignee">Responsável</th>
                <th aria-label="Ações" className="reports-col-actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="reports-empty-row">
                  <td colSpan={5}>
                    {activities.length === 0
                      ? 'Nenhuma atividade ainda — clique em "Nova Atividade" para começar.'
                      : 'Nenhuma atividade encontrada para os filtros selecionados.'}
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr className="reports-row" key={a.id}>
                    <td>
                      <input
                        type="text"
                        className="reports-cell-input"
                        placeholder="Nome da atividade..."
                        defaultValue={a.activity_name || ''}
                        onBlur={(e) => {
                          const v = e.target.value
                          if (v !== (a.activity_name || '')) updateActivity(a.id, { activity_name: v })
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="reports-cell-input"
                        value={a.date || ''}
                        onChange={(e) => updateActivity(a.id, { date: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <select
                        className={`reports-status-select ${STATUS_CLASS[a.status] || 'report-status-todo'}`}
                        value={a.status}
                        onChange={(e) => updateActivity(a.id, { status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="reports-assignee-cell">
                        {a.assigned_to && (
                          <span className="reports-assignee-dot" style={{ background: memberColor(a.assigned_to, members) }} />
                        )}
                        <select
                          className="reports-cell-select"
                          value={a.assigned_to || ''}
                          onChange={(e) => updateActivity(a.id, { assigned_to: e.target.value || null })}
                        >
                          <option value="">Sem responsável</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="reports-row-actions">
                      <button
                        type="button"
                        className="reports-row-delete"
                        title="Excluir atividade"
                        onClick={() => removeActivity(a.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <button type="button" className="reports-add-row-btn" onClick={addActivity}>
          <IconPlus size={15} />
          Nova Atividade
        </button>
      </div>
    </div>
  )
}
