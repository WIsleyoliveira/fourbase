import { useEffect, useRef, useState } from 'react'
import { IconClose, IconUser } from '../icons.jsx'
import Avatar from './Avatar.jsx'

// Multi-select de membros (mesmo padrão do TagPicker): mostra os selecionados
// como pills removíveis + um campo que busca entre os demais membros do
// workspace. Sem "criar" — membro não se cadastra por aqui, só se escolhe.
export default function MemberPicker({ value = [], onChange, members = [], excludeId = null, placeholder = 'Mencionar outros membros...' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

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
  // Nunca sugere quem já está mencionado, nem o próprio responsável (já está
  // "na" tarefa por outro campo — mencionar de novo não agrega nada).
  const matches = members.filter(
    (m) => m.id !== excludeId && !selectedSet.has(m.id) && m.name.toLowerCase().includes(q),
  )

  useEffect(() => { setActiveIndex(0) }, [query, value.length])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('.tag-picker-option.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const addMember = (id) => {
    if (!selectedSet.has(id)) onChange([...value, id])
    setQuery('')
    inputRef.current?.focus()
  }

  const removeMember = (id) => onChange(value.filter((v) => v !== id))

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (matches.length === 0) return
      e.preventDefault()
      setOpen(true)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + delta + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[activeIndex]) addMember(matches[activeIndex].id)
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      removeMember(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="tag-picker member-picker" ref={containerRef}>
      <div className="tag-picker-pills" onClick={() => { setOpen(true); inputRef.current?.focus() }}>
        {value.map((id) => {
          const member = members.find((m) => m.id === id)
          return (
            <span key={id} className="tag-pill member-pill">
              <Avatar id={id} name={member?.name} list={members} className="member-pill-avatar" />
              {member?.name || 'Membro removido'}
              <button type="button" onClick={(e) => { e.stopPropagation(); removeMember(id) }} title="Remover menção">
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

      {open && (
        <div className="tag-picker-menu" ref={menuRef}>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`tag-picker-option${activeIndex === i ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => addMember(m.id)}
            >
              <Avatar id={m.id} name={m.name} list={members} className="member-picker-option-avatar" />
              {m.name}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="tag-picker-hint">
              <IconUser size={11} />
              {q ? 'Nenhum membro encontrado.' : 'Todo mundo já foi mencionado.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
