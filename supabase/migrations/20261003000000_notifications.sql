-- ############################################################################
-- ATENÇÃO — ORDEM DE DEPLOY: leia docs/deploy-runbook.md ANTES de aplicar.
-- Roda junto (no db push) com a 20261002000000, que fecha o RLS.
-- Não rode `supabase db push` antes de o código novo estar no ar com
-- SUPABASE_SERVICE_ROLE_KEY configurada na Vercel.
-- ############################################################################
-- Notificações no app (sino) + preferência de e-mail.
--
-- Aditiva: cria uma tabela nova e uma coluna com default. Nada em dados
-- existentes muda. (O código novo funciona sem ela; o sino só fica vazio.)
--
-- fourbase_notifications guarda os avisos por destinatário. Tipos:
--   mention     — alguém mencionou o usuário numa tarefa
--   assignment  — a tarefa foi atribuída ao usuário
--   due_soon    — a tarefa do usuário vence hoje ou amanhã
--   overdue     — a tarefa do usuário está vencida (até 7 dias)
-- Os de prazo são gerados na leitura (sem agendador) e usam dedupe_key
-- (`due_soon:<task_id>:<due>` / `overdue:<task_id>:<due>`) para não repetir.

create table if not exists fourbase_notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  kind         text not null
               check (kind in ('mention', 'assignment', 'due_soon', 'overdue')),
  task_id      uuid references fourbase_tasks(id) on delete cascade,
  actor_id     uuid references fourbase_users(id) on delete set null,
  title        text not null,
  meta         jsonb not null default '{}'::jsonb,
  dedupe_key   text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Um aviso de prazo por (usuário, tarefa, data): o insert repetido é descartado.
-- Avisos de menção/atribuição não têm dedupe_key e ficam fora do índice.
create unique index if not exists fourbase_notifications_dedupe_idx
  on fourbase_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- Lista do sino: as mais recentes do usuário.
create index if not exists fourbase_notifications_user_created_idx
  on fourbase_notifications (user_id, created_at desc);

-- RLS ligado e SEM policies: anon/authenticated não alcançam a tabela, só a API
-- (service_role). A migration 20261002000000_lock_down_table_rls.sql só varreu
-- as tabelas que existiam quando rodou, então esta precisa ser explícita.
alter table fourbase_notifications enable row level security;

-- Preferência de receber e-mail de aviso (usuários existentes ficam ligados).
alter table fourbase_users
  add column if not exists notify_email boolean not null default true;
