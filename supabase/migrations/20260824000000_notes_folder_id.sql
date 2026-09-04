-- Vincula notas a uma pasta de Documentações (PATCH /api/notes/:id/folder).
-- Faltou na reconstrução do schema-base (20260806000000) — a rota já existia
-- no código, mas a coluna nunca foi criada nesta tabela. Só quebra contra o
-- Postgres real: o shim local (api/localDb.js) não valida schema, então
-- aceita qualquer campo e mascarou a falta.
alter table fourbase_notes add column if not exists folder_id uuid references fourbase_folders(id) on delete set null;

create index if not exists fourbase_notes_folder_idx on fourbase_notes (folder_id);
