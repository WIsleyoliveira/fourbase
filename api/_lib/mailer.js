import { waitUntil } from '@vercel/functions'

// E-mail via Resend (fetch puro, sem SDK). Nada aqui lança exceção: quem chama
// só precisa saber se foi enviado (true) ou não (false).

const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 4000

// Colapsa qualquer espaço/quebra de linha em um espaço só e apara as pontas.
// Evita quebra de linha no assunto (injeção de cabeçalho) e texto torto no corpo.
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

// Envia um e-mail de texto simples. `deps` existe para os testes injetarem
// fetch/env/log (e um timeout curto) sem rede.
export async function sendMail({ to, subject, text }, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const env = deps.env ?? process.env
  const log = deps.log ?? console
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS

  try {
    const apiKey = env.RESEND_API_KEY
    if (!apiKey) {
      // Desenvolvimento/testes: mostra o que seria enviado (sem chave, sem rede)
      log.info(`[mailer] RESEND_API_KEY ausente, e-mail não enviado. Para: ${to} | Assunto: ${subject}\n${text}`)
      return false
    }

    const from = env.EMAIL_FROM
    if (!from) {
      log.warn('[mailer] EMAIL_FROM ausente: e-mail não enviado')
      return false
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: controller.signal,
      })
      if (!res.ok) {
        log.error(`[mailer] Resend respondeu ${res.status}`)
        return false
      }
      return true
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    log.error('[mailer] falha ao enviar e-mail:', err?.message || err)
    return false
  }
}

// Assunto e corpo (texto simples, em português) do e-mail de menção/atribuição.
// O título é tratado como texto: nada de HTML, só aspas tipográficas ao redor.
export function buildNotificationEmail({ kind, actorName, title, taskId, appUrl }) {
  const nome = oneLine(actorName) || 'Alguém'
  const titulo = `“${oneLine(title)}”`
  const link = `${String(appUrl ?? '').replace(/\/+$/, '')}/painel?tarefa=${taskId}`

  const frase =
    kind === 'mention'
      ? `${nome} mencionou você em ${titulo}`
      : `${nome} atribuiu a você ${titulo}`

  return {
    subject: frase,
    text: `${frase}.\n\nAbra a tarefa: ${link}\n`,
  }
}

// Deixa o envio terminar depois da resposta da API (waitUntil na Vercel); fora
// da Vercel o waitUntil não faz nada e a promessa roda normalmente. Rejeições
// são engolidas: o envio nunca pode derrubar a requisição.
export function runInBackground(promise) {
  try {
    const segura = Promise.resolve(promise).catch((err) => {
      console.error('[mailer] tarefa em segundo plano falhou:', err?.message || err)
    })
    waitUntil(segura)
  } catch (err) {
    console.error('[mailer] runInBackground:', err?.message || err)
  }
}
