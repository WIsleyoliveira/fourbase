-- Assistente (ChatGPT): acesso por token pessoal + registro dos lotes de tarefas criados por ele.
--
-- Aditiva: só cria duas tabelas novas. Nada em dados existentes muda. O código novo funciona sem elas
-- (as rotas do assistente respondem erro, o resto do app não é afetado).
--
-- fourbase_api_tokens: o token em si NUNCA é guardado — só o hash SHA-256 (token_hash) e os primeiros
-- caracteres (prefix) para a pessoa reconhecê-lo na lista. Pode ser revogado (revoked_at) ou expirar.
-- scopes: o que o token pode fazer ("agenda:read", "agenda:write").
--
-- fourbase_assistant_batches: cada lote de tarefas que o assistente cria tem um batch_id (escolhido por
-- ele). O par (user_id, batch_id) é único: repetir o mesmo lote não duplica as tarefas, e o lote pode
-- ser desfeito (undone_at).

create table if not exists fourbase_api_tokens (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,
  scopes       jsonb not null default '["agenda:read","agenda:write"]'::jsonb,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists fourbase_api_tokens_user_idx on fourbase_api_tokens (user_id);

create table if not exists fourbase_assistant_batches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  batch_id     text not null,
  task_ids     jsonb not null default '[]'::jsonb,
  undone_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, batch_id)
);

-- RLS ligado e SEM policies: só a API (service_role) alcança as tabelas, como nas demais.
-- (A migration 20261002000000 só varreu as tabelas que existiam quando rodou.)
alter table fourbase_api_tokens enable row level security;
alter table fourbase_assistant_batches enable row level security;
