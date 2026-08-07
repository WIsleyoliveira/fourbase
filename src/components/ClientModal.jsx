import { useState, useEffect } from 'react'
import { IconClose, IconBuilding, IconUser } from '../icons.jsx'
import { maskCNPJ, maskPhone, isValidEmail, isValidCNPJLength } from '../format.js'

// Modal de cadastro/edição de cliente. Todos os campos são opcionais.
// `client` preenchido → modo edição; ausente → modo criação.
export default function ClientModal({ client, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    cnpj: client?.cnpj || '',
    phone: client?.phone || '',
    email: client?.email || '',
    contact_name: client?.contact_name || '',
    address: client?.address || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEdit = !!client

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  // Fecha com ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, saving])

  const emailOk = isValidEmail(form.email)
  const cnpjOk = isValidCNPJLength(form.cnpj)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!emailOk) { setError('Informe um e-mail válido ou deixe o campo em branco.'); return }
    if (!cnpjOk)  { setError('O CNPJ deve ter 14 dígitos ou ficar em branco.'); return }
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        cnpj: form.cnpj.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        contact_name: form.contact_name.trim(),
        address: form.address.trim(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && onCancel()}>
      <div className="modal client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <IconBuilding size={16} /> {isEdit ? 'Editar cliente' : 'Cadastrar cliente'}
          </h3>
          <button className="icon-btn" onClick={onCancel} disabled={saving}>
            <IconClose size={16} />
          </button>
        </div>

        <form className="kanban-send-form client-form" onSubmit={submit}>
          {/* ── Dados da empresa ── */}
          <div className="client-form-section">
            <span className="client-form-legend"><IconBuilding size={13} /> Dados da empresa</span>
            <label>
              Nome da empresa/cliente
              <input
                type="text"
                placeholder="Ex: Acme Ltda"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoFocus
              />
            </label>
            <label className={!cnpjOk ? 'has-error' : ''}>
              CNPJ
              <input
                type="text"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => set('cnpj', maskCNPJ(e.target.value))}
              />
            </label>
            <label>
              Endereço
              <textarea
                rows={2}
                placeholder="Rua, número, cidade, estado..."
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </label>
          </div>

          {/* ── Contato ── */}
          <div className="client-form-section">
            <span className="client-form-legend"><IconUser size={13} /> Contato</span>
            <label>
              Pessoa de contato
              <input
                type="text"
                placeholder="Nome do responsável"
                value={form.contact_name}
                onChange={(e) => set('contact_name', e.target.value)}
              />
            </label>
            <div className="kanban-send-row">
              <label>
                Telefone
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={(e) => set('phone', maskPhone(e.target.value))}
                />
              </label>
              <label className={!emailOk ? 'has-error' : ''}>
                E-mail
                <input
                  type="email"
                  placeholder="contato@empresa.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </label>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}
          <p className="client-form-hint">Todos os campos são opcionais.</p>

          <button type="submit" disabled={saving}>
            <IconBuilding size={16} />
            <span>{saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
