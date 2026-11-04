import { useEffect, useRef, useState } from 'react'
import { IconCheckPlain, IconClock, IconExternal } from '../../icons.jsx'
import { whenText } from '../../assistantStatus.js'
import AssistantIntro from './AssistantIntro.jsx'
import CopyButton from './CopyButton.jsx'
import NoticeBox from './NoticeBox.jsx'

const CHATGPT_URL = 'https://chatgpt.com/'
const STEPS = ['Antes de começar', 'Ligar o modo desenvolvedor', 'Criar o app fourbase', 'Conectar']
const STEP_KEY = 'fb_asst_app_step'
const TEST_LIMIT_MS = 5 * 60 * 1000

const readStep = () => { try { return Math.min(4, Math.max(1, Number(localStorage.getItem(STEP_KEY)) || 1)) } catch { return 1 } }
const saveStep = (n) => { try { localStorage.setItem(STEP_KEY, String(n)) } catch { /* sem armazenamento: tudo bem */ } }

// Modo 1 da tela Assistente (caminho do app/MCP): 4 passos. Não há chave para copiar: quem autoriza é o
// próprio gestor, na página /conectar que o ChatGPT abre. O teste é a tela mudar sozinha para "Funcionou!".
export default function AppOnboarding({ data, status, startStep, onFinish, onCancel, onTestingChange, onEngage, onLegacy, announce }) {
  const [step, setStep] = useState(() => Math.min(4, startStep || (status.state === 'never' || status.state === 'off' ? 1 : readStep())))
  const [started, setStarted] = useState(() => Date.now())
  const [, setTick] = useState(0)
  const headingRef = useRef(null)
  const firstRender = useRef(true)

  const worked = step === 4 && status.state === 'active' && status.key?.kind === 'oauth'
  const timedOut = step === 4 && !worked && Date.now() - started > TEST_LIMIT_MS

  useEffect(() => { saveStep(step) }, [step])
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    headingRef.current?.focus()
  }, [step])
  useEffect(() => { onTestingChange(step === 4 && !worked && !timedOut) }, [step, worked, timedOut, onTestingChange])
  useEffect(() => {
    if (step !== 4 || worked) return undefined
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [step, worked])
  useEffect(() => { if (worked) announce('Funcionou! O ChatGPT já está conectado ao seu fourbase.') }, [worked, announce])

  const go = (n) => {
    if (n === 4) onEngage?.()
    setStep(n)
  }
  const heading = (text) => <h3 ref={headingRef} tabIndex={-1} className="asst-step-title">{text}</h3>
  const mcpUrl = data.mcp_url

  return (
    <div className="asst-onboarding">
      <AssistantIntro status={status} />

      <section className="panel asst-stepper-panel" aria-labelledby="asst-progress">
        <div className="asst-progress-row">
          <p id="asst-progress" className="asst-progress">Passo {step} de 4</p>
          {onCancel && status.state !== 'never' && status.state !== 'off' && (
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
              {heading('Passo 1 — Antes de começar')}
              <NoticeBox />
              <p className="asst-muted">Você só autoriza de verdade no último passo, quando o ChatGPT abrir uma página do fourbase pedindo a sua confirmação. Nada é enviado antes disso.</p>
              <button type="button" className="asst-btn" onClick={() => go(2)}>Entendi, continuar</button>
              {onLegacy && (
                <p className="asst-muted">
                  Prefere usar um GPT personalizado com chave?{' '}
                  <button type="button" className="asst-link" onClick={onLegacy}>Ver o modo antigo</button>{' '}
                  (a OpenAI vai descontinuar os GPTs personalizados).
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {heading('Passo 2 — Ligar o modo desenvolvedor no ChatGPT')}
              <p>O fourbase se conecta ao ChatGPT como um <strong>app</strong>. Para criar um app seu, o ChatGPT pede que você ligue o <strong>modo desenvolvedor</strong> uma vez.</p>
              <a className="asst-btn" href={CHATGPT_URL} target="_blank" rel="noopener noreferrer">Abrir o ChatGPT <IconExternal size={15} /></a>
              <ol className="asst-trouble">
                <li>No ChatGPT, abra <strong>Configurações</strong> (seu nome, no canto de baixo à esquerda).</li>
                <li>Vá em <strong>Apps</strong> (em algumas contas aparece como <strong>Conectores</strong>).</li>
                <li>Role até <strong>Avançado</strong> e ligue o <strong>Modo desenvolvedor</strong>.</li>
              </ol>
              <p className="asst-muted">Os nomes podem variar um pouco conforme a versão do ChatGPT. Se você não encontrar o <strong>Modo desenvolvedor</strong>, o plano da sua conta provavelmente não permite criar apps. Fale com o suporte do fourbase.</p>
              <div className="asst-actions">
                <button type="button" className="asst-btn ghost" onClick={() => go(1)}>Voltar</button>
                <button type="button" className="asst-btn" onClick={() => go(3)}>Já liguei o modo desenvolvedor</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {heading('Passo 3 — Criar o app fourbase')}
              <ol className="asst-trouble">
                <li>Ainda em <strong>Apps</strong>, clique em <strong>Criar</strong> (ou <strong>Criar app</strong>).</li>
                <li>Em <strong>Nome</strong>, escreva <strong>fourbase</strong>.</li>
                <li>Em <strong>URL do servidor MCP</strong>, cole o endereço abaixo.</li>
                <li>Em <strong>Autenticação</strong>, escolha <strong>OAuth</strong>. Deixe o resto como está.</li>
                <li>Marque a caixa de confiança do app e clique em <strong>Criar</strong>.</li>
              </ol>
              {mcpUrl ? (
                <div className="asst-key-row">
                  <code>{mcpUrl}</code>
                  <CopyButton text={mcpUrl} label="Copiar endereço" copiedLabel="Endereço copiado" onCopied={announce} primary />
                </div>
              ) : (
                <p className="asst-callout">O endereço do fourbase não está configurado. Fale com o suporte do fourbase.</p>
              )}
              <p className="asst-muted">Não existe chave para copiar: o ChatGPT vai pedir a sua autorização no próximo passo.</p>
              <div className="asst-actions">
                <button type="button" className="asst-btn ghost" onClick={() => go(2)}>Voltar</button>
                <button type="button" className="asst-btn" onClick={() => { setStarted(Date.now()); go(4) }}>Já criei o app</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              {heading('Passo 4 — Conectar')}
              <ol className="asst-trouble">
                <li>No ChatGPT, abra o app <strong>fourbase</strong> que você criou e clique em <strong>Conectar</strong>.</li>
                <li>O ChatGPT abre uma página do fourbase. Leia e clique em <strong>Autorizo e conectar</strong>.</li>
                <li>Volte ao ChatGPT. Esta tela muda sozinha quando a conexão funcionar.</li>
              </ol>
              <div className={`asst-test ${worked ? 'ok' : timedOut ? 'late' : 'wait'}`} role="status" aria-live="polite">
                {worked ? (
                  <>
                    <IconCheckPlain size={20} />
                    <div><strong>Funcionou!</strong> O ChatGPT se conectou {whenText(status.key.last_used_at)}. A partir de agora é só conversar.</div>
                  </>
                ) : timedOut ? (
                  <>
                    <IconClock size={20} />
                    <div><strong>Ainda não recebemos nada do ChatGPT.</strong></div>
                  </>
                ) : (
                  <>
                    <IconClock size={20} />
                    <div><strong>Aguardando o ChatGPT…</strong> Assim que ele se conectar, esta tela muda sozinha.</div>
                  </>
                )}
              </div>
              {worked && (
                <>
                  <p>Para testar, abra uma conversa no ChatGPT, escolha o app <strong>fourbase</strong> (botão <strong>+</strong> ou <strong>@fourbase</strong>) e escreva: <strong>o que tenho amanhã?</strong> Se ele pedir permissão, clique em <strong>Permitir</strong>.</p>
                  <button type="button" className="asst-btn" onClick={onFinish}>Ir para o meu Assistente</button>
                </>
              )}
              {timedOut && (
                <div className="asst-trouble">
                  <h4>Não funcionou?</h4>
                  <ol>
                    <li><strong>Você clicou em Conectar?</strong> O app só se conecta depois que você autoriza na página do fourbase.</li>
                    <li><strong>A autenticação é OAuth?</strong> No app, confira que está em <strong>OAuth</strong>, e não em "Sem autenticação".</li>
                    <li><strong>O endereço está certo?</strong> Ele precisa ser exatamente o do passo 3, terminando em <code>/api/mcp</code>.</li>
                    <li><strong>A página do fourbase pediu login?</strong> Entre com a mesma conta de gestor e tente conectar de novo.</li>
                  </ol>
                  <div className="asst-actions">
                    <button type="button" className="asst-btn" onClick={() => setStarted(Date.now())}>Verificar de novo</button>
                    <button type="button" className="asst-btn ghost" onClick={() => go(3)}>Rever o passo 3</button>
                  </div>
                </div>
              )}
              {!worked && (
                <div className="asst-actions">
                  <button type="button" className="asst-btn ghost" onClick={() => go(3)}>Voltar</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
