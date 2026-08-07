-- Vínculo de tarefas com clientes (Kanban dedicado no Espaço do Cliente).
-- Nullable — tarefas sem cliente continuam funcionando normalmente no Kanban geral.

alter table fourbase_tasks
  add column if not exists client_id uuid
  references fourbase_clients(id) on delete set null;
