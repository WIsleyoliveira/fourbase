import { useEffect, useState } from 'react'
import { IconRocket, IconKanban, IconBuilding, IconFileSpreadsheet, IconClose } from '../icons.jsx'

// Wizard de boas-vindas do primeiro acesso. Sem Framer Motion/Tailwind — o
// projeto não usa nenhum dos dois (ver CSS puro em styles.css); a transição
// entre passos é feita com uma animação CSS disparada por `key={step}`, que
// força o React a remontar o conteúdo a cada passo.
const STEPS = [
  {
    icon: IconRocket,
    title: 'Seu novo fluxo de trabalho começa aqui',
    text: 'O weFlow foi desenhado para simplificar a gestão de projetos, aproximar sua equipe dos clientes e manter todas as entregas sob controle em um só lugar.',
  },
  {
    icon: IconKanban,
    title: 'Kanban e Calendário Sincronizados',
    text: 'Acompanhe prazos, atribua tarefas, organize datas de entrega e utilize etiquetas personalizadas para manter a rotina da equipe totalmente transparente.',
  },
  {
    icon: IconBuilding,
    title: 'Contexto Centralizado por Cliente',
    text: 'Acesse quadros exclusivos, arquivos e pastas organizadas para cada cliente. Nada de documentos perdidos ou tarefas sem dono.',
  },
  {
    icon: IconFileSpreadsheet,
    title: 'Relatórios Profissionais em Segundos',
    text: 'Suas tarefas viram relatórios de atividades automaticamente. Configure o período, personalize a mensagem e exporte PDFs prontos para o seu cliente.',
  },
]

export default function Onboarding({ onFinish, onSkip }) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onSkip() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSkip])

  const advance = () => (isLast ? onFinish() : setStep((s) => s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const current = STEPS[step]
  const Ico = current.icon

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">
        <button className="onboarding-skip" onClick={onSkip}>
          Pular introdução
          <IconClose size={13} />
        </button>

        <div className="onboarding-content" key={step}>
          <div className="onboarding-icon">
            <Ico size={40} />
          </div>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
        </div>

        <div className="onboarding-progress">
          <span className="onboarding-progress-label">
            Passo {step + 1} de {STEPS.length}
          </span>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'active' : i < step ? 'done' : ''} />
            ))}
          </div>
        </div>

        <div className="onboarding-actions">
          {step > 0 ? (
            <button className="onboarding-back" onClick={back}>
              Voltar
            </button>
          ) : (
            <span />
          )}
          <button
            className={isLast ? 'onboarding-cta' : 'onboarding-next'}
            onClick={advance}
          >
            {isLast ? 'Começar a explorar o weFlow ✨' : 'Avançar'}
          </button>
        </div>
      </div>
    </div>
  )
}
