import { useEffect, useRef, useState } from 'react'
import {
  IconCamera, IconUser, IconLock, IconShield, IconEye, IconEyeOff,
  IconCheckPlain, IconMail, IconPhone, IconTrash,
} from '../icons.jsx'
import { api } from '../api.js'
import { supabase, AVATARS_BUCKET, storagePathFromUrl } from '../supabase.js'
import { assigneeColor } from '../colors.js'
import ColorPickerField from './ColorPickerField.jsx'

const AVATAR_EXTS = ['png', 'jpg', 'jpeg', 'webp']
const AVATAR_LIMIT_MB = 5

const getInitials = (name = '') =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

const formatDate = (iso) => {
  if (!iso) return '—'
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Máscara de telefone BR: (11) 98888-1234 / (11) 3555-7788
const maskPhone = (raw) => {
  const d = String(raw).replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Força da senha: comprimento + variedade de caracteres
const passwordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '', className: '' }
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd)) score++
  if (score <= 2) return { score, label: 'Fraca', className: 'weak' }
  if (score <= 3) return { score, label: 'Média', className: 'medium' }
  return { score, label: 'Forte', className: 'strong' }
}

// ─── Sub-componente: campo de senha com botão de visibilidade ────────────────
function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="profile-field">
      {label}
      <div className="profile-password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="profile-password-toggle"
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <IconEyeOff size={15} /> : <IconEye size={15} />}
        </button>
      </div>
    </label>
  )
}

