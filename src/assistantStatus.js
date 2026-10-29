// Estado da conexão do Assistente, calculado no navegador a partir das chaves (GET /api/assistant/tokens).
// Regra do Conselho: nunca dizer que funciona sem prova — "ativa" exige uma chamada real do ChatGPT
// depois que a chave atual foi criada. Funções puras, testadas em tests/assistant-front.test.js.

const DAY = 86400000
export const STALE_DAYS = 30

const live = (t, now) => !t.revoked_at && Date.parse(t.expires_at) > now

// A conexão "atual" é a chave pessoal válida mais recente.
export function currentKey(tokens = [], now = Date.now()) {
  return tokens
    .filter((t) => (t.kind || 'personal') === 'personal' && live(t, now))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null
}

// 'never'   — nunca configurou (Modo 1)
// 'off'     — já teve chave, agora desligada ou vencida (Modo 1, com aviso)
// 'waiting' — chave criada, o ChatGPT ainda não usou
// 'active'  — o ChatGPT usou a chave atual
// 'stale'   — sem uso há 30 dias ou mais
export function deriveAssistantStatus(tokens = [], now = Date.now()) {
  const key = currentKey(tokens, now)
  if (!key) return { state: tokens.length ? 'off' : 'never', key: null }
  const used = key.last_used_at && Date.parse(key.last_used_at) >= Date.parse(key.created_at)
  if (!used) return { state: 'waiting', key }
  if (now - Date.parse(key.last_used_at) >= STALE_DAYS * DAY) return { state: 'stale', key }
  return { state: 'active', key }
}

// "hoje às 08:12" / "ontem às 17:40" / "12/10 às 09:00"
export function whenText(iso, now = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(now) - startOf(d)) / DAY)
  if (diff === 0) return `hoje às ${time}`
  if (diff === 1) return `ontem às ${time}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`
}

const ACTIVITY = {
  verificarConexao: 'conferiu a conexão',
  verAgenda: 'consultou sua agenda',
  listarClientes: 'consultou a lista de clientes',
  prever: 'conferiu uma lista de tarefas',
  criarTarefas: 'criou tarefas',
  listarLotes: 'consultou o histórico',
  desfazerLote: 'desfez um pedido',
}
const shortDate = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

// Frase de evidência para o selo: "consultou sua agenda de 03/11 a 09/11"
export function activityText(a) {
  if (!a || !ACTIVITY[a.op]) return ''
  if (a.op === 'verAgenda' && a.from && a.to) {
    return a.from === a.to ? `consultou sua agenda de ${shortDate(a.from)}` : `consultou sua agenda de ${shortDate(a.from)} a ${shortDate(a.to)}`
  }
  if (a.op === 'criarTarefas' && a.count) return `criou ${a.count} ${a.count === 1 ? 'tarefa' : 'tarefas'}`
  return ACTIVITY[a.op]
}
