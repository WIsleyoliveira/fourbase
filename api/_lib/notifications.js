import { supabase } from './supabase.js'
import { diffTaskNotifications } from './notificationRules.js'
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
