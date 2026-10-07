# Notificações no app + e-mail imediato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar pessoas (sino no app + e-mail) quando são mencionadas, atribuídas ou quando um prazo se aproxima.

**Architecture:** Regras puras (`notificationRules.js`) decidem quem é avisado; um serviço (`notifications.js`) grava em `fourbase_notifications` e envia e-mail via `mailer.js`; as rotas de tarefa chamam um único ponto de emissão; o prazo é materializado na leitura de `GET /api/notifications`. O frontend lê tudo pelo TanStack Query (`useNotifications`), com sino na topbar e overlay `?tarefa=<id>` somente leitura.

**Tech Stack:** Express (serverless Vercel), banco local simulado `api/localDb.js` + Supabase Postgres, React 18 + React Router + TanStack Query, `node:test`, Resend (HTTP), `@vercel/functions` (`waitUntil`).

**Spec:** `docs/superpowers/specs/2026-10-03-notificacoes-design.md`

## Global Constraints

- Tipos de aviso: exatamente `mention`, `assignment`, `due_soon`, `overdue`.
- E-mail só para `mention` e `assignment`; limite de **1 e-mail por (destinatário, tarefa, tipo) a cada 10 minutos**; timeout do envio **4 s**; falha de e-mail ou de emissão **nunca** derruba `POST/PATCH /api/tasks`.
- Prazo: `due_date_end || due_date`; `due_soon` = hoje ou amanhã; `overdue` = vencida há **no máximo 7 dias**; só tarefas do responsável com `column_key != 'done'`; `dedupe_key` inclui a data (`due_soon:<task_id>:<due>` / `overdue:<task_id>:<due>`).
- `today` vem de `?today=AAAA-MM-DD`; aceito só a ±1 dia da data do servidor, senão usa a do servidor.
- Lista: **50** mais recentes por usuário; `unread` conta todas as não lidas.
- Polling do sino: **30 s**. Link do e-mail: `APP_URL/painel?tarefa=<id>`.
- Variáveis novas: `RESEND_API_KEY`, `EMAIL_FROM` (usa `APP_URL` existente). Sem `RESEND_API_KEY`: só registra no log.
- Toda consulta filtra por `workspace_id` **e** `user_id` do token; ids do corpo validados com `validMemberIds`. RLS da tabela nova: ligado, **sem policies**.
- Modal aberto pelo link é **somente leitura** para todos; não alterar o `TaskDetailModal`.
- Mensagens ao usuário em português. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Tarefa **reatribuída** depois do aviso de prazo: o aviso do antigo responsável deixa de aparecer (teste na Task 4).
2. `?today=` inválido ou absurdo (`9999-99-99`, `abc`, `1970-01-01`): cai na data do servidor, sem erro 500 (Task 2 e 5).
3. Título de tarefa com HTML, quebras de linha ou aspas: aparece como texto no e-mail e no sino, sem quebrar o assunto (Task 3 e 6).
4. Destinatário sem e-mail, inativo ou com `notify_email = false`: aviso do sino existe, e-mail não sai, nada lança (Task 4).
5. Clicar em aviso de tarefa já excluída ou sem acesso: "Tarefa não encontrada" e o overlay fecha (Task 8).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003000000_notifications.sql` | tabela + `notify_email` |
| `api/localDb.js` (mod.) | registra a tabela no banco local |
| `api/_lib/notificationRules.js` (novo) | regras puras: quem avisar, prazo, "hoje", acesso à tarefa |
| `api/_lib/mailer.js` (novo) | envio via Resend + texto do e-mail + `runInBackground` |
| `api/_lib/notifications.js` (novo) | gravar avisos, e-mail com limite, listar, marcar lida |
| `api/_lib/routes/notifications.js` (novo) | rotas do sino |
| `api/_lib/routes/tasks.js` (mod.) | emissão em POST/PATCH + `GET /api/tasks/:id` |
| `api/_lib/auth.js`, `api/_lib/routes/profile.js` (mod.) | `notify_email` |
| `api/index.js` (mod.) | monta o router novo |
| `src/routes.js` (mod.) | `taskId` via `?tarefa=` |
| `src/notificationText.js`, `src/notificationCache.js` (novos) | texto/tempo/"hoje" e helpers de cache puros |
| `src/hooks/useNotifications.js`, `useTasks.js` (mod.) | consulta, ações, `useTask(id)` |
| `src/components/NotificationBell.jsx`, `TaskPeekModal.jsx` (novos) | sino e modal de leitura |
| `src/App.jsx`, `ProfileView.jsx`, `styles.css`, `api.js` (mod.) | posicionamento, overlay, interruptor, estilos, endpoints |
| `tests/*.test.js` | um arquivo por unidade (ver tarefas) |

---

### Task 1: Dados — migration, banco local e `notify_email`

**Files:**
- Create: `supabase/migrations/20261003000000_notifications.sql`
- Modify: `api/localDb.js` (listas `WORKSPACE_SCOPED`, `TIMESTAMPED`, `UNIQUE_COLUMNS`), `api/_lib/auth.js` (`publicUser`), `api/_lib/routes/profile.js` (`PATCH /api/profile`), `.env.example`
- Test: `tests/profile-notify.test.js`

**Interfaces:**
- Produces: tabela `fourbase_notifications(id, workspace_id, user_id, kind, task_id, actor_id, title, meta, dedupe_key, read_at, created_at)`; `publicUser(u).notify_email: boolean` (default `true`); `PATCH /api/profile` aceita `notify_email`.

- [ ] **Step 1: Write the failing test** `tests/profile-notify.test.js` (mesmo esqueleto de `tests/workspace-isolation.test.js`: fixture com 1 workspace e 1 usuário, `FOURBASE_DB_PATH` temporário, login real). Testes: `usuário antigo sem notify_email aparece como true em /api/auth/me`; `PATCH /api/profile {notify_email:false} devolve user.notify_email false e persiste`; `notify_email não-booleano vira Boolean()`.
- [ ] **Step 2:** `node --test tests/profile-notify.test.js` → FAIL.
- [ ] **Step 3:** Escrever a migration conforme spec §2.1 (check de `kind`, FKs com `on delete cascade`, `actor_id on delete set null`, índice único parcial `(user_id, dedupe_key) where dedupe_key is not null`, índice `(user_id, created_at desc)`, RLS ligado sem policies, `alter table fourbase_users add column if not exists notify_email boolean not null default true`). Em `localDb.js`: adicionar `fourbase_notifications` às três listas, com `UNIQUE_COLUMNS.fourbase_notifications = [['user_id', 'dedupe_key']]`. `publicUser`: `notify_email: u.notify_email ?? true`. `PATCH /api/profile`: `if (notify_email !== undefined) updates.notify_email = Boolean(notify_email)`. `.env.example`: documentar `RESEND_API_KEY` e `EMAIL_FROM` (comentados).
- [ ] **Step 4:** `npm test` → tudo passa.
- [ ] **Step 5: Commit** `Adiciona tabela de notificações e preferência notify_email`.

---

### Task 2: Regras puras de notificação

**Files:**
- Create: `api/_lib/notificationRules.js`
- Test: `tests/notificationRules.test.js`

**Interfaces:**
- Produces:
  - `diffTaskNotifications(before: Task|null, after: Task, actorId: string, activeMemberIds: Set<string>): Array<{ user_id: string, kind: 'assignment'|'mention' }>`
  - `dueNotifications(tasks: Task[], today: string): Array<{ task_id: string, title: string, kind: 'due_soon'|'overdue', due_date: string, dedupe_key: string }>`
  - `addDays(isoDate: string, days: number): string`
  - `resolveToday(candidate: string|undefined, now?: Date): string` (data do servidor em `AAAA-MM-DD`, UTC)
  - `canViewTask(task: Task, user: { id: string, role: string }): boolean`

- [ ] **Step 1: Write the failing tests** (nomes e asserções):
  - `criar: responsável diferente do autor recebe assignment` / `autor atribuindo a si mesmo não gera nada`
  - `criar: cada mencionado ≠ autor recebe mention`
  - `editar: só a menção nova gera aviso` (before `[a]`, after `[a,b]` → só `b`)
  - `editar sem mudar responsável nem menções não gera nada`
  - `mesma pessoa responsável e mencionada recebe só assignment`
  - `destinatário fora de activeMemberIds é ignorado`
  - `dueNotifications: vence hoje e amanhã → due_soon; ontem → overdue; há 8 dias → nada; há 7 dias → overdue`
  - `dueNotifications: coluna done e sem prazo não geram; due_date_end tem prioridade sobre due_date`
  - `dedupe_key contém a data` (`due_soon:t1:2026-10-04`) e muda com o prazo
  - `resolveToday aceita hoje±1 e rejeita 'abc', '9999-99-99', '1970-01-01', undefined → data do servidor`
  - `canViewTask: responsável, mencionado e gestor sim; outro membro só se client_id; outro membro sem client_id não`
- [ ] **Step 2:** `node --test tests/notificationRules.test.js` → FAIL.
- [ ] **Step 3:** Implementar as cinco funções em `api/_lib/notificationRules.js` (sem imports de banco). Datas por aritmética de strings ISO em UTC (`Date.UTC`), nunca `new Date(str)` com fuso local.
- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5: Commit** `Adiciona regras puras de notificação`.

---

### Task 3: Mailer

**Files:**
- Create: `api/_lib/mailer.js`; `package.json` (dependência `@vercel/functions`)
- Test: `tests/mailer.test.js`

**Interfaces:**
- Produces:
  - `sendMail(msg: { to: string, subject: string, text: string }, deps?: { fetchImpl?: typeof fetch, env?: object, log?: Console }): Promise<boolean>`
  - `buildNotificationEmail(args: { kind: 'mention'|'assignment', actorName: string, title: string, taskId: string, appUrl: string }): { subject: string, text: string }`
  - `runInBackground(promise: Promise<unknown>): void`

- [ ] **Step 1: Write the failing tests:**
  - `sendMail: POST em api.resend.com/emails com Bearer, from, to, subject e text` (fetch falso captura a chamada)
  - `sem RESEND_API_KEY: não chama fetch, registra no log, devolve false`
  - `resposta não-ok ou fetch que lança: devolve false e não lança`
  - `timeout de 4 s aborta` (fetch falso que respeita `AbortSignal`; usar relógio curto injetável ou verificar que `signal` foi passado)
  - `buildNotificationEmail: assunto "Maria mencionou você em “Título”" e "Maria atribuiu a você “Título”"`
  - `título com quebra de linha vira uma linha no assunto; HTML permanece texto literal`
  - `link do corpo é APP_URL/painel?tarefa=<id>`
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** `npm install @vercel/functions`. Implementar o módulo. `runInBackground` usa `waitUntil` de `@vercel/functions`; **verificar no teste que fora da Vercel não lança** (promessa executa e erros são engolidos com `.catch`).
- [ ] **Step 4:** → PASS (`npm test` completo).
- [ ] **Step 5: Commit** `Adiciona mailer (Resend) e texto dos e-mails`.

---

### Task 4: Serviço de notificações + integração nas tarefas

**Files:**
- Create: `api/_lib/notifications.js`
- Modify: `api/_lib/routes/tasks.js` (`POST /api/tasks` e `PATCH /api/tasks/:id`)
- Test: `tests/notifications-service.test.js` (API + banco local, esqueleto de `workspace-isolation`, com `sendMail` falso injetado)

**Interfaces:**
- Consumes: Task 2 (`diffTaskNotifications`, `dueNotifications`, `resolveToday`), Task 3 (`sendMail`, `buildNotificationEmail`, `runInBackground`), `validMemberIds`.
- Produces:
  - `emitTaskNotifications(before: Task|null, after: Task, actor: { id: string, name: string, workspace_id: string }, deps?: { sendMail?, now?: () => Date }): Promise<void>` (nunca lança)
  - `materializeDueNotifications({ userId: string, workspaceId: string, today: string }): Promise<void>`
  - `setNotificationDeps(deps)` apenas para testes (troca `sendMail`).

- [ ] **Step 1: Write the failing tests:**
  - `POST /api/tasks com mentioned_users cria aviso mention só para o mencionado (não para o autor)`
  - `PATCH adicionando uma menção notifica só a nova; reeditar o título não duplica`
  - `PATCH trocando o responsável cria assignment para o novo`
  - `e-mail: enviado para menção/atribuição com notify_email true; não enviado com false, inativo ou sem e-mail`
  - `e-mail: segundo evento igual (mesma pessoa, tarefa, tipo) em < 10 min não reenvia, mas o aviso do sino é criado`
  - `falha do emissor (sendMail que lança) não impede o POST/PATCH nem muda o status 2xx`
  - `PATCH sem assigned_to/mentioned_users no corpo não lê a tarefa antes nem emite`
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementar `notifications.js`: grava uma linha por destinatário (`title` = título da tarefa, `actor_id`), consulta o limite de 10 min em `fourbase_notifications` (mesma `user_id`+`task_id`+`kind` com `created_at` recente) antes de enviar, lê e-mail/`notify_email`/`status` do destinatário no servidor, envia via `runInBackground`. Em `tasks.js`: `POST` chama `emitTaskNotifications(null, criada, req.user)` após o insert; `PATCH` lê a linha antes **somente** se o corpo tem `assigned_to` ou `mentioned_users`, e emite após o update (try/catch interno do serviço).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `Gera notificações de menção e atribuição ao criar/editar tarefas`.

---

### Task 5: Rotas do sino + `GET /api/tasks/:id`

**Files:**
- Create: `api/_lib/routes/notifications.js`
- Modify: `api/_lib/notifications.js` (`listNotifications`, `markRead`, `markAllRead`), `api/_lib/routes/tasks.js` (`GET /api/tasks/:id` — registrar **depois** de `/api/tasks/client-stats`, `/client-linked` e `/by-client/:clientId`), `api/index.js` (`app.use(notificationsRoutes)`)
- Test: `tests/notifications-api.test.js`

**Interfaces:**
- Produces: `listNotifications({ userId, workspaceId, today }): Promise<{ items: NotificationRow[], unread: number }>`; `markRead({ userId, workspaceId, id }): Promise<boolean>`; `markAllRead({ userId, workspaceId }): Promise<void>`; rotas `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`, `GET /api/tasks/:id`.

- [ ] **Step 1: Write the failing tests:**
  - `GET com today cria due_soon/overdue uma vez; segunda chamada idêntica não duplica`
  - `GET com today inválido ('abc','9999-99-99') responde 200 usando a data do servidor`
  - `aviso de prazo some quando a tarefa é concluída, excluída ou reatribuída a outra pessoa`
  - `items limitado a 50 e unread conta todas as não lidas (criar 55)`
  - `PATCH read: marca a própria; 404 para aviso de outra pessoa; read-all só afeta o próprio usuário`
  - `isolamento: usuário A não vê nem marca avisos de B; workspace B nunca alcança A` (reaproveitar fixture de dois workspaces)
  - `GET /api/tasks/:id: responsável, mencionado e gestor 200; membro comum 404 sem cliente e 200 com cliente; outro workspace 404`
  - `/api/tasks/client-stats continua funcionando` (ordem de rotas)
  - `rotas exigem token` (401 sem Authorization)
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementar. `listNotifications` chama `materializeDueNotifications` (busca `fourbase_tasks` com `assigned_to = userId`, `workspace_id`, aplica `dueNotifications`, insere ignorando violação `23505`), depois filtra avisos de prazo cuja tarefa não existe, está `done` ou tem outro responsável, ordena por `created_at desc`, limita a 50 e calcula `unread` sobre todas.
- [ ] **Step 4:** → PASS, `npm test` completo.
- [ ] **Step 5: Teste de mutação** (manual, descartar depois): remover `.eq('user_id', ...)` de `markRead` e conferir que o teste de isolamento falha; `git checkout -- api/_lib/notifications.js`.
- [ ] **Step 6: Commit** `Adiciona API do sino e GET /api/tasks/:id`.

---

### Task 6: Frontend puro — rotas, texto e cache

**Files:**
- Modify: `src/routes.js`
- Create: `src/notificationText.js`, `src/notificationCache.js`
- Test: `tests/routes.test.js` (acrescentar), `tests/notificationText.test.js`, `tests/notificationCache.test.js`

**Interfaces:**
- Produces:
  - `parseLocation(pathname, search)` passa a incluir `taskId: string|null` (de `?tarefa=`, só `[A-Za-z0-9_-]+`).
  - `withTaskParam(search: string, taskId: string|null): string` (adiciona/remove `tarefa` preservando os demais parâmetros).
  - `notificationText(n: NotificationRow, members: Array<{id,name}>, today: string): string`
  - `relativeTime(iso: string, now?: Date): string` (`agora`, `há 5 min`, `há 2 h`, `ontem`, `há N dias`)
  - `localToday(now?: Date): string` (`AAAA-MM-DD` no fuso do navegador)
  - `markReadInData(data: { items, unread }, id: string, nowIso: string): { items, unread }`; `markAllInData(data, nowIso)`.

- [ ] **Step 1: Write the failing tests:** `?tarefa=abc é lido em qualquer tela válida e não invalida a rota`; `?tarefa=a/b é ignorado`; `withTaskParam preserva ?aba=docs`; `notificationText` para os 4 tipos (`Maria mencionou você em “Título”`, `... atribuiu a você ...`, `vence hoje`, `vence amanhã`, `está atrasada há 3 dias`, autor desconhecido → `Alguém`); título com quebra de linha vira espaço; `localToday` usa data local; `markReadInData` decrementa `unread` só se estava não lida; idempotente; `markAllInData` zera.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementar (funções puras; `routes.js` sem quebrar os testes existentes).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `Adiciona rotas ?tarefa= e utilitários de notificação no frontend`.

---

### Task 7: Dados no cliente + sino

**Files:**
- Create: `src/hooks/useNotifications.js`, `src/components/NotificationBell.jsx`
- Modify: `src/api.js` (`getNotifications(today)`, `markNotificationRead(id)`, `markAllNotificationsRead()`, `getTask(id)`), `src/App.jsx` (sino na `.topbar` e no `.mobile-topbar`), `src/styles.css`

**Interfaces:**
- Consumes: Task 6.
- Produces: `useNotifications(): UseQueryResult<{items, unread}>` (chave `['notifications', userId]`, `refetchInterval: 30000`, envia `localToday()`); `useNotificationActions(): { markRead(id), markAllRead() }` (otimistas, rollback + toast); `<NotificationBell />` (sem props; navega com `withTaskParam`).

- [ ] **Step 1:** Implementar o hook seguindo o padrão de `useNotes.js` (chave com id do usuário da sessão, `enabled` só logado) e o componente: botão com `aria-label` `Notificações, N não lidas` e `aria-expanded`, popover `role="list"`, não lidas em destaque, estado vazio `Nenhuma notificação`, botão `Marcar todas como lidas`, fecha com Esc e clique fora. Clicar: `markRead` + `navigate({ search: withTaskParam(...) })`.
- [ ] **Step 2:** Posicionar: dentro de `.topbar` (lado direito) e ao lado do avatar em `.mobile-topbar`; estilos reutilizando as variáveis de cor existentes.
- [ ] **Step 3:** `npx vite build` sem erros; `npm test` verde.
- [ ] **Step 4: Verificação no navegador** (dev server, banco local): com 2 usuários, mencionar B numa tarefa e ver o contador de B em ≤30 s (usar `visibilityState` simulado se a aba estiver oculta); marcar lida com falha simulada de `fetch` volta o contador e mostra toast.
- [ ] **Step 5: Commit** `Adiciona o sino de notificações`.

---

### Task 8: Overlay da tarefa (`?tarefa=`)

**Files:**
- Create: `src/components/TaskPeekModal.jsx`
- Modify: `src/hooks/useTasks.js` (`useTask(id)`, chave `['task', id]`), `src/App.jsx`

**Interfaces:**
- Produces: `useTask(id: string|null): UseQueryResult<Task>` (404 → `isError`); `<TaskPeekModal taskId onClose />`.

- [ ] **Step 1:** `useTask` com `retry: false`. `TaskPeekModal` em portal no `body`: título, descrição, status (rótulo da coluna via `useColumns`), prioridade, prazo, responsável e menções (via `useMembers`), cliente (via `useClients`), etiquetas, anexos; botão `Ver no Kanban` (`/kanban`) ou `Ver no cliente` (`/clientes/:id`). Erro/404: `Tarefa não encontrada` com botão `Fechar`; Esc e clique fora fecham. Título e descrição renderizados como texto.
- [ ] **Step 2:** Em `App.jsx`: renderizar `<TaskPeekModal>` quando `route.taskId`; fechar = `navigate` com `replace` removendo o parâmetro.
- [ ] **Step 3: Verificação no navegador:** abrir `/painel?tarefa=<id>` em carga fria (logado e deslogado → após login mantém o link); mencionado sem cliente enxerga a tarefa; id inexistente mostra `Tarefa não encontrada`; HTML no título aparece literal.
- [ ] **Step 4:** `npm test` + build.
- [ ] **Step 5: Commit** `Abre tarefas por link (?tarefa=) em modal somente leitura`.

---

### Task 9: Preferência no Meu Perfil

**Files:**
- Modify: `src/components/ProfileView.jsx`, `src/styles.css`

- [ ] **Step 1:** Cartão `Notificações` com o interruptor `Receber e-mails de notificação` (lê `currentUser.notify_email`, salva com `api.updateProfile({ notify_email })` e o `onProfileSaved` existente; erro via `onError`). Acessível (`role="switch"`, `aria-checked`).
- [ ] **Step 2: Verificação no navegador:** desligar, recarregar, continua desligado; com ele desligado, mencionar a pessoa gera sino mas o log do servidor não mostra e-mail.
- [ ] **Step 3:** build + `npm test`.
- [ ] **Step 4: Commit** `Adiciona preferência de e-mail de notificação no perfil`.

---

### Task 10: Fechamento — verificação ponta a ponta e documentação

**Files:**
- Modify: `CLAUDE.md`, `.env.example` (se faltar algo)

- [ ] **Step 1:** Rodada completa no navegador local: criar tarefa com menção e atribuição → sino de dois usuários; prazo hoje/amanhã/atrasada via `today`; reeditar sem duplicar; tarefa excluída → clique mostra `Tarefa não encontrada`; logout limpa o sino; sem erros no console. Conferir no log os e-mails impressos (sem `RESEND_API_KEY`).
- [ ] **Step 2:** `CLAUDE.md`: nova seção "Notifications" (módulos, regras de prazo sem agendador, ponto único de emissão para futuros webhooks, variáveis de ambiente, ordem de rollout: migration → env → deploy).
- [ ] **Step 3:** `npm test` e `npx vite build` verdes; `git status` limpo.
- [ ] **Step 4: Commit** `Documenta notificações no CLAUDE.md`.

---

## Self-Review (feito)

- **Cobertura do spec:** §2 → Task 1; §3 → Tasks 2 e 5; §4 → Tasks 4 e 5 (`notify_email`: Task 1); §5 → Task 3 e 4; §6.1–6.2 → Task 7; §6.3 → Tasks 6 e 8; §6.4 → Task 9; §7 → testes de isolamento/uniformidade nas Tasks 4–5; §8 → Tasks 2–6 e verificações; §9 → Task 10. **Um esclarecimento ao spec:** avisos de prazo também somem quando a tarefa é **reatribuída** (Review Focus 1); o spec só citava concluída/excluída.
- **Consistência de tipos:** nomes usados entre tarefas — `diffTaskNotifications`, `dueNotifications`, `resolveToday`, `canViewTask`, `sendMail`, `buildNotificationEmail`, `runInBackground`, `emitTaskNotifications`, `materializeDueNotifications`, `listNotifications`, `markRead`, `markAllRead`, `withTaskParam`, `notificationText`, `markReadInData` — idênticos em Interfaces e passos.
- **Proporção:** tarefas definem assinaturas, nomes de teste e valores do spec; os corpos ficam com quem implementa.
