import { useCallback, useEffect, useState } from 'react'
import { IconLink, IconTrash } from '../icons.jsx'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca')

// Meu Perfil → "Assistente (ChatGPT)": o gestor gera um token pessoal para o ChatGPT ver a agenda
// e criar tarefas. O token completo aparece uma única vez, logo após gerar.
export default function AssistantTokensPanel() {
  const { handleError, showToast } = useToast()
  const [tokens, setTokens] = useState(null)
  const [name, setName] = useState('ChatGPT')
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState(null)

  const load = useCallback(() => api.listAssistantTokens().then(setTokens).catch(handleError), [handleError])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true)
    try {
      setFresh(await api.createAssistantToken(name.trim() || 'ChatGPT'))
      await load()
    } catch (err) { handleError(err) } finally { setBusy(false) }
  }
  const revoke = async (t) => {
    if (!window.confirm(`Revogar "${t.name}"? O ChatGPT perde o acesso na hora.`)) return
    try {
      await api.revokeAssistantToken(t.id)
      if (fresh?.id === t.id) setFresh(null)
      await load()
    } catch (err) { handleError(err) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh.token); showToast('Token copiado') } catch { showToast('Não consegui copiar — selecione e copie manualmente') }
  }
  const active = (tokens || []).filter((t) => !t.revoked_at && !(t.expires_at && Date.parse(t.expires_at) <= Date.now()))

  return (
    <div className="panel profile-card">
      <div className="panel-header">
        <h3><IconLink size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Assistente (ChatGPT)</h3>
        <span>{active.length} ativo{active.length === 1 ? '' : 's'}</span>
      </div>
      <p className="profile-readonly-note">
        O token deixa o seu ChatGPT consultar a sua agenda e criar tarefas para você. Ele não edita nem apaga tarefas existentes.
        Trate-o como uma senha: quem tiver o token acessa a sua agenda.
      </p>

      {fresh && (
        <div className="assistant-token-fresh" role="status">
          <strong>Copie agora — este token não será mostrado de novo.</strong>
          <input readOnly value={fresh.token} onFocus={(e) => e.target.select()} aria-label="Token gerado" />
          <div className="assistant-token-actions">
            <button type="button" className="btn btn-primary" onClick={copy}>Copiar token</button>
            <button type="button" className="btn btn-ghost" onClick={() => setFresh(null)}>Já guardei</button>
          </div>
        </div>
      )}

      <div className="assistant-token-form">
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Nome do token" placeholder="Nome (ex.: ChatGPT do Evandro)" />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Gerando…' : 'Gerar token'}</button>
      </div>

      {tokens && tokens.length > 0 && (
        <ul className="assistant-token-list">
          {tokens.map((t) => (
            <li key={t.id} className={t.revoked_at ? 'is-revoked' : ''}>
              <div>
                <strong>{t.name}</strong> <code>{t.prefix}…</code>
                <small>
                  {t.revoked_at ? `Revogado em ${fmt(t.revoked_at)}` : `Criado em ${fmt(t.created_at)} · último uso: ${fmt(t.last_used_at)}`}
                </small>
              </div>
              {!t.revoked_at && (
                <button type="button" className="btn btn-ghost" onClick={() => revoke(t)} aria-label={`Revogar ${t.name}`}>
                  <IconTrash size={14} /> Revogar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
