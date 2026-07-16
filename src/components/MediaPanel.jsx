import { useEffect, useRef, useState } from 'react'
import { IconMedia, IconTrash, IconPlus } from '../icons.jsx'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
import { api } from '../api.js'

const LIMIT_MB = 25

const kindFromFile = (file) => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

export default function MediaPanel({ onError }) {
  const [clients, setClients] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [gallery, setGallery] = useState([])
  const [search, setSearch] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api
      .getClients()
      .then((list) => {
        setClients(list)
        if (list.length) setSelectedId(list[0].id)
      })
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) {
      setGallery([])
      return
    }
    api.getClientMedia(selectedId).then(setGallery).catch(onError)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const createClient = async (e) => {
    e.preventDefault()
    if (!newClientName.trim()) return
    try {
      const client = await api.createClient(newClientName.trim())
      setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId(client.id)
      setNewClientName('')
    } catch (err) {
      onError(err)
    }
  }

  const removeClient = async (id) => {
    if (!confirm('Excluir este cliente e toda a galeria dele?')) return
    try {
      await api.deleteClient(id)
      setClients((prev) => prev.filter((c) => c.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      onError(err)
    }
  }

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || !selectedId) return
    setUploading(true)
    try {
      for (const file of files) {
        if (file.size > LIMIT_MB * 1024 * 1024) {
          onError(new Error(`"${file.name}" é maior que ${LIMIT_MB}MB.`))
          continue
        }
        const kind = kindFromFile(file)
        const ext = file.name.split('.').pop() || 'bin'
        const path = `${selectedId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from(CLIENT_MEDIA_BUCKET).upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
        })
        if (error) throw error
        const { data } = supabase.storage.from(CLIENT_MEDIA_BUCKET).getPublicUrl(path)
        const saved = await api.addClientMedia(selectedId, kind, data.publicUrl, file.name)
        setGallery((prev) => [saved, ...prev])
      }
    } catch (err) {
      onError(err)
    } finally {
      setUploading(false)
    }
  }

  const removeMedia = async (item) => {
    if (!confirm('Remover este arquivo?')) return
    try {
      await api.deleteClientMedia(selectedId, item.id)
      setGallery((prev) => prev.filter((g) => g.id !== item.id))
      const path = storagePathFromUrl(item.url, CLIENT_MEDIA_BUCKET)
      if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
    } catch (err) {
      onError(err)
    }
  }

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <p>Carregando clientes...</p>
      </div>
    )
  }

  const visibleClients = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  const selected = clients.find((c) => c.id === selectedId) || null

  return (
    <div className="media-layout">
      <aside className="panel client-list">
        <div className="notes-list-header">
          <h3>Clientes</h3>
        </div>
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <form className="client-add-form" onSubmit={createClient}>
          <input
            type="text"
            placeholder="Novo cliente"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
          />
          <button type="submit" className="icon-btn" title="Adicionar cliente">
            <IconPlus size={16} />
          </button>
        </form>
        <div className="client-items">
          {visibleClients.length === 0 && <div className="empty-hint">Nenhum cliente encontrado.</div>}
          {visibleClients.map((c) => (
            <div
              key={c.id}
              className={`client-item${c.id === selectedId ? ' active' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              <span>{c.name}</span>
              <button
                className="icon-btn danger"
                title="Excluir cliente"
                onClick={(e) => {
                  e.stopPropagation()
                  removeClient(c.id)
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {selected ? (
        <div className="panel client-gallery">
          <div className="panel-header">
            <div>
              <h3>{selected.name}</h3>
              <span>
                {gallery.length} arquivo{gallery.length === 1 ? '' : 's'}
              </span>
            </div>
            <button disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'Enviando...' : 'Adicionar fotos/documentos'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              multiple
              hidden
              onChange={handleUpload}
            />
          </div>
          <div className="gallery-grid">
            {gallery.length === 0 && (
              <div className="empty-hint">Nenhum arquivo ainda — envie a primeira foto ou documento.</div>
            )}
            {gallery.map((item) => (
              <div className="gallery-item" key={item.id}>
                {item.kind === 'image' && <img src={item.url} alt={item.name || 'Imagem'} />}
                {item.kind === 'video' && <video src={item.url} controls />}
                {item.kind === 'document' && (
                  <a className="gallery-doc" href={item.url} target="_blank" rel="noreferrer">
                    <IconMedia size={26} />
                    <span>{item.name || 'Documento'}</span>
                  </a>
                )}
                <button className="icon-btn danger gallery-remove" title="Remover" onClick={() => removeMedia(item)}>
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel editor-empty">
          <IconMedia size={34} />
          <strong>Nenhum cliente selecionado</strong>
          <p>Crie um cliente para começar a guardar fotos e documentos da empresa.</p>
        </div>
      )}
    </div>
  )
}
