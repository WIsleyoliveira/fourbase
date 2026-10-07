# Notificações no app + e-mail imediato — Design

Data: 2026-10-03 · Branch: `features/upgrade` · Etapa 5, sub-projeto A

## 1. Objetivo e escopo

Avisar as pessoas, dentro do app (sino) e por e-mail, quando algo exige a atenção delas numa tarefa.

**Eventos**

| Tipo | Quem recebe | Sino | E-mail |
|---|---|---|---|
| `mention` | membro mencionado na tarefa | sim | sim |
| `assignment` | novo responsável da tarefa | sim | sim |
| `due_soon` | responsável, tarefa vence hoje ou amanhã | sim | não |
| `overdue` | responsável, tarefa vencida (até 7 dias) | sim | não |

**Fora de escopo** (decisões explícitas): push do navegador, resumo por e-mail, lembrete de prazo por e-mail (exigiria agendador, que não existe), preferências por tipo de evento, limpeza automática de avisos antigos, toast ao chegar aviso novo, edição de tarefa a partir do link (o modal aberto pelo link é somente leitura).

**Critério de sucesso:** quem é mencionado vê o contador no sino em até ~30 s (e recebe o e-mail), clica, vê a tarefa e o aviso sai do contador.

**Restrições herdadas:** API Express serverless na Vercel sem agendador; banco local simulado (`api/localDb.js`) em desenvolvimento e testes; autorização por `workspace_id` do JWT; tabelas com RLS ligado e sem policies (acesso só pela `service_role`).

## 2. Dados

### 2.1 Migration `supabase/migrations/20261003000000_notifications.sql` (aditiva)

Tabela `fourbase_notifications`:

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `workspace_id` | uuid not null | referencia `weflow_workspaces` (`on delete cascade`) |
| `user_id` | uuid not null | destinatário; referencia `fourbase_users` (`on delete cascade`) |
| `kind` | text not null | `mention` \| `assignment` \| `due_soon` \| `overdue` (check constraint) |
| `task_id` | uuid | referencia `fourbase_tasks` (`on delete cascade`) |
| `actor_id` | uuid | quem causou; nulo nos de prazo; `on delete set null` |
| `title` | text not null | título da tarefa no momento do aviso |
| `meta` | jsonb not null default `{}` | `{ "due_date": "AAAA-MM-DD" }` nos de prazo |
| `dedupe_key` | text | só nos de prazo: `due_soon:<task_id>:<due>` / `overdue:<task_id>:<due>` |
| `read_at` | timestamptz | nulo = não lida |
| `created_at` | timestamptz not null default `now()` | |

- Índice único parcial `(user_id, dedupe_key) where dedupe_key is not null`.
- Índice `(user_id, created_at desc)`.
- `enable row level security`, **sem policies**.
- `alter table fourbase_users add column if not exists notify_email boolean not null default true`.

### 2.2 Banco local (`api/localDb.js`)

Registrar `fourbase_notifications` em `WORKSPACE_SCOPED`, em `TIMESTAMPED` e em `UNIQUE_COLUMNS` como `[['user_id', 'dedupe_key']]` (o shim já ignora a checagem quando `dedupe_key` é nulo). Usuários existentes sem `notify_email` contam como `true`.

## 3. Regras de geração

### 3.1 Menção e atribuição — `diffTaskNotifications(before, after, actorId, members)` (função pura)

`before` é `null` na criação. Devolve `[{ user_id, kind }]`.

1. `assignment` para `after.assigned_to` se (criação ou `before.assigned_to` diferente) e ≠ `actorId`.
2. `mention` para cada id em `after.mentioned_users` que não estava em `before.mentioned_users` (na criação: todos) e ≠ `actorId`.
3. Quem já recebeu `assignment` nesta mesma ação não recebe `mention`.
4. Só destinatários que são membros **ativos** do workspace (`status != 'inactive'`).
5. Edições que não mudam responsável nem menções não geram nada.

### 3.2 Prazo — `dueNotifications(tasks, today)` (função pura)

Entrada: tarefas do responsável (`assigned_to = usuário`, `column_key != 'done'`). Data de referência: `due_date_end || due_date` (ignora tarefas sem prazo).

