import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Icons from '../icons.jsx'
import { IconClose, IconArrowLeft, IconArrowRight, IconRocket, IconCheckPlain } from '../icons.jsx'

// "O que há de novo": passo a passo das novidades, mostrado uma vez ao entrar depois
// de uma atualização (ver src/whatsNew.js) e reaberto pelo botão "Novidades" do menu.
// Primeiro passo = apresentação da versão; depois um passo por novidade.
export default function WhatsNewModal({ releases, onClose, onNavigate }) {
  const release = releases[0]
  const steps = [{ hero: true }, ...release.items]
  const [index, setIndex] = useState(0)
  const nextRef = useRef(null)
  const step = steps[index]
  const last = index === steps.length - 1

  const go = (delta) => setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta)))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Foco no botão principal a cada passo (teclado e leitor de tela seguem o fluxo)
  useEffect(() => { nextRef.current?.focus() }, [index])

  const Icon = step.hero ? IconRocket : (Icons[step.icon] || IconRocket)

  return createPortal(
    <div className="modal-backdrop whatsnew-backdrop" onClick={onClose}>
      <div
        className="whatsnew"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="whatsnew-close icon-btn" onClick={onClose} title="Fechar" aria-label="Fechar">
          <IconClose size={16} />
        </button>

        <div className={`whatsnew-art${step.hero ? ' hero' : ''}`} aria-hidden="true">
          <span className="whatsnew-art-icon"><Icon size={44} /></span>
        </div>

        <div className="whatsnew-body" key={index}>
          {step.hero ? (
            <>
              <span className="whatsnew-chip">Versão {release.version}</span>
              <h2 id="whatsnew-title">{release.title}</h2>
              <p>{release.intro}</p>
              <ul className="whatsnew-toc">
                {release.items.map((it, i) => (
                  <li key={it.title}>
                    <button type="button" onClick={() => setIndex(i + 1)}>
                      <IconCheckPlain size={12} />
                      {it.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <span className={`whatsnew-chip kind-${step.kind.toLowerCase()}`}>{step.kind}</span>
              <h2 id="whatsnew-title">{step.title}</h2>
              <p>{step.text}</p>
              {step.points?.length > 0 && (
                <ul className="whatsnew-points">
                  {step.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {step.cta && (
                <button type="button" className="whatsnew-cta" onClick={() => { onNavigate(step.cta.path); onClose() }}>
                  {step.cta.label}
                  <IconArrowRight size={13} />
                </button>
              )}
            </>
          )}
        </div>

        <div className="whatsnew-footer">
          <div className="whatsnew-dots" aria-label={`Passo ${index + 1} de ${steps.length}`}>
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? 'active' : ''}
                onClick={() => setIndex(i)}
                aria-label={`Ir para o passo ${i + 1}`}
                aria-current={i === index ? 'step' : undefined}
              />
            ))}
          </div>
          <div className="whatsnew-actions">
            {index > 0 ? (
              <button type="button" className="whatsnew-back" onClick={() => go(-1)}>
                <IconArrowLeft size={13} /> Voltar
              </button>
            ) : (
              <button type="button" className="whatsnew-skip" onClick={onClose}>Pular</button>
            )}
            <button
              type="button"
              className="whatsnew-next"
              ref={nextRef}
              onClick={last ? onClose : () => go(1)}
            >
              {last ? 'Entendi!' : index === 0 ? 'Ver novidades' : 'Próximo'}
              {!last && <IconArrowRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
