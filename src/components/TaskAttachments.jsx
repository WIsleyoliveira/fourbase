import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
import { IconPaperclip, IconPlus, IconExpandSearch, IconTrash, IconClose } from '../icons.jsx'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Anexos e imagens de uma tarefa: envia direto ao Storage do Supabase (bucket de
// mídia de clientes, pasta tasks/<id>) e devolve a lista de URLs públicas via
// onChange. Usado pelo modal de tarefa (taskId real) e pelo formulário de nova
// tarefa do Kanban (taskId provisório, enquanto a tarefa ainda não existe).
export default function TaskAttachments({ taskId, attachments, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!previewImage) return
    const handler = (e) => { if (e.key === 'Escape') setPreviewImage(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewImage])

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from(CLIENT_MEDIA_BUCKET)
          .upload(path, file, { cacheControl: '3600', contentType: file.type })
        if (error) throw error
        const { data } = supabase.storage.from(CLIENT_MEDIA_BUCKET).getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
      onChange([...(attachments || []), ...uploaded])
    } catch (err) {
      alert(err.message || 'Falha ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  const handleSelect = (e) => {
    uploadFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(e.dataTransfer.files)
  }

  const removeAttachment = (url) => {
    if (!confirm('Remover esta imagem?')) return
    onChange((attachments || []).filter((a) => a !== url))
    const path = storagePathFromUrl(url, CLIENT_MEDIA_BUCKET)
    if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
  }

  return (
    <div className="tdv2-attachments">
      <span className="tdv2-label">
        <IconPaperclip size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
        Anexos e Imagens
      </span>

      <div
        className={`tdv2-dropzone${dragActive ? ' active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <IconPlus size={14} />
        <span>{uploading ? 'Enviando...' : 'Adicionar imagem'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={handleSelect}
        />
      </div>

      {attachments && attachments.length > 0 && (
        <div className="tdv2-attachments-grid">
          {attachments.map((url) => (
            <div className="tdv2-attachment-item" key={url}>
              <img src={url} alt="Anexo" />
              <div className="tdv2-attachment-overlay">
                <button
                  className="tdv2-attachment-btn"
                  title="Ver em tamanho cheio"
                  onClick={() => setPreviewImage(url)}
                >
                  <IconExpandSearch size={15} />
                </button>
                <button
                  className="tdv2-attachment-btn danger"
                  title="Excluir imagem"
                  onClick={() => removeAttachment(url)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewImage && createPortal(
        <div className="lightbox-backdrop" onClick={() => setPreviewImage(null)}>
          <button className="lightbox-close" title="Fechar (Esc)" onClick={() => setPreviewImage(null)}>
            <IconClose size={20} />
          </button>
          <img src={previewImage} alt="Anexo" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  )
}
