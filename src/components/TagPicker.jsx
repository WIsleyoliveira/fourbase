import { useEffect, useRef, useState } from 'react'
import { IconClose, IconPlus, IconTag } from '../icons.jsx'
import { tagColor } from '../colors.js'

// Multi-select criável de etiquetas (estilo Notion/Combobox): mostra as
// etiquetas selecionadas como badges removíveis + um campo que busca entre as
// etiquetas existentes e permite cadastrar uma nova pelo nome digitado.
//
// A opção "Criar" é uma linha da lista como qualquer outra (navegável pelas
// setas), então digitar um nome parecido com o de uma etiqueta já existente
// não impede de criar a nova — basta escolher a linha "Criar".
export default function TagPicker({ value = [], onChange, availableTags = [], onCreateTag, placeholder = 'Buscar ou criar etiqueta...' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
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
  const matches = availableTags.filter((t) => !selectedSet.has(t.name) && t.name.toLowerCase().includes(q))
  const exactExists = availableTags.some((t) => t.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exactExists

  // Lista navegável: etiquetas existentes + (opcionalmente) a linha de criação
  const options = [
    ...matches.map((t) => ({ kind: 'tag', tag: t })),
    ...(canCreate ? [{ kind: 'create' }] : []),
  ]

  // Volta o destaque para o topo sempre que a lista muda
  useEffect(() => { setActiveIndex(0) }, [query, value.length])

  // Mantém a opção destacada visível ao navegar pelas setas
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('.tag-picker-option.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

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

  const chooseOption = (opt) => {
    if (!opt) return
    if (opt.kind === 'create') handleCreate()
    else addTag(opt.tag.name)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return
      e.preventDefault()
      setOpen(true)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + delta + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      chooseOption(options[activeIndex])
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

      {open && (
        <div className="tag-picker-menu" ref={menuRef}>
          {matches.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`tag-picker-option${activeIndex === i ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => addTag(t.name)}
            >
              <span className="tag-picker-dot" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              className={`tag-picker-option tag-picker-create${activeIndex === matches.length ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(matches.length)}
              onClick={handleCreate}
              disabled={creating}
            >
              <IconPlus size={11} />
              {creating ? 'Criando…' : <>Criar nova etiqueta <strong>“{query.trim()}”</strong></>}
            </button>
          )}

          {/* Sem texto digitado: deixa explícito que dá para cadastrar uma nova */}
          {!q && (
            <div className="tag-picker-hint">
              <IconTag size={11} />
              Digite um nome para criar uma nova etiqueta
            </div>
          )}

          {q && matches.length === 0 && exactExists && (
            <div className="tag-picker-hint">Essa etiqueta já foi adicionada.</div>
          )}
        </div>
      )}
    </div>
  )
}