- `due == today` ou `due == today + 1` → `due_soon`.
- `due < today` e `today - due <= 7` dias → `overdue`.
- `dedupe_key` inclui a data: remarcar o prazo permite novo aviso.

Criadas por `GET /api/notifications` com insert idempotente (a chave única descarta repetidos). Avisos de prazo cuja tarefa foi concluída ou excluída não aparecem na lista.

### 3.3 "Hoje"

O navegador envia `?today=AAAA-MM-DD` (data local). O servidor valida o formato e aceita só datas a ±1 dia da sua própria; fora disso usa a data do servidor.

## 4. API

Todas sob `auth`; `workspace_id` e `user_id` vêm do token.

- `GET /api/notifications?today=` → cria avisos de prazo pendentes e devolve `{ items, unread }`. `items`: as 50 mais recentes do usuário (`id, kind, task_id, actor_id, title, meta, read_at, created_at`). `unread`: total de não lidas (não só as 50).
- `PATCH /api/notifications/:id/read` → `read_at = now()` (204). 404 se não for do usuário.
- `POST /api/notifications/read-all` → marca todas as do usuário (204).
- `GET /api/tasks/:id` (novo) → tarefa se: gestor, responsável, mencionado, **ou** qualquer membro quando a tarefa tem `client_id` (regra já vigente de compartilhamento). Caso contrário 404, indistinguível de inexistente ou de outro workspace.
- `PATCH /api/profile` aceita `notify_email` (boolean); `publicUser` o expõe (`true` por padrão).

### 4.1 Integração nas rotas de tarefa

- `POST /api/tasks`: após o insert, `emitTaskNotifications(null, criada, req.user)`.
- `PATCH /api/tasks/:id`: quando o corpo traz `assigned_to` ou `mentioned_users`, lê a tarefa antes de gravar; após o update, `emitTaskNotifications(antes, depois, req.user)`.
- `emitTaskNotifications` roda em `try/catch`, registra o erro e **nunca** faz o salvamento da tarefa falhar. Grava os avisos e dispara os e-mails.

## 5. E-mail

`api/_lib/mailer.js`: `sendMail({ to, subject, text })` via `fetch` para `https://api.resend.com/emails` (`Authorization: Bearer`), timeout de 4 s, nunca lança exceção (devolve `true/false`).

- Variáveis: `RESEND_API_KEY`, `EMAIL_FROM`; links usam `APP_URL`. Sem `RESEND_API_KEY`: imprime no log e retorna `false` (desenvolvimento e testes).
- Execução com `waitUntil` de `@vercel/functions` (dependência nova) para a resposta da API não esperar o envio; fora da Vercel roda sem esperar.
- Só envia se o destinatário: tem `notify_email` ligado, está ativo e tem e-mail. O endereço é lido no servidor e nunca vai ao navegador.
- **Limite anti-spam:** no máximo 1 e-mail por (destinatário, tarefa, tipo) a cada 10 minutos, consultando a tabela de avisos. O aviso do sino é criado sempre.
- Conteúdo em português, texto simples, título da tarefa tratado como texto (sem HTML). Assunto: `<Nome> mencionou você em “<título>”` / `<Nome> atribuiu a você “<título>”`. Corpo: uma frase e o link `APP_URL/painel?tarefa=<id>`.
- Limitação conhecida do Resend: sem domínio de envio verificado, só entrega ao e-mail dono da conta.

## 6. Interface

### 6.1 Sino — `NotificationBell`

- Posições: canto direito da `.topbar` (desktop) e `.mobile-topbar` ao lado do avatar (celular).
- Botão com contador de não lidas; `aria-label` "Notificações, N não lidas", `aria-expanded`. Popover com lista (`role="list"`), não lidas em destaque, estado vazio, botão "Marcar todas como lidas". Fecha com Esc e clique fora.
- Textos: "<Nome> mencionou você em “<título>”", "<Nome> atribuiu a você “<título>”", "“<título>” vence hoje" / "vence amanhã", "“<título>” está atrasada há N dia(s)". Nome do autor vem de `useMembers()` (fallback "Alguém").
- Clicar: marca como lida (otimista; rollback + toast se falhar) e navega para `?tarefa=<id>` (mantendo a tela atual).

