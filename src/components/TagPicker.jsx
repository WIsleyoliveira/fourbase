import { useEffect, useRef, useState } from 'react'
import { IconClose, IconPlus } from '../icons.jsx'
import { tagColor } from '../colors.js'

// Multi-select criável de etiquetas (estilo Notion): mostra as etiquetas
// selecionadas como badges removíveis + um campo de busca/criação que lista
// as etiquetas existentes que combinam com o texto digitado e oferece
// "+ Criar" quando o texto não corresponde a nenhuma etiqueta cadastrada.
export default function TagPicker({ value = [], onChange, availableTags = [], onCreateTag, placeholder = 'Adicionar etiqueta...' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const q = query.trim().toLowerCase()
  const selectedSet = new Set(value)
  const matches = availableTags.filter((t) => !selectedSet.has(t.name) && t.name.toLowerCase().includes(q))
  const exactExists = availableTags.some((t) => t.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exactExists

  const addTag = (name) => {
    if (!selectedSet.has(name)) onChange([...value, name])
    setQuery('')
    inputRef.current?.focus()
  }

  const removeTag = (name) => onChange(value.filter((v) => v !== name))

  const handleCreate = async () => {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const tag = await onCreateTag(name)
      addTag(tag.name)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (matches.length > 0) addTag(matches[0].name)
      else if (canCreate) handleCreate()
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      removeTag(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="tag-picker" ref={containerRef}>
      <div className="tag-picker-pills" onClick={() => { setOpen(true); inputRef.current?.focus() }}>
        {value.map((name) => {
          const color = tagColor(name, availableTags)
          return (
            <span key={name} className="tag-pill" style={{ background: `${color}1f`, color }}>
              {name}
              <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(name) }} title="Remover etiqueta">
                <IconClose size={10} />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          className="tag-picker-input"
          value={query}
          placeholder={value.length === 0 ? placeholder : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && (matches.length > 0 || canCreate) && (
        <div className="tag-picker-menu">
          {matches.map((t) => (
            <button key={t.id} type="button" className="tag-picker-option" onClick={() => addTag(t.name)}>
              <span className="tag-picker-dot" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="tag-picker-option tag-picker-create" onClick={handleCreate} disabled={creating}>
              <IconPlus size={11} />
              {creating ? 'Criando…' : `Criar "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