export default function ProfileView({ currentUser, onProfileSaved, onToast, onError }) {
  const fileInputRef = useRef(null)

  // Perfil completo vindo da API (o objeto da sessão pode estar defasado)
  const [profile, setProfile] = useState(currentUser)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState(currentUser?.name || '')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [color, setColor] = useState(currentUser?.color || null)
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url || null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    api.getProfile()
      .then((p) => {
        setProfile(p)
        setName(p.name || '')
        setJobTitle(p.job_title || '')
        setPhone(p.phone ? maskPhone(p.phone) : '')
        setColor(p.color || null)
        setAvatarUrl(p.avatar_url || null)
      })
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isGestor = profile?.role === 'gestor'
  const accentColor = assigneeColor(profile?.id, color)

  const dirty =
    name !== (profile?.name || '') ||
    jobTitle !== (profile?.job_title || '') ||
    phone !== (profile?.phone ? maskPhone(profile.phone) : '') ||
    color !== (profile?.color || null)

  // ── Foto de perfil ───────────────────────────────────────────────────────
  const uploadAvatar = async (file) => {
    if (!file) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!AVATAR_EXTS.includes(ext)) {
      onError(new Error('Use uma imagem PNG, JPG ou WEBP.'))
      return
    }
    if (file.size > AVATAR_LIMIT_MB * 1024 * 1024) {
      onError(new Error(`A imagem precisa ter até ${AVATAR_LIMIT_MB} MB.`))
      return
    }
    setUploadingAvatar(true)
    try {
      const path = `avatars/${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, file, { cacheControl: '3600', contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)

      const previous = avatarUrl
      const saved = await api.updateProfile({ avatar_url: data.publicUrl })
      setAvatarUrl(saved.user.avatar_url)
      setProfile(saved.user)
      onProfileSaved(saved)
      onToast('Foto de perfil atualizada!')

      // Remove a foto antiga do storage (silencioso — não bloqueia o fluxo)
      const oldPath = previous && storagePathFromUrl(previous, AVATARS_BUCKET)
      if (oldPath) supabase.storage.from(AVATARS_BUCKET).remove([oldPath]).catch(() => {})
    } catch (err) {
      onError(err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const removeAvatar = async () => {
    if (!avatarUrl || !confirm('Remover sua foto de perfil?')) return
    setUploadingAvatar(true)
    try {
      const previous = avatarUrl
      const saved = await api.updateProfile({ avatar_url: null })
      setAvatarUrl(null)
      setProfile(saved.user)
      onProfileSaved(saved)
      onToast('Foto removida.')
      const oldPath = storagePathFromUrl(previous, AVATARS_BUCKET)
      if (oldPath) supabase.storage.from(AVATARS_BUCKET).remove([oldPath]).catch(() => {})
    } catch (err) {
      onError(err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ── Dados pessoais ───────────────────────────────────────────────────────
  const saveProfile = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      onError(new Error('O nome não pode ficar em branco.'))
      return
    }
    setSavingProfile(true)
    try {
      const saved = await api.updateProfile({
        name,
        job_title: jobTitle,
        phone: phone.replace(/\D/g, ''),
        color,
      })
      setProfile(saved.user)
      onProfileSaved(saved)
      onToast('Perfil atualizado com sucesso!')
    } catch (err) {
      onError(err)
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Senha ────────────────────────────────────────────────────────────────
  const strength = passwordStrength(newPassword)
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  const savePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Preencha todos os campos de senha.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A nova senha e a confirmação não coincidem.')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError('A nova senha precisa ser diferente da atual.')
      return
    }
    setSavingPassword(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onToast('Senha alterada com sucesso!')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <p>Carregando perfil...</p>
      </div>
    )
  }

  return (
    <div className="profile-view">
      {/* ══ Card 1: Foto e dados pessoais ══════════════════════════════════ */}
      <form className="panel profile-card" onSubmit={saveProfile}>
        <div className="panel-header">
          <h3>
            <IconUser size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Foto e dados pessoais
          </h3>
        </div>

        <div className="profile-identity">
          <div className="profile-avatar-wrap">
            <div
              className="profile-avatar"
              style={avatarUrl ? undefined : { background: accentColor }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt={name} />
                : <span>{getInitials(name) || '?'}</span>}
              {uploadingAvatar && (
                <div className="profile-avatar-loading"><span className="profile-spinner" /></div>
              )}
            </div>
            <button
              type="button"
              className="profile-avatar-btn"
              title="Alterar foto de perfil"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              <IconCamera size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              hidden
              onChange={(e) => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>

          <div className="profile-identity-meta">
            <strong>{name || 'Sem nome'}</strong>
            <span>{jobTitle || 'Cargo não informado'}</span>
            {avatarUrl && (
              <button type="button" className="profile-avatar-remove" onClick={removeAvatar}>
                <IconTrash size={12} />
                Remover foto
              </button>
            )}
          </div>
        </div>

        <div className="profile-grid">
          <label className="profile-field">
            Nome completo
            <input
              type="text"
              value={name}
              placeholder="Seu nome"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="profile-field">
            <span className="profile-field-label">
              <IconMail size={12} />
              E-mail de acesso
            </span>
            <input type="email" value={profile?.email || ''} readOnly disabled />
            <small className="profile-field-hint">
              O e-mail identifica sua conta e não pode ser alterado aqui.
            </small>
          </label>

          <label className="profile-field">
            Cargo / Função
            <input
              type="text"
              value={jobTitle}
              placeholder="Ex: Gestor de Projetos, Designer"
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </label>

          <label className="profile-field">
            <span className="profile-field-label">
              <IconPhone size={12} />
              Telefone / WhatsApp
            </span>
            <input
              type="tel"
              value={phone}
              placeholder="(11) 98888-1234"
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
          </label>
        </div>

        <ColorPickerField label="Cor de identificação" value={color} onChange={setColor} />

        <div className="profile-actions">
          <button type="submit" disabled={savingProfile || !dirty}>
            <IconCheckPlain size={14} />
            {savingProfile ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      {/* ══ Card 2: Segurança e senha ══════════════════════════════════════ */}
      <form className="panel profile-card" onSubmit={savePassword}>
        <div className="panel-header">
          <h3>
            <IconLock size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Segurança e senha
          </h3>
        </div>

        <div className="profile-grid">
          <PasswordField
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Sua senha de hoje"
            autoComplete="current-password"
          />
          <div />
          <div className="profile-field-stack">
            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
            {newPassword && (
              <div className={`profile-strength ${strength.className}`}>
                <div className="profile-strength-bar">
                  <span style={{ width: `${(strength.score / 5) * 100}%` }} />
                </div>
                <small>Força: {strength.label}</small>
              </div>
            )}
          </div>
          <div className="profile-field-stack">
            <PasswordField
              label="Confirmar nova senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
            {mismatch && <small className="profile-mismatch">As senhas não coincidem.</small>}
            {!mismatch && confirmPassword && (
              <small className="profile-match">
                <IconCheckPlain size={11} /> As senhas coincidem.
              </small>
            )}
          </div>
        </div>

        {passwordError && <div className="login-error">{passwordError}</div>}

        <div className="profile-actions">
          <button type="submit" disabled={savingPassword}>
            <IconLock size={14} />
            {savingPassword ? 'Atualizando…' : 'Atualizar senha'}
          </button>
        </div>
      </form>

      {/* ══ Card 3: Informações do sistema (somente leitura) ═══════════════ */}
      <div className="panel profile-card">
        <div className="panel-header">
          <h3>
            <IconShield size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Informações do sistema
          </h3>
          <span>Somente leitura</span>
        </div>
        <div className="profile-readonly-grid">
          <div className="profile-readonly-item">
            <span>Nível de permissão</span>
            <strong>
              <span className={`role-badge ${profile?.role}`}>
                {isGestor ? 'Gestor' : 'Membro da Equipe'}
              </span>
            </strong>
          </div>
          <div className="profile-readonly-item">
            <span>Conta criada em</span>
            <strong>{formatDate(profile?.created_at)}</strong>
          </div>
          <div className="profile-readonly-item">
            <span>Identificador da conta</span>
            <strong className="profile-readonly-id">{profile?.id}</strong>
          </div>
        </div>
        <p className="profile-readonly-note">
          {isGestor
            ? 'Como Gestor, você acompanha as tarefas de toda a equipe e gerencia membros e clientes.'
            : 'Como Membro da Equipe, você visualiza e gerencia as tarefas atribuídas a você.'}
        </p>
      </div>
    </div>
  )
}
