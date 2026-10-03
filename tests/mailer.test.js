import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendMail, buildNotificationEmail, runInBackground } from '../api/_lib/mailer.js'

const msg = { to: 'ana@exemplo.com', subject: 'Assunto', text: 'Corpo do e-mail' }

// Log falso que guarda o que foi registrado (nada vai ao console nos testes)
const fakeLog = () => {
  const calls = { info: [], warn: [], error: [] }
  return {
    calls,
    info: (...a) => calls.info.push(a),
    warn: (...a) => calls.warn.push(a),
    error: (...a) => calls.error.push(a),
    log: (...a) => calls.info.push(a),
  }
}

test('sendMail: POST em api.resend.com/emails com Bearer, from, to, subject e text', async () => {
  const chamadas = []
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init })
    return { ok: true, status: 200 }
  }
  const env = { RESEND_API_KEY: 're_chave', EMAIL_FROM: 'FourBase <no-reply@fourbase.com>' }
  const ok = await sendMail(msg, { fetchImpl, env, log: fakeLog() })

  assert.equal(ok, true)
  assert.equal(chamadas.length, 1)
  const { url, init } = chamadas[0]
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, 'Bearer re_chave')
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(init.body), {
    from: 'FourBase <no-reply@fourbase.com>',
    to: ['ana@exemplo.com'],
    subject: 'Assunto',
    text: 'Corpo do e-mail',
  })
  assert.ok(init.signal instanceof AbortSignal, 'passa o signal do timeout ao fetch')
})

test('sem RESEND_API_KEY: não chama fetch, registra no log, devolve false', async () => {
  let chamou = false
  const fetchImpl = async () => {
    chamou = true
    return { ok: true }
  }
  const log = fakeLog()
  const ok = await sendMail(
    { to: 'ana@exemplo.com', subject: 'Maria mencionou você', text: 'Veja: http://app/painel?tarefa=t1' },
    { fetchImpl, env: {}, log },
  )

  assert.equal(ok, false)
  assert.equal(chamou, false)
  const registrado = JSON.stringify(log.calls.info)
  assert.ok(registrado.includes('ana@exemplo.com'), 'log traz o destinatário')
  assert.ok(registrado.includes('Maria mencionou você'), 'log traz o assunto')
  assert.ok(registrado.includes('http://app/painel?tarefa=t1'), 'log traz o link do corpo')
})

test('com chave mas sem EMAIL_FROM: avisa no log, não chama fetch, devolve false', async () => {
  let chamou = false
  const log = fakeLog()
  const ok = await sendMail(msg, {
    fetchImpl: async () => {
      chamou = true
      return { ok: true }
    },
    env: { RESEND_API_KEY: 're_chave' },
    log,
  })

  assert.equal(ok, false)
  assert.equal(chamou, false)
  assert.equal(log.calls.warn.length, 1)
  assert.ok(!JSON.stringify(log.calls).includes('re_chave'), 'nunca registra a chave')
})

test('resposta não-ok ou fetch que lança: devolve false e não lança', async () => {
  const env = { RESEND_API_KEY: 're_chave', EMAIL_FROM: 'a@b.com' }

  const naoOk = await sendMail(msg, {
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }),
    env,
    log: fakeLog(),
  })
  assert.equal(naoOk, false)

  const lancou = await sendMail(msg, {
    fetchImpl: async () => {
      throw new Error('rede caiu')
    },
    env,
    log: fakeLog(),
  })
  assert.equal(lancou, false)

  const log = fakeLog()
  await sendMail(msg, {
    fetchImpl: async () => {
      throw new Error('rede caiu')
    },
    env,
    log,
  })
  assert.ok(!JSON.stringify(log.calls).includes('re_chave'), 'nunca registra a chave')
})

