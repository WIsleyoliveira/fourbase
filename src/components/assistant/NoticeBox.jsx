import { useState } from 'react'
import { IconChevronDown, IconShield } from '../../icons.jsx'
import { NOTICE } from '../../assistant/notice.js'

// Aviso de privacidade em 2 camadas: 4 linhas sempre visíveis + "Ver detalhes".
export default function NoticeBox({ collapsed = false, acceptedAt = null }) {
  const [open, setOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(!collapsed)
  return (
    <section className="asst-notice" aria-labelledby="asst-notice-title">
      <h4 id="asst-notice-title"><IconShield size={16} /> {NOTICE.title}</h4>
      {acceptedAt && !showSummary ? (
        <p className="asst-muted">
          Você autorizou em {new Date(acceptedAt).toLocaleDateString('pt-BR')}.{' '}
          <button type="button" className="asst-link" onClick={() => setShowSummary(true)}>Rever o aviso</button>
        </p>
      ) : (
        <>
          <ul className="asst-notice-list">
            {NOTICE.summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button type="button" className="asst-link" aria-expanded={open} aria-controls="asst-notice-details" onClick={() => setOpen((v) => !v)}>
            Ver detalhes <IconChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          </button>
          {open && (
            <dl id="asst-notice-details" className="asst-notice-details">
              {NOTICE.details.map((d) => (
                <div key={d.title}>
                  <dt>{d.title}</dt>
                  <dd>{d.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  )
}
