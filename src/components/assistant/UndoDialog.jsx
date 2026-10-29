import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../api.js'
import { useAssistantActions } from '../../hooks/useAssistant.js'

const REASON = {
  edited: 'alguém editou',
  moved: 'mudou de coluna',
  done: 'foi concluída',
  reassigned: 'passou para outra pessoa',
}
const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '')

// Desfazer um pedido do ChatGPT: mostra antes o que será removido e o que fica (porque alguém mexeu).
// Só remove a lista que a pessoa viu (only_ids). Foco preso no diálogo, Esc cancela.
export default function UndoDialog({ batch, onClose, onDone, onOpenKanban }) {
  const { undo } = useAssistantActions()
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const opener = useRef(document.activeElement)

  useEffect(() => {
    let alive = true
    api.getAssistantUndoPlan(batch.batch_id)
      .then((p) => { if (alive) setPlan(p) })
      .catch((err) => { if (alive) setError(/48 horas/.test(err.message) ? 'Não dá mais para desfazer por aqui. Para remover, apague as tarefas no Kanban.' : 'Não conseguimos carregar agora. Tente de novo.') })
    return () => { alive = false }
  }, [batch.batch_id])

  useEffect(() => {
    cancelRef.current?.focus()
    const back = opener.current
    // o botão que abriu some depois de desfazer: o foco vai para o título do histórico
    return () => (back && document.contains(back) ? back.focus() : document.getElementById('asst-history-title')?.focus())
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    if (e.key !== 'Tab') return
    const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href]')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const confirm = async () => {
    setError('')
    try {
      const r = await undo.mutateAsync({ batchId: batch.batch_id, onlyIds: plan.remove.map((t) => t.id) })
      const kept = r.kept?.length || 0
      onDone(`${r.undone} ${r.undone === 1 ? 'tarefa removida' : 'tarefas removidas'}.${kept ? ` ${kept} ${kept === 1 ? 'foi mantida' : 'foram mantidas'}.` : ''}`)
    } catch {
      setError('Não conseguimos desfazer agora. Nada foi removido. Tente de novo.')
    }
  }

  const nothing = plan && !plan.already_undone && plan.remove.length === 0
  return createPortal(
    <div className="asst-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} className="asst-dialog" role="dialog" aria-modal="true" aria-labelledby="asst-undo-title" onKeyDown={onKeyDown}>
        <h3 id="asst-undo-title">{nothing ? 'Nada para desfazer' : 'Desfazer este pedido?'}</h3>
        {!plan && !error && <p className="asst-muted">Conferindo as tarefas…</p>}
        {plan?.already_undone && <p>Este pedido já foi desfeito.</p>}
        {plan && !plan.already_undone && (
          <>
            {plan.remove.length > 0 && (
              <>
                <h4>Serão removidas ({plan.remove.length})</h4>
                <ul className="asst-undo-list">
                  {plan.remove.map((t) => <li key={t.id}>{t.title}{t.due_date ? ` — ${fmtDate(t.due_date)}` : ''}</li>)}
                </ul>
              </>
            )}
            {plan.keep.length > 0 && (
              <>
                <h4>Serão mantidas, porque alguém mexeu depois ({plan.keep.length})</h4>
                <ul className="asst-undo-list kept">
                  {plan.keep.map((t) => <li key={t.id}>{t.title} — {REASON[t.reason] || 'foi alterada'}</li>)}
                </ul>
              </>
            )}
            {nothing
              ? <p>Todas as tarefas deste pedido já foram alteradas por alguém. Se quiser, apague manualmente no Kanban.</p>
              : <p className="asst-muted">As outras tarefas do seu fourbase não são afetadas.</p>}
          </>
        )}
        {error && <p className="asst-error" role="alert">{error}</p>}
        <div className="asst-actions end">
          {nothing && <button type="button" className="asst-btn ghost" onClick={onOpenKanban}>Ver no Kanban</button>}
          <button ref={cancelRef} type="button" className="asst-btn ghost" onClick={onClose}>{nothing || plan?.already_undone ? 'Fechar' : 'Cancelar'}</button>
          {plan && !plan.already_undone && plan.remove.length > 0 && (
            <button type="button" className="asst-btn danger" disabled={undo.isPending} onClick={confirm}>
              {undo.isPending ? 'Removendo…' : `Remover ${plan.remove.length} ${plan.remove.length === 1 ? 'tarefa' : 'tarefas'}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
