-- Sinalização do gestor ao colaborador (sininho na aba Equipe).
--
-- Aditiva: só amplia a lista de tipos aceitos em fourbase_notifications com 'reminder'
-- ("fulano está sinalizando esta tarefa"). Nada em dados existentes muda. Rode DEPOIS da
-- 20261003000000_notifications.sql. Sem esta migration o sininho responde erro; o resto do app segue normal.

alter table fourbase_notifications drop constraint if exists fourbase_notifications_kind_check;
alter table fourbase_notifications
  add constraint fourbase_notifications_kind_check
  check (kind in ('mention', 'assignment', 'due_soon', 'overdue', 'reminder'));
