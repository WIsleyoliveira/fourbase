import { supabase } from './supabase.js'
import { diffTaskNotifications, dueNotifications } from './notificationRules.js'
import { sendMail, buildNotificationEmail, runInBackground } from './mailer.js'

// Serviço de notificações de tarefa (menção/atribuição): grava o aviso do sino
// por destinatário e dispara o e-mail em segundo plano. Nada aqui lança: um erro
// de aviso nunca pode derrubar a criação/edição da tarefa.

// Janela em que um mesmo evento (pessoa + tarefa + tipo) não reenvia e-mail
const EMAIL_THROTTLE_MS = 10 * 60 * 1000

const DEFAULT_DEPS = {
  sendMail,
  runInBackground,
  now: () => new Date(),
}
let moduleDeps = { ...DEFAULT_DEPS }

// Só para testes: troca sendMail/runInBackground/now. Sem argumento, restaura.
export const setNotificationDeps = (deps = {}) => {
  moduleDeps = { ...DEFAULT_DEPS, ...deps }
}
export const resetNotificationDeps = () => setNotificationDeps()

// `actor`: { id, name, workspace_id }. O link do e-mail usa SOMENTE APP_URL:
// Origin/Host da requisição são controlados por quem chama e permitiriam que um
// membro fizesse a plataforma enviar links para um domínio qualquer (phishing).
export async function emitTaskNotifications(before, after, actor, deps = {}) {
  try {
    const d = { ...moduleDeps, ...deps }
    const workspaceId = actor.workspace_id

    // Quem é membro ativo do workspace (e e-mail/preferência, lidos só no servidor)
    const { data: members, error: membersError } = await supabase
      .from('fourbase_users')
      .select('id, email, notify_email, status')
      .eq('workspace_id', workspaceId)
    if (membersError) throw membersError
    const byId = new Map((members || []).map((m) => [m.id, m]))
    const activeIds = new Set((members || []).filter((m) => m.status !== 'inactive').map((m) => m.id))

    const items = diffTaskNotifications(before, after, actor.id, activeIds)
    if (items.length === 0) return

    const appUrl = process.env.APP_URL
    if (!appUrl) {
      console.warn('[notifications] APP_URL não definido: e-mails de aviso não serão enviados')
    }

    const now = d.now()
    for (const item of items) {
      try {
        // Consulta o limite ANTES de inserir o aviso novo
        const { data: previous, error: prevError } = await supabase
          .from('fourbase_notifications')
          .select('created_at')
          .eq('user_id', item.user_id)
          .eq('task_id', after.id)
          .eq('kind', item.kind)
        if (prevError) throw prevError
        const throttled = (previous || []).some((n) => {
          const age = now.getTime() - new Date(n.created_at).getTime()
          return age < EMAIL_THROTTLE_MS
        })

        const { error: insertError } = await supabase
          .from('fourbase_notifications')
          .insert({
            workspace_id: workspaceId,
            user_id: item.user_id,
            kind: item.kind,
            task_id: after.id,
            actor_id: actor.id,
            title: after.title,
            created_at: now.toISOString(),
          })
        if (insertError) throw insertError

        const recipient = byId.get(item.user_id)
        if (throttled || !appUrl) continue
        // notify_email ausente (usuário anterior à migration) conta como ligado
        if (!recipient?.email || recipient.notify_email === false) continue

        const message = {
          to: recipient.email,
          ...buildNotificationEmail({
            kind: item.kind,
            actorName: actor.name,
            title: after.title,
            taskId: after.id,
            appUrl,
          }),
        }
        // Promise.resolve().then captura até um sendMail que lança de forma síncrona
        d.runInBackground(
          Promise.resolve()
            .then(() => d.sendMail(message))
            .catch((err) => console.error('[notifications] falha ao enviar e-mail:', err?.message || err)),
        )
      } catch (err) {
        console.error('[notifications] falha ao notificar um destinatário:', err?.message || err)
      }
    }
  } catch (err) {
    console.error('[notifications] falha ao gerar notificações:', err?.message || err)
  }
}

// ---------- Sino: leitura e marcação ----------
// Toda consulta filtra por user_id E workspace_id (vindos do token, nunca do
// cliente). Ao contrário do emitTaskNotifications, estas funções LANÇAM em caso
// de erro de banco: a rota responde 500 e o cliente mantém o último contador.
//
// Nenhuma leitura aqui é ilimitada: no Supabase real o PostgREST corta em 1000
// linhas e listas `.in()` enormes estouram o limite de URL, e os avisos não têm
// rotina de limpeza (fora de escopo). Por isso o sino trabalha só sobre a
// janela das WINDOW_SIZE mais recentes do usuário.

