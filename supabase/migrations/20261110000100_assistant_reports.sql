-- Relatórios gerados pelo ChatGPT (MCP): rascunhos que o gestor abre na tela Relatórios.
--
-- Aditiva: uma tabela nova. Só guarda os PARÂMETROS (cliente, período, responsável) e a introdução escrita; as
-- tarefas do relatório continuam vindo ao vivo de fourbase_tasks. Rode DEPOIS da 20261102000000_assistant_oauth.sql.

create table if not exists fourbase_reports (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  client_id    uuid not null references fourbase_clients(id) on delete cascade,
  manager_id   uuid references fourbase_users(id) on delete set null,
  period_from  date not null,
  period_to    date not null,
  intro_text   text check (intro_text is null or char_length(intro_text) <= 4000),
  source       text not null default 'chatgpt' check (source in ('chatgpt')),
  -- repetir o mesmo pedido (falha de rede) devolve o mesmo relatório em vez de criar outro
  request_id   text check (request_id is null or char_length(request_id) between 8 and 80),
  created_by   uuid references fourbase_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (period_to >= period_from)
);

create unique index if not exists fourbase_reports_request_idx
  on fourbase_reports (workspace_id, request_id) where request_id is not null;
create index if not exists fourbase_reports_workspace_created_idx
  on fourbase_reports (workspace_id, created_at desc);

-- RLS ligado e SEM policies: só a API (service_role) alcança a tabela. Nunca criar policy permissiva.
alter table fourbase_reports enable row level security;
