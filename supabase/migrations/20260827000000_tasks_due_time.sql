-- Horário de início e fim opcional para a tarefa, além da data (due_date/
-- due_date_end). Mesma lógica de opcionalidade: due_time_end só faz sentido
-- se due_time estiver preenchido.
alter table fourbase_tasks add column if not exists due_time time;
alter table fourbase_tasks add column if not exists due_time_end time;
