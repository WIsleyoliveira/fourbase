import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconDownload, IconChevronDown } from '../icons.jsx'
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

const introTemplate = (clientName, dateFromBR, dateToBR) =>
  `Prezado(a) ${clientName || '[Nome do Cliente]'}, apresentamos a seguir o relatório consolidado das atividades executadas pela equipe Fourbase durante o período de ${dateFromBR || '[Data Início]'} a ${dateToBR || '[Data Fim]'}. Abaixo estão discriminadas as tarefas entregues, status de andamento e respectivos responsáveis.`

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

  // ── Metadados do relatório — definem para quem, quando e por quem o relatório é gerado ──
  const [clientId, setClientId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // ── Texto de apresentação — editável, com sugestão automática baseada nos metadados acima ──
  const [introText, setIntroText] = useState('')
  const [introEdited, setIntroEdited] = useState(false)

  // ── Aviso discreto quando atividades sem cliente são vinculadas automaticamente ──
  const [reassignNotice, setReassignNotice] = useState('')
  useEffect(() => {
    if (!reassignNotice) return
    const t = setTimeout(() => setReassignNotice(''), 4000)
    return () => clearTimeout(t)
  }, [reassignNotice])

  useEffect(() => {
    api.getReportActivities()
      .then(setActivities)
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUser?.id) setManagerId((prev) => prev || currentUser.id)
  }, [currentUser])

  const memberName = (id) => members.find((m) => m.id === id)?.name || ''
  const clientName = (id) => clients.find((c) => c.id === id)?.name || ''

  useEffect(() => {
    if (introEdited) return
    setIntroText(introTemplate(clientName(clientId), formatDateBR(dateFrom), formatDateBR(dateTo)))
  }, [clientId, dateFrom, dateTo, introEdited]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetIntroText = () => {
    setIntroEdited(false)
    setIntroText(introTemplate(clientName(clientId), formatDateBR(dateFrom), formatDateBR(dateTo)))
  }

  // Atividades dentro do escopo do relatório: cliente atendido + período de execução
  const scoped = useMemo(() => {
    return activities.filter((a) => {
      if (clientId && a.client_id !== clientId) return false
      if (dateFrom && a.date && a.date < dateFrom) return false
      if (dateTo && a.date && a.date > dateTo) return false
      return true
    })
  }, [activities, clientId, dateFrom, dateTo])

  // Ao trocar o cliente atendido, preserva a planilha e vincula ao novo cliente
  // apenas as linhas ainda sem cliente (rascunhos digitados antes da seleção) —
  // atividades já gravadas para outro cliente permanecem intactas.
  const handleClientChange = (newClientId) => {
    setClientId(newClientId)
    if (!newClientId) return

    const orphans = activities.filter((a) => !a.client_id)
    if (orphans.length === 0) return

    setActivities((prev) => prev.map((a) => (!a.client_id ? { ...a, client_id: newClientId } : a)))
    orphans.forEach((a) => {
      api.updateReportActivity(a.id, { client_id: newClientId }).catch(onError)
    })
    setReassignNotice(
      `${orphans.length} atividade${orphans.length > 1 ? 's' : ''} sem cliente vinculada${orphans.length > 1 ? 's' : ''} a ${clientName(newClientId)}.`
    )
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const addActivity = () => {
    const draft = {
      client_id: clientId || null,
      assigned_to: currentUser?.id || null,
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
    const rows = scoped.map((a) => [
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

  // Impressão focada no documento do relatório (o usuário escolhe "Salvar como PDF" no diálogo do navegador)
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
      {/* ── Metadados do relatório ── */}
      <div className="panel reports-meta no-print">
        <div className="panel-header">
          <h3>Dados do Relatório</h3>
        </div>
        <div className="reports-meta-fields">
          <label>
            Cliente Atendido
            <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
              <option value="">Selecione o cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || 'Cliente sem nome'}</option>
              ))}
            </select>
          </label>
          <label>
            Período de Execução — Início
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Período de Execução — Fim
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            Responsável pelo Relatório
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
        {reassignNotice && <div className="reports-reassign-notice">{reassignNotice}</div>}
      </div>

      {/* ── Texto de apresentação ── */}
      <div className="panel reports-intro no-print">
        <div className="panel-header">
          <h3>Texto de Apresentação / Introdução ao Cliente</h3>
          {introEdited && (
            <button type="button" className="reports-intro-reset" onClick={resetIntroText}>
              Restaurar texto padrão
            </button>
          )}
        </div>
        <textarea
          className="reports-intro-textarea"
          value={introText}
          onChange={(e) => { setIntroText(e.target.value); setIntroEdited(true) }}
          rows={4}
        />
      </div>

      {/* ── Planilha editável ── */}
      <div className="panel reports-grid-panel">
        <div className="panel-header no-print reports-grid-header">
          <h3>Atividades do Período</h3>
          <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdf} />
        </div>
        <div className="reports-grid-wrap">
          <table className="reports-grid">
            <thead>
              <tr>
                <th className="reports-col-activity">Atividades</th>
                <th className="reports-col-date">Data</th>
                <th className="reports-col-status">Status</th>
                <th className="reports-col-assignee">Responsável</th>
                <th aria-label="Ações" className="reports-col-actions no-print" />
              </tr>
            </thead>
            <tbody>
              {scoped.length === 0 ? (
                <tr className="reports-empty-row">
                  <td colSpan={5}>
                    {activities.length === 0
                      ? 'Nenhuma atividade ainda — clique em "Nova Atividade" para começar.'
                      : 'Nenhuma atividade encontrada para o cliente/período selecionados.'}
                  </td>
                </tr>
              ) : (
                scoped.map((a) => (
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
                    <td className="reports-row-actions no-print">
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

        <button type="button" className="reports-add-row-btn no-print" onClick={addActivity}>
          <IconPlus size={15} />
          Nova Atividade
        </button>
      </div>

      {/* ── Documento — visível apenas na impressão / exportação em PDF ── */}
      <div className="reports-print-doc print-only">
        <div className="reports-print-header">
          <div className="brand-logo">4B</div>
          <h1>Relatório de Atividades</h1>
        </div>
        <div className="reports-print-infobox">
          <div>
            <span>Cliente</span>
            <strong>{clientName(clientId) || '—'}</strong>
          </div>
          <div>
            <span>Período do Relatório</span>
            <strong>
              {dateFrom || dateTo
                ? `${formatDateBR(dateFrom) || '—'} até ${formatDateBR(dateTo) || '—'}`
                : '—'}
            </strong>
          </div>
          <div>
            <span>Emitido por</span>
            <strong>{memberName(managerId) || '—'}</strong>
          </div>
        </div>
        <p className="reports-print-intro">{introText}</p>
        <table className="reports-print-table">
          <thead>
            <tr>
              <th>Atividades</th>
              <th>Data</th>
              <th>Status</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {scoped.map((a) => (
              <tr key={a.id}>
                <td>{a.activity_name || ''}</td>
                <td>{formatDateBR(a.date)}</td>
                <td>{a.status}</td>
                <td>{memberName(a.assigned_to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
