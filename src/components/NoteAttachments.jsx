import { IconTrash, IconDownload, IconFilePdf, IconFileText, IconSheet, IconPresentation } from '../icons.jsx'

export const extOf = (name = '') => {
  const parts = String(name).split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp']

export const isImageAttachment = (att) =>
  att.file_type?.startsWith('image/') || IMAGE_EXTS.includes(extOf(att.file_name))

const ICON_BY_EXT = {
  pdf: IconFilePdf,
  ppt: IconPresentation, pptx: IconPresentation,
  doc: IconFileText, docx: IconFileText, txt: IconFileText,
  xls: IconSheet, xlsx: IconSheet, csv: IconSheet,
}

const iconFor = (name) => ICON_BY_EXT[extOf(name)] || IconFileText

export const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Lista de anexos já salvos — puramente apresentacional; upload/remoção
// vivem em NotesView.jsx (que também controla drag&drop e o input de arquivo).
export default function NoteAttachments({ attachments = [], onRemove, onPreviewImage }) {
  if (attachments.length === 0) return null

  return (
    <div className="note-attachments-grid">
      {attachments.map((att) => {
        const image = isImageAttachment(att)
        const Icon = iconFor(att.file_name)
        return (
          <div className="note-attachment-card" key={att.id}>
            {image ? (
              <button
                type="button"
                className="note-attachment-thumb"
                onClick={() => onPreviewImage(att.file_url)}
                title="Ver imagem"
              >
                <img src={att.file_url} alt={att.file_name} />
              </button>
            ) : (
              <div className="note-attachment-file">
                <Icon size={22} />
              </div>
            )}
            <div className="note-attachment-info">
              <span className="note-attachment-name" title={att.file_name}>{att.file_name}</span>
              <span className="note-attachment-size">{formatFileSize(att.file_size)}</span>
            </div>
            <div className="note-attachment-actions">
              <a
                className="icon-btn"
                href={att.file_url}
                download={att.file_name}
                target="_blank"
                rel="noreferrer"
                title="Baixar anexo"
              >
                <IconDownload size={13} />
              </a>
              <button
                type="button"
                className="icon-btn danger"
                title="Remover anexo"
                onClick={() => onRemove(att)}
              >
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
