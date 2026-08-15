import { useEffect, useState } from 'react'
import { api } from '../api.js'

// Tela de ativação de convite (/activate/:token). Reaproveita o visual do
// Login. O token vem só da URL: workspace e cargo saem do convite guardado no
// servidor, nunca de nada que esta tela possa enviar.
export default function Activate({ token, onActivated }) {
  const [invitation, setInvitation] = useState(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api
      .getInvitation(token)
      .then(setInvitation)
      .catch((err) => setError(err.message))
      .finally(() => setChecking(false))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setSaving(true)
    try {
      await api.acceptInvitation(token, password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/fourbase-logo.png" alt="weFlow" className="brand-logo" />
          <div>
            <h1>weFlow</h1>
            <p>Gestão visual de tarefas</p>
          </div>
        </div>

        {checking && <p className="login-hint-text">Validando convite…</p>}

        {!checking && !invitation && (
          <>
            <div className="login-error">{error || 'Convite inválido, expirado ou já utilizado.'}</div>
            <button className="login-submit" onClick={onActivated}>
              Ir para o login
            </button>
          </>
        )}

        {!checking && invitation && done && (
          <>
            <div className="login-demo">
              <strong>Conta ativada!</strong>
              <span>Você já pode entrar no weFlow com o seu e-mail e a senha que acabou de criar.</span>
            </div>
            <button className="login-submit" onClick={onActivated}>
              Entrar no weFlow
            </button>
          </>
        )}

        {!checking && invitation && !done && (
          <>
            <div className="login-demo">
              <strong>Você foi convidado para o weFlow</strong>
              <span>
                Workspace: <code>{invitation.workspace_name || '—'}</code>
              </span>
              <small>
                {invitation.name} · {invitation.email}
              </small>
            </div>

            <form className="login-form" onSubmit={submit}>
              <label>
                Crie sua senha
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </label>
              <label>
                Confirme a senha
                <input
                  type="password"
                  placeholder="Repita a senha"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </label>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-submit" disabled={saving}>
                {saving ? 'Ativando…' : 'Ativar minha conta'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