### 6.2 Dados no cliente

`useNotifications()` em `src/hooks/useNotifications.js`: chave `['notifications', userId]`, `refetchInterval` 30 s (pausa com a aba oculta), revalida ao voltar o foco, envia `today` local. Ações `markRead`, `markAllRead` otimistas. Logout limpa o cache (já faz `queryClient.clear()`).

### 6.3 Abrir a tarefa — `?tarefa=<id>`

`src/routes.js` passa a extrair `taskId` do parâmetro (qualquer tela válida). O `App` renderiza `TaskPeekModal` como overlay (portal no `body`). Ele busca `GET /api/tasks/:id` (chave `['task', id]`, fora do prefixo `['tasks']`) e mostra, somente leitura: título, descrição, status (coluna), prioridade, prazo, responsável, cliente, etiquetas, menções, anexos; botão "Ver no Kanban" (ou no cliente, se `client_id`). Tarefa inexistente/sem acesso: "Tarefa não encontrada". Fechar remove o parâmetro (`navigate` com `replace`). O link sobrevive ao login (o app já preserva URLs válidas).

### 6.4 Meu Perfil

Cartão "Notificações" com o interruptor "Receber e-mails de notificação", salvando via `api.updateProfile({ notify_email })` e o fluxo `onProfileSaved` existente.

## 7. Erros e segurança

- Falha em gerar aviso ou enviar e-mail: log, sem afetar a tarefa. Falha na lista do sino: silenciosa (o contador mantém o último valor).
- Toda consulta filtra por `workspace_id` **e** `user_id` do token; ids vindos do corpo são validados contra o workspace (`validMemberIds`).
- Rotas de leitura/marcação nunca expõem avisos de outro usuário; `GET /api/tasks/:id` devolve 404 uniforme.
- Nenhum segredo no cliente; e-mail do destinatário só no servidor.

## 8. Testes

Todos em `node:test` (padrão do repositório), sem rede.

1. **Puros:** `diffTaskNotifications` (criar, novo responsável, nova menção, autor nunca notificado, mesma pessoa nos dois papéis, inativo, edição sem mudança); `dueNotifications` (hoje, amanhã, atrasada, corte de 7 dias, concluída, sem prazo, `due_date_end` prioritário, chave inclui data); formatação de textos e "hoje" local.
2. **API (banco local, como `workspace-isolation`):** menção/atribuição geram aviso só para o certo; reeditar não duplica; `GET` com `today` cria prazo uma vez, idempotente; marcar lida só afeta o próprio usuário; usuário A não lê nem marca avisos de B; workspace B não alcança A; regras de `GET /api/tasks/:id` (responsável, mencionado, gestor, membro comum com/sem cliente, outro workspace); `notify_email` no perfil; falha no emissor não derruba `POST/PATCH /api/tasks`.
3. **E-mail (`fetch` injetado):** payload e destinatário; falha não lança; opt-out e inativo respeitados; limite de 10 min; sem chave só registra.
4. **Teste de mutação:** remover o filtro de usuário de uma rota de aviso e confirmar que os testes falham.
5. **Navegador (local):** sino, contador, polling (com `visibilityState` simulado), marcar lida com falha simulada, `?tarefa=` em frio e após login, perfil, e conferência do e-mail no log.

## 9. Rollout

1. Aplicar a migration no Supabase **antes** do deploy (aditiva, sem risco).
2. Definir na Vercel: `RESEND_API_KEY`, `EMAIL_FROM` (e verificar domínio no Resend). Sem elas o app funciona e só o e-mail fica desligado.
3. Deploy. Sem mudança em dados existentes.

## 10. Decisões registradas

- Ponto único de emissão (`emitTaskNotifications`) para que webhooks (sub-projeto C) se plugem depois, sem tabela genérica de eventos agora.
- Prazo calculado na leitura, sem agendador, com chave única por (tarefa, data).
- Modal de leitura novo em vez de adaptar o `TaskDetailModal` (720 linhas, edição campo a campo).
