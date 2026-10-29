// Tela Assistente: status honesto, textos e instruções do GPT (sem chave, versão do aviso igual à do servidor).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityText, currentKey, deriveAssistantStatus, shortcutText, whenText } from '../src/assistantStatus.js'
import { GPT_INSTRUCTIONS, GPT_INSTRUCTIONS_VERSION, CONVERSATION_STARTERS } from '../src/assistant/gptInstructions.js'
import { NOTICE, NOTICE_VERSION } from '../src/assistant/notice.js'
import { NOTICE_VERSION as SERVER_NOTICE_VERSION } from '../api/_lib/assistant.js'

const now = Date.parse('2026-11-10T12:00:00Z')
const key = (over = {}) => ({
  id: 'k1', kind: 'personal', created_at: '2026-11-01T10:00:00Z', expires_at: '2027-11-01T10:00:00Z',
  revoked_at: null, last_used_at: null, ...over,
})

test('status: nunca configurou, desligado, aguardando, ativo e sem uso', () => {
  assert.equal(deriveAssistantStatus([], now).state, 'never')
  assert.equal(deriveAssistantStatus([key({ revoked_at: '2026-11-02T00:00:00Z' })], now).state, 'off')
  assert.equal(deriveAssistantStatus([key({ expires_at: '2026-11-05T00:00:00Z' })], now).state, 'off', 'vencida')
  assert.equal(deriveAssistantStatus([key()], now).state, 'waiting')
  assert.equal(deriveAssistantStatus([key({ last_used_at: '2026-11-09T08:12:00Z' })], now).state, 'active')
  assert.equal(deriveAssistantStatus([key({ last_used_at: '2026-10-05T08:00:00Z', created_at: '2026-10-01T00:00:00Z' })], now).state, 'stale')
})

test('status: "ativa" só com uso da chave ATUAL; a mais recente válida vale', () => {
  const old = key({ id: 'old', created_at: '2026-10-01T00:00:00Z', revoked_at: '2026-11-03T00:00:00Z', last_used_at: '2026-11-02T00:00:00Z' })
  const fresh = key({ id: 'new', created_at: '2026-11-03T00:00:00Z' })
  assert.deepEqual(deriveAssistantStatus([old, fresh], now), { state: 'waiting', key: fresh })
  const a = key({ id: 'a', created_at: '2026-11-01T00:00:00Z' })
  const b = key({ id: 'b', created_at: '2026-11-04T00:00:00Z' })
  assert.equal(currentKey([a, b], now).id, 'b')
  assert.equal(currentKey([key({ kind: 'oauth' })], now), null, 'conexões OAuth (fase B) não entram aqui')
})

test('evidência do selo nunca mostra conteúdo, só a operação e o período', () => {
  assert.equal(activityText({ op: 'verAgenda', from: '2026-11-03', to: '2026-11-09' }), 'consultou sua agenda de 03/11 a 09/11')
  assert.equal(activityText({ op: 'verAgenda', from: '2026-11-03', to: '2026-11-03' }), 'consultou sua agenda de 03/11')
  assert.equal(activityText({ op: 'criarTarefas', count: 1 }), 'criou 1 tarefa')
  assert.equal(activityText({ op: 'outro' }), '')
  assert.equal(activityText(null), '')
})

test('atalho do Painel: um texto curto por estado', () => {
  const ref = new Date(2026, 10, 10, 15, 0)
  assert.equal(shortcutText({ state: 'never' }), 'Monte sua agenda conversando com o ChatGPT')
  assert.equal(shortcutText({ state: 'off' }), 'Desconectado · conecte de novo')
  assert.equal(shortcutText({ state: 'waiting' }), 'Aguardando o primeiro uso')
  assert.equal(shortcutText({ state: 'stale' }), 'Sem uso há 30 dias')
  assert.match(shortcutText({ state: 'active', key: { last_used_at: new Date(2026, 10, 10, 8, 12).toISOString() } }, ref), /^Conectado · última atividade hoje às 08:12$/)
})

test('quando: hoje / ontem / data', () => {
  const ref = new Date(2026, 10, 10, 15, 0)
  assert.match(whenText(new Date(2026, 10, 10, 8, 12).toISOString(), ref), /^hoje às 08:12$/)
  assert.match(whenText(new Date(2026, 10, 9, 17, 40).toISOString(), ref), /^ontem às 17:40$/)
  assert.match(whenText(new Date(2026, 9, 12, 9, 0).toISOString(), ref), /^12\/10 às 09:00$/)
})

test('versão do aviso é a mesma no navegador e no servidor', () => {
  assert.equal(NOTICE_VERSION, SERVER_NOTICE_VERSION)
  assert.equal(NOTICE.summary.length, 4)
  assert.ok(NOTICE.summary.join(' ').includes('OpenAI'))
  assert.ok(NOTICE.summary.join(' ').includes('fora do Brasil'))
})

test('instruções do GPT: dentro do limite, versionadas e sem chave', () => {
  assert.ok(GPT_INSTRUCTIONS_VERSION)
  assert.ok(GPT_INSTRUCTIONS.length <= 8000, String(GPT_INSTRUCTIONS.length))
  assert.ok(!/fbk_[A-Za-z0-9_-]{6,}/.test(GPT_INSTRUCTIONS), 'nenhuma chave real dentro das instruções')
  assert.ok(!/\$\{|\{\{/.test(GPT_INSTRUCTIONS), 'sem placeholders que alguém possa preencher com a chave')
  for (const op of ['verificarConexao', 'verAgenda', 'listarClientes', 'prever', 'criarTarefas', 'listarLotes', 'desfazerLote']) {
    assert.ok(GPT_INSTRUCTIONS.includes(op), op)
  }
  assert.equal(CONVERSATION_STARTERS.length, 4)
})
