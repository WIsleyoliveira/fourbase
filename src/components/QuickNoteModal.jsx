import { useState } from 'react'
import { IconClose, IconNotes } from '../icons.jsx'
import { useNoteActions } from '../hooks/useNotes.js'
import { quickNoteHtml } from '../dashboardData.js'

// Nota rápida do Painel: título + texto simples, sem sair da tela. Vira uma nota
// normal (aparece em Notas, onde dá para formatar e anexar).
export default function QuickNoteModal({ onClose }) {
  const { addNote } = useNoteActions()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const empty = !title.trim() && !text.trim()

  const submit = async (e) => {
    e.preventDefault()
    if (empty || saving) return
    setSaving(true)
    try {
      const note = await addNote(title.trim() || 'Nota rápida', quickNoteHtml(text))
      if (note) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Nota rápida" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <IconNotes size={16} /> Nota rápida
          </h3>
          <button className="icon-btn" onClick={onClose} title="Fechar" aria-label="Fechar">
            <IconClose size={16} />
          </button>
        </div>
        <form className="kanban-send-form" onSubmit={submit}>
          <label>
            Título
            <input
              type="text"
              placeholder="Sobre o que é a nota?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Anotação
            <textarea
              rows={6}
              placeholder="Escreva aqui…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button type="submit" disabled={empty || saving}>
            <IconNotes size={16} />
            <span>{saving ? 'Salvando…' : 'Salvar nota'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
