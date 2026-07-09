import { useRef, useState } from 'react'
import { IconMedia, IconTrash } from '../icons.jsx'
import { supabase, MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'

const LIMITS_MB = { image: 10, video: 50 }

function MediaSlot({ kind, label, accept, value, onUploaded, onError }) {
  const inputRef = useRef(null)
  const [progress, setProgress] = useState(null) // null = parado, string = status

  const handleFile = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const limit = LIMITS_MB[kind]
    if (file.size > limit * 1024 * 1024) {
      onError(new Error(`Arquivo muito grande. Máximo para ${kind === 'image' ? 'imagens' : 'vídeos'}: ${limit}MB.`))
      event.target.value = ''
      return
    }
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${kind}/${Date.now()}.${ext}`
    const previousPath = value ? storagePathFromUrl(value) : null

    try {
      setProgress('Enviando...')
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
      })
      if (error) throw error
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
      await onUploaded(kind, data.publicUrl)
      // remove o arquivo antigo do storage depois que o novo foi salvo
      if (previousPath) {
        supabase.storage.from(MEDIA_BUCKET).remove([previousPath]).catch(() => {})
      }
    } catch (err) {
      onError(err)
    } finally {
      setProgress(null)
      event.target.value = ''
    }
  }

  return (
    <div className="media-slot">
      <div
        className={`media-preview${value ? ' has-media' : ''}`}
        onClick={() => !progress && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {progress ? (
          <div className="media-empty">
            <div className="spinner" />
            <strong>{progress}</strong>
            <small>Vídeos grandes podem levar alguns segundos</small>
          </div>
        ) : value ? (
          kind === 'image' ? (
            <img src={value} alt="Imagem carregada" />
          ) : (
            <video src={value} controls onClick={(e) => e.stopPropagation()} />
          )
        ) : (
          <div className="media-empty">
            <IconMedia size={28} />
            <strong>{label}</strong>
            <small>Clique para escolher (máx. {LIMITS_MB[kind]}MB)</small>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} onChange={handleFile} hidden />
      <button className="secondary" disabled={!!progress} onClick={() => inputRef.current?.click()}>
        {progress
          ? 'Enviando...'
          : value
            ? `Trocar ${kind === 'image' ? 'imagem' : 'vídeo'}`
            : `Enviar ${kind === 'image' ? 'imagem' : 'vídeo'}`}
      </button>
    </div>
  )
}

export default function MediaPanel({ media, onUploaded, onError, onClear }) {
  return (
    <div className="panel media-card">
      <div className="media-grid">
        <MediaSlot
          kind="image"
          label="Adicionar imagem"
          accept="image/*"
          value={media.image}
          onUploaded={onUploaded}
          onError={onError}
        />
        <MediaSlot
          kind="video"
          label="Adicionar vídeo"
          accept="video/*"
          value={media.video}
          onUploaded={onUploaded}
          onError={onError}
        />
      </div>
      {(media.image || media.video) && (
        <button className="secondary danger-text" onClick={onClear}>
          <IconTrash size={15} />
          <span>Remover todas as mídias</span>
        </button>
      )}
    </div>
  )
}