const LIST_LIMIT = 50
const WINDOW_SIZE = 200
const DUE_KINDS = new Set(['due_soon', 'overdue'])

// Cria os avisos de prazo (due_soon/overdue) pendentes do usuário. Idempotente:
// pré-consulta só as chaves dos avisos candidatos e, se uma corrida inserir a
// mesma chave antes, a violação da chave única (23505) é ignorada.
// Devolve Map(id da tarefa -> prazo atual) das tarefas NÃO concluídas do
// usuário no workspace: é o que o sino usa para esconder avisos de prazo
// vencidos pelo estado da tarefa (sem consultar tarefas por lista de ids).
export async function materializeDueNotifications({ userId, workspaceId, today }) {
  const { data: tasks, error: tasksError } = await supabase
    .from('fourbase_tasks')
    .select('id, title, column_key, due_date, due_date_end')
    .eq('workspace_id', workspaceId)
    .eq('assigned_to', userId)
  if (tasksError) throw tasksError

  const openTasks = new Map(
    (tasks || [])
      .filter((t) => t.column_key !== 'done')
      .map((t) => [t.id, t.due_date_end || t.due_date || null]),
  )

  const due = dueNotifications(tasks || [], today)
  if (due.length === 0) return openTasks

  const { data: existing, error: existingError } = await supabase
    .from('fourbase_notifications')
    .select('dedupe_key')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .in('dedupe_key', due.map((d) => d.dedupe_key))
  if (existingError) throw existingError
  const known = new Set((existing || []).map((n) => n.dedupe_key))

  for (const item of due) {
    if (known.has(item.dedupe_key)) continue
    const { error } = await supabase.from('fourbase_notifications').insert({
      workspace_id: workspaceId,
      user_id: userId,
      kind: item.kind,
      task_id: item.task_id,
      actor_id: null,
      title: item.title,
      meta: { due_date: item.due_date },
      dedupe_key: item.dedupe_key,
    })
    if (error && error.code !== '23505') throw error
  }
  return openTasks
}

// { items, unread } sobre a janela dos 200 avisos mais recentes do usuário:
// esconde avisos de prazo cuja tarefa não vale mais (excluída, concluída, com
// outro responsável, ou com prazo diferente do que o aviso diz; due_soon cujo
// prazo já passou também some: vale o overdue) e devolve os 50
// primeiros; `unread` conta as não lidas da janela já filtrada.
// Menção/atribuição nunca são escondidas pelo estado da tarefa.
export async function listNotifications({ userId, workspaceId, today }) {
  const openTasks = await materializeDueNotifications({ userId, workspaceId, today })

  const { data, error } = await supabase
    .from('fourbase_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(WINDOW_SIZE)
  if (error) throw error

  const visible = (data || []).filter((n) => {
    if (!DUE_KINDS.has(n.kind)) return true
    if (!openTasks.has(n.task_id)) return false
    if (n.meta?.due_date !== openTasks.get(n.task_id)) return false
    // Depois do prazo, o aviso de atrasada (overdue) representa a tarefa: o
    // due_soon da mesma data ficaria duplicado e com o texto de "atrasada".
    if (n.kind === 'due_soon' && n.meta?.due_date < today) return false
    return true
  })

  return {
    items: visible.slice(0, LIST_LIMIT).map((n) => ({
      id: n.id,
      kind: n.kind,
      task_id: n.task_id ?? null,
      actor_id: n.actor_id ?? null,
      title: n.title,
      meta: n.meta ?? null,
      read_at: n.read_at ?? null,
      created_at: n.created_at,
    })),
    unread: visible.filter((n) => !n.read_at).length,
  }
}

// Marca uma notificação do usuário como lida. false se não existir ou não for
// dele (a rota responde 404 nos dois casos). Já lida conta como sucesso e não
// muda a data.
export async function markRead({ userId, workspaceId, id }) {
  const { data, error } = await supabase
    .from('fourbase_notifications')
    .select('id, read_at')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
  if (error) throw error
  const row = (data || [])[0]
  if (!row) return false
  if (row.read_at) return true
  const { error: updateError } = await supabase
    .from('fourbase_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
  if (updateError) throw updateError
  return true
}

// Marca como lidas todas as não lidas do usuário (só as dele), num único update.
export async function markAllRead({ userId, workspaceId }) {
  const { error } = await supabase
    .from('fourbase_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
  if (error) throw error
}
