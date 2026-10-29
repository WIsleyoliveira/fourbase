import { useEffect, useRef, useState } from 'react'
import { IconCheckPlain, IconClock, IconExternal, IconEye, IconEyeOff } from '../../icons.jsx'
import { GPT_INSTRUCTIONS, GPT_NAME, CONVERSATION_STARTERS } from '../../assistant/gptInstructions.js'
import { whenText } from '../../assistantStatus.js'
import { NOTICE } from '../../assistant/notice.js'
import { useAssistantActions } from '../../hooks/useAssistant.js'
import CopyButton, { copyText } from './CopyButton.jsx'
import NoticeBox from './NoticeBox.jsx'

const GPT_EDITOR_URL = 'https://chatgpt.com/gpts/editor'
const TEST_LIMIT_MS = 3 * 60 * 1000
const STEPS = ['Autorizar e criar sua chave', 'Abrir o ChatGPT', 'Colar o endereço e a chave', 'Ensinar o assistente']
const STEP_KEY = 'fb_asst_step'

const readStep = () => { try { return Number(localStorage.getItem(STEP_KEY)) || 1 } catch { return 1 } }
const saveStep = (n) => { try { localStorage.setItem(STEP_KEY, String(n)) } catch { /* sem armazenamento: tudo bem */ } }
const masked = (token) => `${token.slice(0, 8)}${'•'.repeat(14)}`

