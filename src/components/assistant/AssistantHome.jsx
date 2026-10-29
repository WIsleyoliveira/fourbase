import { useState } from 'react'
import { IconCheckPlain, IconClock, IconExternal, IconTrash } from '../../icons.jsx'
import { EXAMPLE_PHRASES } from '../../assistant/gptInstructions.js'
import { activityText, whenText } from '../../assistantStatus.js'
import { useAssistantActions, useAssistantBatches } from '../../hooks/useAssistant.js'
import CopyButton from './CopyButton.jsx'
import NoticeBox from './NoticeBox.jsx'
import UndoDialog from './UndoDialog.jsx'

const CHATGPT_URL = 'https://chatgpt.com/'

const STATUS = {
  waiting: { icon: IconClock, label: 'Aguardando o primeiro uso', tone: 'wait' },
  active: { icon: IconCheckPlain, label: 'Conexão ativa', tone: 'ok' },
  stale: { icon: IconClock, label: 'Sem uso há 30 dias', tone: 'muted' },
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-BR')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Modo 2 da tela Assistente: status, histórico do que o ChatGPT fez, ideias, limites e conexões.
export default function AssistantHome({ data, status, onReconnect, onResume, onReplaceShared, onOpenKanban, announce }) {
  const { disconnect } = useAssistantActions()
  const batches = useAssistantBatches()
  const [confirmOff, setConfirmOff] = useState(false)
  const [confirmShared, setConfirmShared] = useState(false)
  const [undoing, setUndoing] = useState(null)
  const [showNotice, setShowNotice] = useState(false)
  const s = STATUS[status.state]
  const key = status.key

  const support = {
    waiting: 'No seu assistente fourbase, escreva: o que tenho amanhã?',
    active: `Última atividade: ${whenText(key.last_used_at)}${activityText(key.last_activity) ? ` — ${activityText(key.last_activity)}` : ''}.`,
    stale: 'Se não usa mais, desconecte para mais segurança.',
  }[status.state]

  const tokens = data.tokens || []
  return (
    <div className="asst-home">
      <section className={`panel asst-status ${s.tone}`} aria-labelledby="asst-status-title">
        <div className="asst-status-main">
          <span className="asst-status-badge" role="status">
            <s.icon size={16} /> <strong id="asst-status-title">{s.label}</strong>
          </span>
          <p>{support}</p>
          <button type="button" className="asst-link" aria-expanded={showNotice} onClick={() => setShowNotice((v) => !v)}>O que o ChatGPT vê</button>
        </div>
        <div className="asst-actions">
          {status.state === 'waiting' ? (
            <>
              <button type="button" className="asst-btn" onClick={() => onResume(5)}>Ver o teste</button>
              <button type="button" className="asst-btn ghost" onClick={() => onResume(2)}>Continuar a configuração</button>
            </>
          ) : (
            <a className="asst-btn" href={CHATGPT_URL} target="_blank" rel="noopener noreferrer">Abrir o ChatGPT <IconExternal size={15} /></a>
          )}
          <button type="button" className="asst-btn ghost" onClick={() => setConfirmOff(true)}>Desconectar</button>
        </div>
        {showNotice && <NoticeBox />}
        {confirmOff && (
          <div className="asst-confirm" role="alertdialog" aria-labelledby="asst-off-title">
            <strong id="asst-off-title">Desconectar o ChatGPT?</strong>
            <p>O acesso para agora. O que ele já viu continua no histórico do seu ChatGPT; para apagar, use o próprio ChatGPT.</p>
            <div className="asst-actions">
              <button type="button" className="asst-btn ghost" onClick={() => setConfirmOff(false)}>Cancelar</button>
              <button type="button" className="asst-btn danger" disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(key.id, { onSuccess: () => setConfirmOff(false) })}>Desconectar</button>
            </div>
          </div>
        )}
        <button type="button" className="asst-link small" onClick={() => setConfirmShared(true)}>Compartilhei meu assistente por engano</button>
        {confirmShared && (
          <div className="asst-confirm" role="alertdialog" aria-labelledby="asst-shared-title">
            <strong id="asst-shared-title">Trocar a chave</strong>
            <p>Vamos desligar a chave atual e criar uma nova. Depois, no ChatGPT, mude o compartilhamento para <strong>Somente eu</strong>.</p>
            <div className="asst-actions">
              <button type="button" className="asst-btn ghost" onClick={() => setConfirmShared(false)}>Cancelar</button>
              <button type="button" className="asst-btn" onClick={() => { setConfirmShared(false); onReplaceShared() }}>Desligar e criar nova chave</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="asst-history-title">
        <div className="panel-header"><h3 id="asst-history-title" tabIndex={-1}>O que o ChatGPT fez</h3><span>Desfazer em até 2 dias</span></div>
        {batches.isPending ? (
          <ul className="asst-history" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="asst-skeleton" />)}</ul>
        ) : batches.isError ? (
          <p className="asst-callout">Não conseguimos carregar o histórico agora. <button type="button" className="asst-link" onClick={() => batches.refetch()}>Tentar de novo</button></p>
        ) : !batches.data.batches.length ? (
          <p className="asst-empty"><strong>Nada por aqui ainda.</strong> Quando o ChatGPT criar tarefas, elas aparecem aqui e você pode desfazer em até 2 dias.</p>
        ) : (
          <ul className="asst-history">
            {batches.data.batches.map((b) => {
              const more = b.count - b.titles.length
              return (
                <li key={b.batch_id} className={b.undone_at ? 'undone' : ''}>
                  <div>
                    <strong>{whenText(b.created_at).replace(/^./, (c) => c.toUpperCase())} — criou {plural(b.count, 'tarefa', 'tarefas')}</strong>
                    {b.undone_at ? (
                      <p className="asst-muted">
                        Desfeito {whenText(b.undone_at)}
                        {b.undo_result && ` · ${plural(b.undo_result.removed, 'removida', 'removidas')}${b.undo_result.kept ? `, ${plural(b.undo_result.kept, 'mantida', 'mantidas')}` : ''}`}
                      </p>
                    ) : (
                      <p>{b.titles.join(', ')}{more > 0 ? ` e mais ${more}` : ''}</p>
                    )}
                    {!b.undone_at && !b.undo_until && <p className="asst-muted">Não dá mais para desfazer por aqui. Para remover, apague as tarefas no Kanban.</p>}
                  </div>
                  <div className="asst-actions">
                    <button type="button" className="asst-btn ghost" onClick={onOpenKanban}>Ver no Kanban</button>
                    {b.undo_until && <button type="button" className="asst-btn ghost" onClick={() => setUndoing(b)}>Desfazer</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="asst-grid">
        <section className="panel" aria-labelledby="asst-ideas-title">
          <div className="panel-header"><h3 id="asst-ideas-title">Ideias para pedir</h3></div>
          {EXAMPLE_PHRASES.map((g) => (
            <div key={g.group} className="asst-ideas">
              <h4>{g.group}</h4>
              <ul className="asst-chips">
                {g.items.map((p) => <li key={p}><span>"{p}"</span><CopyButton text={p} label="Copiar" onCopied={announce} /></li>)}
              </ul>
            </div>
          ))}
          <p className="asst-muted">Você pode falar por voz no app do ChatGPT. Ele sempre mostra a lista e espera você confirmar antes de criar.</p>
        </section>

        <section className="panel" aria-labelledby="asst-can-title">
          <div className="panel-header"><h3 id="asst-can-title">O que ele pode e não pode fazer</h3></div>
          <div className="asst-can">
            <div>
              <h4>Pode</h4>
              <ul>
                <li>Ver as <strong>suas</strong> tarefas e prazos (até 2 meses por vez)</li>
                <li>Ver os nomes dos clientes da empresa para usar o nome certo</li>
                <li>Avisar quando um horário bate com outra tarefa ou quando a tarefa já existe</li>
                <li>Criar até 30 tarefas de uma vez, <strong>para você</strong>, na primeira coluna do Kanban, com a etiqueta ChatGPT</li>
                <li>Desfazer o que criou em até 2 dias (sem mexer no que alguém já alterou)</li>
              </ul>
            </div>
            <div>
              <h4>Não pode</h4>
              <ul>
                <li>Editar, mover ou apagar tarefas que já existem</li>
                <li>Ver ou criar tarefas para outras pessoas da equipe</li>
                <li>Cadastrar clientes novos</li>
                <li>Mandar avisos ou e-mails para ninguém</li>
              </ul>
            </div>
          </div>
          <p className="asst-muted">O ChatGPT foi instruído a sempre mostrar a lista e pedir sua confirmação antes de criar.</p>
        </section>
      </div>

      <details className="panel asst-connections">
        <summary><h3>Conexões</h3><span className="asst-muted">Avançado</span></summary>
        <p className="asst-muted">Desligar corta o acesso do ChatGPT na hora. Você pode conectar de novo quando quiser.</p>
        <ul className="asst-conn-list">
          {tokens.map((t) => {
            const off = t.revoked_at || Date.parse(t.expires_at) <= Date.now()
            return (
              <li key={t.id} className={off ? 'off' : ''}>
                <div>
                  <strong>{t.name}</strong> <code>{t.prefix}…</code>
                  <small>
                    {t.revoked_at ? `Desligada em ${fmtDay(t.revoked_at)}` : `Criada em ${fmtDay(t.created_at)} · Válida até ${fmtDay(t.expires_at)} · Último uso: ${t.last_used_at ? whenText(t.last_used_at) : 'nunca'}`}
                  </small>
                </div>
                {!off && (
                  <button type="button" className="asst-btn ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate(t.id)} aria-label={`Desligar ${t.name}`}>
                    <IconTrash size={14} /> Desligar
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <button type="button" className="asst-btn ghost" onClick={onReconnect}>Criar nova chave</button>
      </details>

      {undoing && (
        <UndoDialog
          batch={undoing}
          onClose={() => setUndoing(null)}
          onOpenKanban={() => { setUndoing(null); onOpenKanban() }}
          onDone={(msg) => { setUndoing(null); announce(msg, { toast: true }) }}
        />
      )}
    </div>
  )
}
