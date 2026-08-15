import { useState } from 'react'
import { api } from '../api.js'

// Não há cadastro público: quem entra no weFlow foi convidado pelo gestor do
// seu workspace e ativa a conta em /activate/:token.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      onLogin(await api.login(email, password))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/fourbase-logo.png" alt="fourbase" className="brand-logo" />
          <div>
            <h1>fourbase</h1>
            <p>Gestão visual de tarefas</p>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            E-mail
            <input
              type="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Aguarde...' : 'Entrar na plataforma'}
          </button>
        </form>

        <div className="login-demo">
          <strong>Primeiro acesso?</strong>
          <span>Ative sua conta pelo convite recebido do gestor.</span>
          <small>Não há cadastro público: o acesso ao weFlow é sempre por convite.</small>
        </div>
      </div>
    </div>
  )
}