// Modo 1 da tela Assistente: conectar o ChatGPT em 4 passos + teste. A chave existe só na memória
// deste componente (nunca em localStorage) e some quando a pessoa confirma que colou.
export default function AssistantOnboarding({ data, status, startStep, initialKey = null, onFinish, onCancel, onTestingChange, onEngage, announce }) {
  const { createKey } = useAssistantActions()
  // sem conexão: sempre do começo; configurando: retoma o passo em que parou
  const [step, setStep] = useState(() => startStep || (status.state === 'never' || status.state === 'off' ? 1 : readStep()))
  const [fresh, setFresh] = useState(initialKey) // { id, token }
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [testStart, setTestStart] = useState(() => Date.now())
  const [, setTick] = useState(0)
  const headingRef = useRef(null)
  const firstRender = useRef(true)

  const noticeAccepted = data.notice?.accepted_version && data.notice.accepted_version === data.notice.current_version
  const currentKey = status.key
  const worked = step === 5 && status.state === 'active'
  const timedOut = step === 5 && !worked && Date.now() - testStart > TEST_LIMIT_MS

  useEffect(() => { saveStep(step) }, [step])
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    headingRef.current?.focus()
  }, [step])
  useEffect(() => { onTestingChange(step === 5 && !worked && !timedOut) }, [step, worked, timedOut, onTestingChange])
  // relógio do teste (só para o "Não funcionou?" aparecer após 3 min)
  useEffect(() => {
    if (step !== 5 || worked) return undefined
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [step, worked])
  useEffect(() => { if (worked) announce('Funcionou! O ChatGPT já está conectado ao seu fourbase.') }, [worked, announce])

  const go = (n) => { setError(''); setStep(n) }

  const create = async () => {
    setError('')
    onEngage?.()
    try {
      const k = await createKey.mutateAsync({ replaces: currentKey?.id })
      setFresh({ id: k.id, token: k.token })
      setReveal(false)
      announce('Chave criada.')
      return true
    } catch (err) {
      setError(/conexões ativas/.test(err.message)
        ? 'Você já tem 5 conexões ativas. Desligue uma que não usa em Conexões e tente de novo.'
        : /gestor/i.test(err.message)
          ? 'Só gestores podem conectar o Assistente. Fale com quem administra o fourbase da sua empresa.'
          : 'Não conseguimos criar a chave agora. Verifique sua internet e tente de novo.')
      return false
    }
  }

  const pasted = async () => {
    await copyText('') // melhor esforço: tira a chave da área de copiar
    setFresh(null)
    announce('Chave apagada desta tela.')
    go(4)
  }

  const redoKey = async () => {
    if (await create()) go(3)
  }

  const heading = (text) => <h3 ref={headingRef} tabIndex={-1} className="asst-step-title">{text}</h3>

  return (
    <div className="asst-onboarding">
      <section className="panel asst-intro">
        <h2>Monte sua agenda conversando com o ChatGPT</h2>
        <p>Você conta o que precisa fazer — por texto, voz ou colando um e-mail — e o ChatGPT organiza as tarefas. Antes de criar qualquer coisa, ele mostra a lista e espera o seu OK.</p>
        <ol className="asst-how">
          <li><strong>Você pede</strong><span>"Coloca reunião com a Padaria Sol na quinta às 10h."</span></li>
          <li><strong>Ele mostra a lista</strong><span>e pergunta se está tudo certo.</span></li>
          <li><strong>Você confirma</strong><span>as tarefas aparecem no seu Kanban e Calendário com a etiqueta ChatGPT.</span></li>
        </ol>
        <div className="asst-before">
          <strong>Antes de começar</strong>
          <ul>
            <li>Você precisa do <strong>ChatGPT pago</strong> (Plus, Pro, Team ou Enterprise). <details className="asst-inline-details"><summary>Não tenho o ChatGPT pago</summary>Sem o plano pago, o ChatGPT não consegue se conectar a outros sistemas. Você continua usando o fourbase normalmente e pode voltar aqui quando quiser.</details></li>
            <li>Leva uns 5 minutos. Faça pelo <strong>computador</strong> e deixe esta tela aberta ao lado do ChatGPT.</li>
          </ul>
          <p className="asst-mobile-hint">Criar o assistente funciona melhor no computador. Depois de pronto, você usa no app do ChatGPT no celular normalmente.</p>
        </div>
        {status.state === 'off' && <p className="asst-callout">Seu ChatGPT está desconectado. Siga os passos para conectar de novo.</p>}
      </section>

      <section className="panel asst-stepper-panel" aria-labelledby="asst-progress">
        <div className="asst-progress-row">
          <p id="asst-progress" className="asst-progress">{step <= 4 ? `Passo ${step} de 4` : 'Teste final'}</p>
          {/* já existe conexão funcionando: dá para sair sem criar nada */}
          {onCancel && !fresh && status.state !== 'never' && status.state !== 'off' && (
            <button type="button" className="asst-link" onClick={onCancel}>Cancelar e voltar ao Assistente</button>
          )}
        </div>
        <ol className="asst-steps">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step > i + 1 ? 'done' : step === i + 1 ? 'current' : ''}>
              <span className="asst-step-num" aria-hidden="true">{step > i + 1 ? <IconCheckPlain size={13} /> : i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="asst-step-body">
          {step === 1 && (
            <>
              {heading("Passo 1 — Autorizar e criar sua chave de conexão")}
              <NoticeBox collapsed={noticeAccepted} acceptedAt={noticeAccepted ? data.notice.accepted_at : null} />
              {!fresh ? (
                <>
                  {!noticeAccepted && <p className="asst-consent">{NOTICE.consent}</p>}
                  {currentKey && <p className="asst-muted">Criar uma chave nova desliga a anterior automaticamente.</p>}
                  <button type="button" className="asst-btn" disabled={createKey.isPending} onClick={create}>
                    {createKey.isPending ? 'Criando sua chave…' : noticeAccepted ? 'Criar minha chave' : 'Autorizo e criar minha chave'}
                  </button>
                </>
              ) : (
                <div className="asst-key">
                  <strong>Sua chave de conexão</strong>
                  <p className="asst-muted">A chave é como uma senha que só serve para o ChatGPT falar com o seu fourbase.</p>
                  <div className="asst-key-row">
                    <code aria-label="Chave de conexão">{reveal ? fresh.token : masked(fresh.token)}</code>
                    <button type="button" className="asst-btn ghost" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
                      {reveal ? <IconEyeOff size={15} /> : <IconEye size={15} />} {reveal ? 'Esconder' : 'Mostrar'}
                    </button>
                    <CopyButton text={fresh.token} label="Copiar chave" copiedLabel="Chave copiada" onCopied={announce} />
                  </div>
                  <p className="asst-muted">Guarde só até terminar. Se perder, é só criar outra.</p>
                  <button type="button" className="asst-btn" onClick={() => go(2)}>Continuar</button>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {heading("Passo 2 — Abrir o criador de assistente no ChatGPT")}
              <p>Vamos criar o <strong>seu</strong> assistente fourbase dentro do ChatGPT. Ele é só seu.</p>
              <a className="asst-btn" href={GPT_EDITOR_URL} target="_blank" rel="noopener noreferrer">Abrir o ChatGPT <IconExternal size={15} /></a>
              <p>Lá, clique na aba <strong>Configurar</strong> (no topo). Role até o fim e clique em <strong>Criar nova ação</strong>.</p>
              <p className="asst-muted">Os nomes em negrito são os botões que aparecem no ChatGPT. O fourbase nunca vai pedir esta chave numa conversa, por e-mail ou WhatsApp.</p>
              <button type="button" className="asst-link" aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>Não encontrei</button>
              {helpOpen && <p className="asst-callout">Confira se você entrou com a conta paga. O botão <strong>Configurar</strong> fica ao lado de <strong>Criar</strong>, no topo. Se a tela estiver em inglês, procure <strong>Configure</strong> e <strong>Create new action</strong>.</p>}
              <div className="asst-actions">
                <button type="button" className="asst-btn ghost" onClick={() => go(1)}>Voltar</button>
                <button type="button" className="asst-btn" onClick={() => go(3)}>Já encontrei "Criar nova ação"</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {heading("Passo 3 — Colar o endereço e a chave")}
              <div className="asst-substep">
                <p><strong>a)</strong> Clique em <strong>Importar de URL</strong> e cole o endereço do fourbase:</p>
                {data.openapi_url ? (
                  <div className="asst-key-row">
                    <code>{data.openapi_url}</code>
                    <CopyButton text={data.openapi_url} label="Copiar endereço" copiedLabel="Endereço copiado" onCopied={announce} />
                  </div>
                ) : (
                  <p className="asst-callout">O endereço do fourbase não está configurado. Fale com o suporte do fourbase.</p>
                )}
              </div>
              <div className="asst-substep">
                <p><strong>b)</strong> Em <strong>Autenticação</strong>, escolha <strong>Chave de API</strong>, depois <strong>Bearer</strong>, e cole a sua chave. Clique em <strong>Salvar</strong>.</p>
                {fresh ? (
                  <>
                    <div className="asst-key-row">
                      <code>{masked(fresh.token)}</code>
                      <CopyButton text={fresh.token} label="Copiar chave" copiedLabel="Chave copiada" onCopied={announce} />
                    </div>
                    <p className="asst-warning"><strong>Cole só no campo Chave de API</strong> do assistente que você acabou de criar. Não cole nas Instruções nem na conversa.</p>
                    <p className="asst-muted">Essas palavras aparecem em termos técnicos no ChatGPT; é só escolher exatamente essas opções. Se você usa o histórico da área de copiar (Windows + V), apague a chave de lá também.</p>
                    <button type="button" className="asst-btn" onClick={pasted}>Já colei a chave</button>
                    <p className="asst-muted">Ao clicar, o fourbase apaga a chave da sua área de copiar e desta tela.</p>
                  </>
                ) : (
                  <div className="asst-callout">
                    <p>Sua chave não aparece mais, por segurança. Você já colou no ChatGPT?</p>
                    <div className="asst-actions">
                      <button type="button" className="asst-btn" onClick={() => go(4)}>Sim, continuar</button>
                      <button type="button" className="asst-btn ghost" disabled={createKey.isPending} onClick={redoKey}>Não, criar outra chave</button>
                    </div>
                    <p className="asst-muted">Criar outra desliga a anterior automaticamente.</p>
                  </div>
                )}
              </div>
              <div className="asst-actions">
                <button type="button" className="asst-btn ghost" onClick={() => go(2)}>Voltar</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              {heading("Passo 4 — Ensinar o assistente e deixar só para você")}
              <div className="asst-substep">
                <p><strong>a)</strong> Volte para o topo da aba <strong>Configurar</strong> e cole este texto no campo <strong>Instruções</strong>.</p>
                <CopyButton primary text={GPT_INSTRUCTIONS} label="Copiar instruções" copiedLabel="Instruções copiadas" onCopied={announce} />
              </div>
              <div className="asst-substep">
                <p><strong>b)</strong> No campo <strong>Nome</strong>, escreva <strong>{GPT_NAME}</strong>. Em <strong>Iniciadores de conversa</strong>, se quiser, cole estas sugestões:</p>
                <ul className="asst-chips">
                  {CONVERSATION_STARTERS.map((s) => <li key={s}><span>{s}</span><CopyButton text={s} label="Copiar" onCopied={announce} /></li>)}
                </ul>
              </div>
              <div className="asst-substep">
                <p><strong>c)</strong> Clique em <strong>Criar</strong> (ou <strong>Atualizar</strong>). Quando o ChatGPT perguntar com quem compartilhar, escolha <strong>Somente eu</strong>.</p>
                <p className="asst-warning">Se escolher "Qualquer pessoa com o link", quem tiver o link vê sua agenda e cria tarefas como se fosse você.</p>
              </div>
              <div className="asst-actions">
                <button type="button" className="asst-btn ghost" onClick={() => go(3)}>Voltar</button>
                <button type="button" className="asst-btn" onClick={() => { setTestStart(Date.now()); go(5) }}>Está como Somente eu — ir para o teste</button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              {heading("Teste final")}
              <p>No seu assistente fourbase, escreva: <strong>o que tenho amanhã?</strong></p>
              <p className="asst-muted">Se o ChatGPT pedir permissão para falar com o fourbase, clique em <strong>Permitir</strong>.</p>
              <div className={`asst-test ${worked ? 'ok' : timedOut ? 'late' : 'wait'}`} role="status" aria-live="polite">
                {worked ? (
                  <>
                    <IconCheckPlain size={20} />
                    <div>
                      <strong>Funcionou!</strong> Sua chave foi usada {whenText(status.key.last_used_at)}. A partir de agora é só conversar.
                    </div>
                  </>
                ) : timedOut ? (
                  <>
                    <IconClock size={20} />
                    <div><strong>Ainda não recebemos nada do ChatGPT.</strong></div>
                  </>
                ) : (
                  <>
                    <IconClock size={20} />
                    <div><strong>Aguardando o ChatGPT…</strong> Assim que ele consultar sua agenda, esta tela muda sozinha.</div>
                  </>
                )}
              </div>
              {worked && <button type="button" className="asst-btn" onClick={onFinish}>Ir para o meu Assistente</button>}
              {timedOut && (
                <div className="asst-trouble">
                  <h4>Não funcionou?</h4>
                  <ol>
                    <li><strong>A chave está no lugar certo?</strong> Em <strong>Autenticação</strong> deve estar <strong>Chave de API</strong> + <strong>Bearer</strong>, com a chave colada.</li>
                    <li><strong>Você clicou em Permitir?</strong> O ChatGPT pergunta antes de falar com o fourbase pela primeira vez.</li>
                    <li><strong>O endereço foi importado?</strong> Copie de novo no Passo 3 e use <strong>Importar de URL</strong>.</li>
                  </ol>
                  <div className="asst-actions">
                    <button type="button" className="asst-btn" onClick={() => setTestStart(Date.now())}>Verificar de novo</button>
                    <button type="button" className="asst-btn ghost" disabled={createKey.isPending} onClick={redoKey}>Criar outra chave e refazer o Passo 3</button>
                  </div>
                </div>
              )}
              {!worked && (
                <div className="asst-actions">
                  <button type="button" className="asst-btn ghost" onClick={() => go(4)}>Voltar</button>
                </div>
              )}
            </>
          )}

          {error && <p className="asst-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}
