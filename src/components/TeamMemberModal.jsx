import { useState, useEffect } from 'react'
import { IconClose, IconUserCheck } from '../icons.jsx'

// Modal de convite de membro da equipe (usuário do weFlow).
// O gestor NÃO define a senha: ele gera um convite e entrega o link de
// ativação: a própria pessoa convidada cria a senha em /activate/:token.
// Como ainda não há envio de e-mail, o link é exibido aqui para ser copiado —
// e só aparece uma vez, porque o servidor guarda apenas o hash do token.
export default function TeamMemberModal({ onCancel, onSave }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [role, setRole] = useState('funcionario')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null) // { invitation, activation_url }
  const [copied, setCopied] = useState(false)

  // Fecha com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, saving])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim()) {
      setError('Preencha nome e e-mail.')
      return
    }
    setSaving(true)
    try {
      setCreated(await onSave({
        name: name.trim(),
        email: email.trim(),
        role,
        job_title: jobTitle.trim(),
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(created.activation_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <IconUserCheck size={16} /> {created ? 'Convite criado' : 'Convidar membro da equipe'}
          </h3>
          <button className="icon-btn" onClick={onCancel} disabled={saving}>
            <IconClose size={16} />
          </button>
        </div>

        {created ? (
          <div className="kanban-send-form">
            <div className="login-demo">
              <strong>{created.invitation.name}</strong>
              <span>{created.invitation.email}</span>
              <small>
                O link abaixo é de uso único e expira em 72 horas. Envie-o para a pessoa
                convidada — ela define a própria senha ao abrir.
              </small>
            </div>

            <label>
              Link de ativação
              <input type="text" readOnly value={created.activation_url} onFocus={(e) => e.target.select()} />
            </label>

            <button type="button" onClick={copyLink}>
              <span>{copied ? 'Link copiado!' : 'Copiar link'}</span>
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              <span>Fechar</span>
            </button>
          </div>
        ) : (
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

            {error && <div className="login-error">{error}</div>}

            <button type="submit" disabled={saving}>
              <IconUserCheck size={16} />
              <span>{saving ? 'Criando convite…' : 'Criar convite'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
