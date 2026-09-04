-- Permite que uma tarefa dure vários dias em vez de um só. due_date continua
-- sendo o início (nenhuma tela existente quebra); due_date_end é opcional —
-- quando nulo, a tarefa é de um dia só (comportamento atual, inalterado).
alter table fourbase_tasks add column if not exists due_date_end date;
