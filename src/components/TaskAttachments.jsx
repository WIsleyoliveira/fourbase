import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
import {
  IconPaperclip, IconPlus, IconExpandSearch, IconTrash, IconClose, IconDownload,
  IconFilePdf, IconFileText, IconSheet, IconPresentation,
} from '../icons.jsx'
import { useToast } from '../toast.jsx'
import { MAX_FILE_MB, fileKind, fileNameFromUrl, isHttpUrl, isImageName, storagePathFor, validateFile } from '../taskFiles.js'

const FILE_ICONS = { pdf: IconFilePdf, sheet: IconSheet, slides: IconPresentation, doc: IconFileText }

// Anexos de uma tarefa — imagens ou qualquer outro tipo de arquivo (PDF, planilha,
// documento, zip…; veja src/taskFiles.js para limites e formatos recusados). Envia direto
// ao Storage do Supabase (bucket de mídia de clientes, pasta tasks/<id>/<único>/<nome>) e
// devolve a lista de URLs públicas via onChange. Usado pelo modal de tarefa (taskId real) e
// pelo formulário de nova tarefa do Kanban (taskId provisório, enquanto a tarefa não existe).
export default function TaskAttachments({ taskId, attachments, onChange }) {
  const { showToast } = useToast()
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
    const all = Array.from(fileList || [])
    if (!all.length) return
    const problems = []
    const files = all.filter((f) => {
      const problem = validateFile(f)
      if (problem) problems.push(problem)
      return !problem
    })
    if (problems.length) showToast(problems.join(' '))
    if (!files.length) return

    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const path = storagePathFor(taskId, file.name, unique)
        const { error } = await supabase.storage
          .from(CLIENT_MEDIA_BUCKET)
          .upload(path, file, { cacheControl: '3600', contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const { data } = supabase.storage.from(CLIENT_MEDIA_BUCKET).getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
      onChange([...(attachments || []), ...uploaded])
    } catch (err) {
      showToast(err.message || 'Falha ao enviar o arquivo.')
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
    if (!confirm(`Remover o anexo “${fileNameFromUrl(url)}”?`)) return
    onChange((attachments || []).filter((a) => a !== url))
    const path = storagePathFromUrl(url, CLIENT_MEDIA_BUCKET)
    if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
  }

  // só mostra o que é http(s): um "javascript:" gravado por outra pessoa não vira link clicável
  const list = (attachments || []).filter(isHttpUrl)
  const images = list.filter((url) => isImageName(fileNameFromUrl(url)))
  const files = list.filter((url) => !isImageName(fileNameFromUrl(url)))

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
        title={`Qualquer tipo de arquivo, até ${MAX_FILE_MB} MB cada`}
      >
        <IconPlus size={14} />
        <span>{uploading ? 'Enviando...' : 'Adicionar arquivo ou imagem'}</span>
        <input ref={inputRef} type="file" multiple hidden onChange={handleSelect} />
      </div>
      <small className="tdv2-attachments-hint">Qualquer tipo de arquivo, até {MAX_FILE_MB} MB cada. Arraste para cá ou clique.</small>

      {images.length > 0 && (
        <div className="tdv2-attachments-grid">
          {images.map((url) => (
            <div className="tdv2-attachment-item" key={url}>
              <img src={url} alt={fileNameFromUrl(url) || 'Anexo'} />
              <div className="tdv2-attachment-overlay">
                <button
                  type="button"
                  className="tdv2-attachment-btn"
                  title="Ver em tamanho cheio"
                  onClick={() => setPreviewImage(url)}
                >
                  <IconExpandSearch size={15} />
                </button>
                <button
                  type="button"
                  className="tdv2-attachment-btn danger"
                  title="Excluir anexo"
                  onClick={() => removeAttachment(url)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="tdv2-file-list">
          {files.map((url) => {
            const name = fileNameFromUrl(url) || 'Arquivo'
            const Icon = FILE_ICONS[fileKind(name)] || IconFileText
            return (
              <li className="tdv2-file-item" key={url}>
                <span className="tdv2-file-icon"><Icon size={18} /></span>
                <a className="tdv2-file-name" href={url} target="_blank" rel="noopener noreferrer" title={`Abrir ${name}`}>
                  {name}
                </a>
                <a className="tdv2-file-action" href={url} download={name} target="_blank" rel="noopener noreferrer" title="Baixar" aria-label={`Baixar ${name}`}>
                  <IconDownload size={14} />
                </a>
                <button
                  type="button"
                  className="tdv2-file-action danger"
                  title="Excluir anexo"
                  aria-label={`Excluir ${name}`}
                  onClick={() => removeAttachment(url)}
                >
                  <IconTrash size={14} />
                </button>
              </li>
            )
          })}
        </ul>
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
