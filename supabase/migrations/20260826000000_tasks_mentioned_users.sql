-- Membros mencionados numa tarefa, além do responsável — opcional. Mesmo
-- padrão já usado para `tags`: array simples na própria linha (evita join,
-- que o shim local de dev não interpreta).
alter table fourbase_tasks add column if not exists mentioned_users jsonb not null default '[]'::jsonb;
