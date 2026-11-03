import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api.js'
import { NOTICE, NOTICE_VERSION } from '../assistant/notice.js'
import { isSafeRedirect, readOAuthRequest } from '../assistant/oauthRedirect.js'
import NoticeBox from './assistant/NoticeBox.jsx'

// /conectar — o ChatGPT abre esta página para o gestor autorizar a conexão (login OAuth do fourbase).
// Pedido inválido nunca redireciona: mostra o erro aqui. Só depois do clique em "Autorizo e conectar" o
// servidor gera o código e o navegador volta para o ChatGPT.
export default function ConnectView() {
  const { search } = useLocation()
  const request = useMemo(() => readOAuthRequest(search), [search])
  const [state, setState] = useState({ phase: 'checking' }) // checking | ready | invalid | blocked | sending
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (!request.client_id || !request.redirect_uri) {
      setState({ phase: 'invalid' })
      return undefined
    }
    api.oauthCheck({ client_id: request.client_id, redirect_uri: request.redirect_uri })
      .then((r) => { if (alive) setState({ phase: 'ready', clientName: r.client_name }) })
      .catch((err) => {
        if (!alive) return
        setState({ phase: /disponível/i.test(err.message) ? 'blocked' : 'invalid' })
      })
    return () => { alive = false }
  }, [request.client_id, request.redirect_uri])

  const decide = async (decision) => {
    setError('')
    setState((s) => ({ ...s, phase: 'sending' }))
    try {
      const r = await api.oauthAuthorize({ ...request, decision, notice_version: NOTICE_VERSION })
      if (!isSafeRedirect(r.redirect_to, { allowLocal: import.meta.env.DEV })) throw new Error('Endereço de retorno não permitido')
      window.location.assign(r.redirect_to)
    } catch (err) {
      setError(err.message || 'Não conseguimos concluir agora. Tente de novo.')
      setState((s) => ({ ...s, phase: 'ready' }))
    }
  }

  if (state.phase === 'checking') return <div className="panel"><p className="asst-muted" role="status">Conferindo o pedido…</p></div>
  if (state.phase === 'blocked') {
    return (
      <div className="panel asst-connect">
        <h2>O Assistente não está disponível</h2>
        <p>Esta conta não tem o Assistente liberado. Fale com quem administra o fourbase da sua empresa.</p>
      </div>
    )
  }
  if (state.phase === 'invalid') {
    return (
      <div className="panel asst-connect">
        <h2>Este pedido de conexão não vale</h2>
        <p>O link está incompleto ou venceu. Volte ao ChatGPT e clique em conectar de novo.</p>
      </div>
    )
  }

  const sending = state.phase === 'sending'
  return (
    <div className="asst-connect">
      <section className="panel">
        <h2>Conectar o {state.clientName || 'ChatGPT'} ao seu fourbase</h2>
        <p>Você está dando ao ChatGPT acesso à sua agenda no fourbase. Leia o aviso e decida.</p>
        <NoticeBox />
        <p className="asst-consent">{NOTICE.consent}</p>
        <div className="asst-actions">
          <button type="button" className="asst-btn" disabled={sending} onClick={() => decide('allow')}>
            {sending ? 'Conectando…' : 'Autorizo e conectar'}
          </button>
          <button type="button" className="asst-btn ghost" disabled={sending} onClick={() => decide('deny')}>Cancelar</button>
        </div>
        {error && <p className="asst-error" role="alert">{error}</p>}
        <p className="asst-muted">Você pode desconectar quando quiser em Assistente → Desconectar. O acesso para na hora.</p>
      </section>
    </div>
  )
}
