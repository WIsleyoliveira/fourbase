-- Cargo/função do membro, preenchido no cadastro pela Central de Cadastros
-- (gestor). Opcional — usuários existentes ficam com job_title = NULL.

alter table fourbase_users add column if not exists job_title text;
