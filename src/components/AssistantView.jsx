import { useCallback, useState } from 'react'
import { useToast } from '../toast.jsx'
import { deriveAssistantStatus } from '../assistantStatus.js'
import { useAssistantActions, useAssistantTokens } from '../hooks/useAssistant.js'
import LoadingBlock from './LoadingBlock.jsx'
import AssistantOnboarding from './assistant/AssistantOnboarding.jsx'
import AssistantHome from './assistant/AssistantHome.jsx'

// Tela "Assistente" (só gestor): conectar o ChatGPT e acompanhar o que ele faz.
// Modo 1 (sem conexão, ou configurando): onboarding em 4 passos + teste.
// Modo 2 (conectado): status, histórico com desfazer, ideias e limites.
export default function AssistantView({ onOpenKanban }) {
  const { showToast, handleError } = useToast()
  const [testing, setTesting] = useState(false)
  const tokens = useAssistantTokens({ testing })
  const { createKey } = useAssistantActions()
  const [flow, setFlow] = useState(null) // null = decide pelo status; { step } = onboarding aberto
  const [live, setLive] = useState('')

  const announce = useCallback((msg, { toast = false } = {}) => {
    setLive('')
    setTimeout(() => setLive(msg), 30) // reanuncia mesmo se a mensagem repetir
    if (toast) showToast(msg)
  }, [showToast])
  const onTestingChange = useCallback((v) => setTesting(v), [])

  if (tokens.isPending) return <LoadingBlock />
  if (tokens.isError) {
    return (
      <div className="panel asst-callout">
        Não conseguimos carregar o Assistente agora.{' '}
        <button type="button" className="asst-link" onClick={() => tokens.refetch()}>Tentar de novo</button>
      </div>
    )
  }

  const data = tokens.data
  const status = deriveAssistantStatus(data.tokens)
  const onboarding = flow || status.state === 'never' || status.state === 'off'

  const replaceShared = async () => {
    try {
      const k = await createKey.mutateAsync({ replaces: status.key?.id })
      setFlow({ step: 3, key: Date.now(), fresh: { id: k.id, token: k.token } })
      announce('A chave anterior foi desligada. Cole a nova no ChatGPT.', { toast: true })
    } catch (err) {
      handleError(err)
    }
  }

  return (
    <div className="asst-view">
      <p className="sr-only" aria-live="polite">{live}</p>
      {onboarding ? (
        <AssistantOnboarding
          key={flow?.key ?? 'start'}
          data={data}
          status={status}
          startStep={flow?.step}
          initialKey={flow?.fresh ?? null}
          onFinish={() => { setFlow(null); setTesting(false) }}
          onCancel={() => { setFlow(null); setTesting(false) }}
          onTestingChange={onTestingChange}
          // ao criar a chave o status vira "aguardando": mantém o onboarding aberto (mesma key, sem remontar)
          onEngage={() => setFlow((f) => f || { key: 'start' })}
          announce={announce}
        />
      ) : (
        <AssistantHome
          data={data}
          status={status}
          onReconnect={() => setFlow({ step: 1, key: Date.now() })}
          onResume={(step) => setFlow({ step, key: Date.now() })}
          onReplaceShared={replaceShared}
          onOpenKanban={onOpenKanban}
          announce={announce}
        />
      )}
    </div>
  )
}
