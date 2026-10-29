-- Assistente (ChatGPT): conexões (chaves), lotes de tarefas criados por ele e registro de autorizações.
--
-- Aditiva: só cria tabelas novas. Nada em dados existentes muda. O código novo funciona sem elas
-- (as rotas do assistente respondem erro, o resto do app não é afetado).
--
-- fourbase_api_tokens: uma "conexão do assistente". A chave NUNCA é guardada, só o hash SHA-256
--   (token_hash) e o prefixo para reconhecer na lista. kind='personal' = chave fbk_ colada pelo gestor;
--   kind='oauth' fica reservado para o GPT oficial (fase B, colunas de refresh numa migration futura).
--   Toda chave expira (padrão 365 dias, aplicado pela API). last_activity = metadados da ÚLTIMA chamada
--   (operação e período), sobrescrito a cada uso; não é log e nunca contém título/descrição.
-- fourbase_assistant_batches: cada lote criado pelo assistente. (user_id, batch_id) é único (idempotência).
--   token_id = qual conexão criou. items = retrato de cada tarefa na criação: id, fp (hash dos campos
--   editáveis) e datas — sem título nem descrição. O desfazer só apaga tarefas cujo fp atual é igual ao
--   salvo (updated_at NÃO serve: não há trigger em fourbase_tasks). O resumo do histórico vem de items.
-- fourbase_assistant_consents: eventos só de inserção. Quem autorizou o envio de dados ao ChatGPT, quando,
--   com qual versão do aviso; e quando desligou. Prova de autorização (LGPD, instrução do controlador).

create table if not exists fourbase_api_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references weflow_workspaces(id) on delete cascade,
  user_id       uuid not null references fourbase_users(id) on delete cascade,
  kind          text not null default 'personal' check (kind in ('personal', 'oauth')),
  name          text not null check (char_length(name) between 1 and 60),
  token_hash    text not null unique,
  prefix        text not null,
  scopes        jsonb not null default '["agenda:read","agenda:write"]'::jsonb
                  check (jsonb_typeof(scopes) = 'array'),
  last_used_at  timestamptz,
  last_activity jsonb check (last_activity is null or jsonb_typeof(last_activity) = 'object'),
  revoked_at    timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  check (expires_at > created_at)
);

-- lista de conexões do gestor e contagem de ativas
create index if not exists fourbase_api_tokens_user_idx
  on fourbase_api_tokens (user_id, created_at desc);
-- (fase B) "quais gestores do workspace estão conectados"
create index if not exists fourbase_api_tokens_workspace_active_idx
  on fourbase_api_tokens (workspace_id) where revoked_at is null;

create table if not exists fourbase_assistant_batches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  token_id     uuid references fourbase_api_tokens(id) on delete set null,
  batch_id     text not null check (batch_id ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  task_ids     jsonb not null default '[]'::jsonb check (jsonb_typeof(task_ids) = 'array'),
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  undone_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, batch_id)
);

-- histórico (as duas portas): por usuário, mais recentes primeiro
create index if not exists fourbase_assistant_batches_user_created_idx
  on fourbase_assistant_batches (user_id, created_at desc);
-- FK com on delete set null + "o que esta conexão criou"
create index if not exists fourbase_assistant_batches_token_idx
  on fourbase_assistant_batches (token_id) where token_id is not null;

create table if not exists fourbase_assistant_consents (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references weflow_workspaces(id) on delete cascade,
  user_id        uuid references fourbase_users(id) on delete set null,
  token_id       uuid references fourbase_api_tokens(id) on delete set null,
  event          text not null check (event in ('authorized', 'disconnected', 'workspace_disabled')),
  notice_version text check (event <> 'authorized' or notice_version is not null),
  reason         text check (reason is null or reason in ('user', 'replaced', 'expired', 'role_change', 'workspace')),
  created_at     timestamptz not null default now()
);

create index if not exists fourbase_assistant_consents_ws_created_idx
  on fourbase_assistant_consents (workspace_id, created_at desc);
create index if not exists fourbase_assistant_consents_user_idx
  on fourbase_assistant_consents (user_id, created_at desc);

-- Só de inserção: um UPDATE só pode zerar user_id/token_id (os "on delete set null" das FKs).
-- Qualquer outra alteração de um evento é recusada, mesmo pela service_role. A API nunca edita eventos.
create or replace function fourbase_assistant_consents_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (
       new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.event is distinct from old.event or new.notice_version is distinct from old.notice_version
    or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at) then
    raise exception 'fourbase_assistant_consents é só de inserção';
  end if;
  return new;
end $$;

drop trigger if exists fourbase_assistant_consents_append_only on fourbase_assistant_consents;
create trigger fourbase_assistant_consents_append_only
  before update on fourbase_assistant_consents
  for each row execute function fourbase_assistant_consents_append_only();

-- RLS ligado e SEM policies: só a API (service_role) alcança as tabelas, como nas demais.
-- (A migration 20261002000000 só varreu as tabelas que existiam quando rodou.) Nunca criar policy permissiva.
alter table fourbase_api_tokens          enable row level security;
alter table fourbase_assistant_batches   enable row level security;
alter table fourbase_assistant_consents  enable row level security;
