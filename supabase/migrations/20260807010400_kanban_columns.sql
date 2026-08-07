-- Colunas do Kanban persistidas no banco. Enquanto esta tabela não existe, o
-- frontend usa localStorage como fallback (colunas por usuário, no navegador).

create table if not exists fourbase_columns (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  position   integer not null default 0,
  color      text not null default '#14b8c4',
  created_at timestamptz default now()
);

insert into fourbase_columns (key, label, position, color) values
  ('todo',  'A Fazer',      0, '#9ca3af'),
  ('doing', 'Em Progresso', 1, '#14b8c4'),
  ('done',  'Concluído',    2, '#2ec27e')
on conflict (key) do nothing;
