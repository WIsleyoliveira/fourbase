-- Etiquetas (tags) de tarefas: registro global de etiquetas (pré-cadastradas +
-- criadas dinamicamente pelo usuário) + coluna de array na própria tarefa.
-- Mesmo modelo de acesso das demais tabelas fourbase_* (RLS aberta via chave anon).

create table if not exists fourbase_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#14b8c4',
  created_at timestamptz default now()
);

alter table fourbase_tags enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fourbase_tags' and policyname = 'fourbase_tags_all'
  ) then
    create policy fourbase_tags_all on fourbase_tags
      for all using (true) with check (true);
  end if;
end $$;

-- Etiquetas padrão enviadas pela Amanda — inseridas apenas se ainda não existirem.
insert into fourbase_tags (name, color) values
  ('Reuniões', '#4f8ff7'),
  ('Ensaio fotográfico', '#e85d75'),
  ('Captação de vídeos para os calendários', '#9333ea'),
  ('Treinamentos (PDI e PFL)', '#2ec27e'),
  ('Viagens', '#f2a93b'),
  ('Plantão Psicológico', '#14b8c4')
on conflict (name) do nothing;

-- Etiquetas de cada tarefa — array de nomes (evita join; combina com o padrão
-- já usado para `attachments`, também um array simples na própria linha).
alter table fourbase_tasks add column if not exists tags jsonb not null default '[]'::jsonb;
