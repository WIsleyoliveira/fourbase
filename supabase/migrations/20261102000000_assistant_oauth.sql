-- Assistente (ChatGPT) via MCP: login OAuth do fourbase para o ChatGPT.
--
-- Aditiva: 2 tabelas novas + colunas novas (todas nulas) em fourbase_api_tokens. Nada em dados existentes
-- muda; as chaves pessoais (fbk_) continuam funcionando como antes. Rode DEPOIS da 20261101000000.
--
-- O ChatGPT não aceita chave de API em servidor MCP: só OAuth (código + PKCE). Cada autorização vira uma
-- linha em fourbase_api_tokens com kind='oauth' (a "conexão"):
--   token_hash         hash do token de acesso atual (fbo_…, vale 1 hora; access_expires_at)
--   refresh_hash       hash do token de renovação atual (troca a cada uso; vale até refresh_expires_at)
--   expires_at         fim da conexão = fim do token de renovação (renovar estende, no máx. 90 dias à frente)
--   oauth_client_id    qual aplicativo (o ChatGPT) recebeu o acesso
-- Tokens e códigos NUNCA são guardados: só o hash SHA-256.

create table if not exists fourbase_oauth_clients (
  client_id     text primary key check (client_id ~ '^fbc_[A-Za-z0-9_-]{16,64}$'),
  client_name   text check (client_name is null or char_length(client_name) <= 100),
  -- só endereços do ChatGPT/OpenAI são aceitos (a API confere na hora de registrar)
  redirect_uris jsonb not null check (jsonb_typeof(redirect_uris) = 'array' and jsonb_array_length(redirect_uris) between 1 and 5),
  created_at    timestamptz not null default now()
);

create table if not exists fourbase_oauth_codes (
  id             uuid primary key default gen_random_uuid(),
  code_hash      text not null unique,
  client_id      text not null references fourbase_oauth_clients(client_id) on delete cascade,
  user_id        uuid not null references fourbase_users(id) on delete cascade,
  workspace_id   uuid not null references weflow_workspaces(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null check (char_length(code_challenge) between 43 and 128),
  resource       text,
  scope          text not null default 'agenda:read agenda:write',
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists fourbase_oauth_codes_expires_idx on fourbase_oauth_codes (expires_at);

alter table fourbase_api_tokens add column if not exists oauth_client_id    text references fourbase_oauth_clients(client_id) on delete set null;
alter table fourbase_api_tokens add column if not exists access_expires_at  timestamptz;
alter table fourbase_api_tokens add column if not exists refresh_hash       text;
alter table fourbase_api_tokens add column if not exists refresh_expires_at timestamptz;

create unique index if not exists fourbase_api_tokens_refresh_hash_idx
  on fourbase_api_tokens (refresh_hash) where refresh_hash is not null;

-- RLS ligado e SEM policies: só a API (service_role) alcança as tabelas. Nunca criar policy permissiva.
alter table fourbase_oauth_clients enable row level security;
alter table fourbase_oauth_codes   enable row level security;
