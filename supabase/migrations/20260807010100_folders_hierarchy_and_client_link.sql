-- Hierarquia de pastas (pastas dentro de pastas) e vínculo com clientes
-- (aba Documentações agrupada por cliente). client_id é nullable — pastas
-- legadas ou sem cliente atribuído caem no grupo "Sem cliente" no frontend.

alter table fourbase_folders
  add column if not exists parent_id uuid
  references fourbase_folders(id) on delete cascade;

alter table fourbase_folders
  add column if not exists client_id uuid
  references fourbase_clients(id) on delete set null;
