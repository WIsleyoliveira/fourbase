-- Campos editáveis pelo próprio usuário na aba "Meu Perfil".
-- job_title e color já existem (migrações anteriores); aqui entram a foto de
-- perfil e o telefone/WhatsApp. Ambos opcionais.

alter table fourbase_users add column if not exists avatar_url text;
alter table fourbase_users add column if not exists phone      text;
