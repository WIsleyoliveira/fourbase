-- Controla se o usuário já viu o wizard de boas-vindas (primeiro acesso).
-- Fonte de verdade é o banco, não localStorage — assim a tela não reaparece
-- ao trocar de navegador/dispositivo, e o gestor pode futuramente auditar
-- quem já passou pelo onboarding.
alter table fourbase_users add column if not exists has_completed_onboarding boolean not null default false;
