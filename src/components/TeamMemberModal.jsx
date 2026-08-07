import { useState, useEffect } from 'react'
import { IconClose, IconUserCheck } from '../icons.jsx'
import ColorPickerField from './ColorPickerField.jsx'

// Modal de cadastro de membro da equipe (usuário do software Fourbase).
// A senha é necessária para o login do novo usuário.
export default function TeamMemberModal({ onCancel, onSave }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [role, setRole] = useState('funcionario')
  const [color, setColor] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Fecha com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, saving])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        job_title: jobTitle.trim(),
        color,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <IconUserCheck size={16} /> Cadastrar membro da equipe
          </h3>
          <button className="icon-btn" onClick={onCancel} disabled={saving}>
            <IconClose size={16} />
          </button>
        </div>
        <form className="kanban-send-form" onSubmit={submit}>
          <label>
            Nome
            <input
              type="text"
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha de acesso
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </label>
          <div className="kanban-send-row">
            <label>
              Cargo/Função
              <input
                type="text"
                placeholder="Ex: Designer, Gerente"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </label>
            <label>
              Nível de permissão
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="funcionario">Funcionário</option>
                <option value="gestor">Gestor</option>
              </select>
            </label>
          </div>

          <ColorPickerField value={color} onChange={setColor} />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={saving}>
            <IconUserCheck size={16} />
            <span>{saving ? 'Cadastrando…' : 'Cadastrar membro'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
