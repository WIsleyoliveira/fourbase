-- Planilha de atividades da aba Relatórios. Compartilhada no workspace, no
-- mesmo modelo de fourbase_clients (RLS aberta para a chave anon).

create table if not exists fourbase_report_activities (
  id            uuid primary key default gen_random_uuid(),
  activity_name text,
  date          date,
  status        text not null default 'A fazer',
  assigned_to   uuid references fourbase_users(id) on delete set null,
  client_id     uuid references fourbase_clients(id) on delete set null,
  created_by    uuid references fourbase_users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table fourbase_report_activities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fourbase_report_activities' and policyname = 'fourbase_report_activities_all'
  ) then
    create policy fourbase_report_activities_all on fourbase_report_activities
      for all using (true) with check (true);
  end if;
end $$;