test('timeout de 4 s aborta: padrão de 4000 ms e abort real com relógio curto', async () => {
  const env = { RESEND_API_KEY: 're_chave', EMAIL_FROM: 'a@b.com' }

  // fetch falso que só termina quando o signal aborta
  const penduradoAteAbortar = (init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('abortado')))
    })

  // Relógio curto injetável: aborta de verdade
  const inicio = Date.now()
  const ok = await sendMail(msg, {
    fetchImpl: async (_url, init) => penduradoAteAbortar(init),
    env,
    log: fakeLog(),
    timeoutMs: 30,
  })
  assert.equal(ok, false)
  assert.ok(Date.now() - inicio < 2000, 'não espera os 4 s inteiros com timeoutMs curto')

  // Padrão: o timer é de 4000 ms (intercepta setTimeout para não esperar de verdade)
  const original = globalThis.setTimeout
  const esperas = []
  globalThis.setTimeout = (fn, ms, ...resto) => {
    esperas.push(ms)
    return original(fn, 0, ...resto) // dispara na hora
  }
  try {
    const ok2 = await sendMail(msg, {
      fetchImpl: async (_url, init) => penduradoAteAbortar(init),
      env,
      log: fakeLog(),
    })
    assert.equal(ok2, false)
  } finally {
    globalThis.setTimeout = original
  }
  assert.ok(esperas.includes(4000), 'timeout padrão é 4000 ms')
})

test('buildNotificationEmail: assunto "Maria mencionou você em “Título”" e "Maria atribuiu a você “Título”"', () => {
  const base = { actorName: 'Maria', title: 'Título', taskId: 't1', appUrl: 'https://app.exemplo.com' }
  assert.equal(
    buildNotificationEmail({ ...base, kind: 'mention' }).subject,
    'Maria mencionou você em “Título”',
  )
  assert.equal(
    buildNotificationEmail({ ...base, kind: 'assignment' }).subject,
    'Maria atribuiu a você “Título”',
  )
})

test('título com quebra de linha vira uma linha no assunto; HTML permanece texto literal', () => {
  const base = { kind: 'mention', actorName: 'Maria', taskId: 't1', appUrl: 'https://app.exemplo.com' }

  const quebrado = buildNotificationEmail({ ...base, title: '  Revisar\r\n\tcontrato \n final  ' })
  assert.equal(quebrado.subject, 'Maria mencionou você em “Revisar contrato final”')
  assert.ok(!/[\r\n]/.test(quebrado.subject))
  assert.ok(quebrado.text.includes('“Revisar contrato final”'))

  const html = buildNotificationEmail({ ...base, title: '<b>Oi</b> <script>x()</script>' })
  assert.equal(html.subject, 'Maria mencionou você em “<b>Oi</b> <script>x()</script>”')
  assert.ok(html.text.includes('<b>Oi</b> <script>x()</script>'), 'sem escape nem remoção de HTML')
})

test('link do corpo é APP_URL/painel?tarefa=<id>', () => {
  const r = buildNotificationEmail({
    kind: 'assignment',
    actorName: 'Maria',
    title: 'Título',
    taskId: 'abc-123',
    appUrl: 'https://app.exemplo.com',
  })
  assert.ok(r.text.includes('https://app.exemplo.com/painel?tarefa=abc-123'))

  // barra final em APP_URL não duplica
  const barra = buildNotificationEmail({
    kind: 'assignment',
    actorName: 'Maria',
    title: 'Título',
    taskId: 'abc-123',
    appUrl: 'https://app.exemplo.com/',
  })
  assert.ok(barra.text.includes('https://app.exemplo.com/painel?tarefa=abc-123'))
  assert.ok(!barra.text.includes('com//painel'))
})

test('runInBackground: fora da Vercel não lança, executa a promessa e engole rejeição', async () => {
  let executou = false
  const p = Promise.resolve().then(() => {
    executou = true
  })
  assert.doesNotThrow(() => runInBackground(p))
  await p
  assert.equal(executou, true)

  // rejeição não pode virar unhandledRejection nem lançar
  const nao = []
  const handler = (e) => nao.push(e)
  const errOriginal = console.error
  const erros = []
  console.error = (...a) => erros.push(a)
  process.on('unhandledRejection', handler)
  try {
    assert.doesNotThrow(() => runInBackground(Promise.reject(new Error('falhou'))))
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
  } finally {
    process.off('unhandledRejection', handler)
    console.error = errOriginal
  }
  assert.deepEqual(nao, [])
  assert.equal(erros.length, 1, 'rejeição é registrada no log')

  // entrada que não é promessa também não lança
  assert.doesNotThrow(() => runInBackground(undefined))
})
