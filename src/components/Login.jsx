import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // login | register
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const auth =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password)
      onLogin(auth)
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
          <div className="brand-logo">4B</div>
          <div>
            <h1>fourbase</h1>
            <p>Gestão visual de tarefas</p>
          </div>
        </div>

        <div className="login-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Entrar
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            Criar conta
          </button>
        </div>

        <form className="login-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
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
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar na plataforma' : 'Criar conta de funcionário'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="login-hint-text">
            Contas criadas aqui são de <strong>funcionário</strong>. Cada funcionário vê apenas as
            próprias tarefas, notas e arquivos.
          </p>
        )}

        <div className="login-demo">
          <strong>Acesso do gestor</strong>
          <span>
            gestor@fourbase.com · senha <code>gestor123</code>
          </span>
          <small>O gestor acompanha as tarefas e o progresso de toda a equipe.</small>
        </div>
      </div>
    </div>
  )
}
