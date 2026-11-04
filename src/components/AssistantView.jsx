import { useCallback, useState } from 'react'
import { useToast } from '../toast.jsx'
import { deriveAssistantStatus } from '../assistantStatus.js'
import { useAssistantActions, useAssistantTokens } from '../hooks/useAssistant.js'
import LoadingBlock from './LoadingBlock.jsx'
import AppOnboarding from './assistant/AppOnboarding.jsx'
import AssistantOnboarding from './assistant/AssistantOnboarding.jsx'
import AssistantHome from './assistant/AssistantHome.jsx'

// Tela "Assistente" (só gestor): conectar o ChatGPT e acompanhar o que ele faz.
// Modo 1 (sem conexão, ou configurando): passo a passo. O caminho principal é o APP do ChatGPT (servidor MCP +
// login OAuth, sem chave); o "modo antigo" (GPT personalizado com chave) continua disponível até a OpenAI
// descontinuar os GPTs.
// Modo 2 (conectado): status, histórico com desfazer, ideias e limites.
export default function AssistantView({ onOpenKanban }) {
  const { showToast, handleError } = useToast()
  const [testing, setTesting] = useState(false)
  const tokens = useAssistantTokens({ testing })
  const { createKey } = useAssistantActions()
  // null = decide pelo status; { step, legacy?, fresh? } = passo a passo aberto (legacy = GPT com chave)
  const [flow, setFlow] = useState(null)
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
  const close = () => { setFlow(null); setTesting(false) }
  // ao avançar o passo a passo o status muda (chave criada / app conectado): mantém o passo a passo aberto
  // (mesma key, sem remontar) até a pessoa terminar
  const engage = () => setFlow((f) => f || { key: 'start' })

  // "Compartilhei meu assistente por engano": só existe no modo antigo (chave colada num GPT)
  const replaceShared = async () => {
    try {
      const k = await createKey.mutateAsync({ replaces: status.key?.id })
      setFlow({ legacy: true, step: 3, key: Date.now(), fresh: { id: k.id, token: k.token } })
      announce('A chave anterior foi desligada. Cole a nova no ChatGPT.', { toast: true })
    } catch (err) {
      handleError(err)
    }
  }

  const resume = (step) => setFlow({ step, key: Date.now(), legacy: status.key?.kind === 'personal' })

  return (
    <div className="asst-view">
      <p className="sr-only" aria-live="polite">{live}</p>
      {onboarding ? (
        flow?.legacy ? (
          <AssistantOnboarding
            key={flow.key ?? 'start'}
            data={data}
            status={status}
            startStep={flow.step}
            initialKey={flow.fresh ?? null}
            onFinish={close}
            onCancel={close}
            onTestingChange={onTestingChange}
            onEngage={engage}
            announce={announce}
          />
        ) : (
          <AppOnboarding
            key={flow?.key ?? 'start'}
            data={data}
            status={status}
            startStep={flow?.step}
            onFinish={close}
            onCancel={close}
            onTestingChange={onTestingChange}
            onEngage={engage}
            onLegacy={() => setFlow({ legacy: true, step: 1, key: Date.now() })}
            announce={announce}
          />
        )
      ) : (
        <AssistantHome
          data={data}
          status={status}
          onReconnect={() => setFlow({ step: 1, key: Date.now() })}
          onResume={resume}
          onReplaceShared={replaceShared}
          onOpenKanban={onOpenKanban}
          announce={announce}
        />
      )}
    </div>
  )
}
