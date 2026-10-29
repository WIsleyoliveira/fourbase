# Posição do Architect — Assistente (ChatGPT) didático: token pessoal (A) x GPT oficial com OAuth (B)

**Recomendação central:** sequência **A+ agora → B em seguida**, com o modelo de dados preparado hoje para que B seja só aditivo. A+ = tela "Assistente" + status "Conectado" + histórico de lotes com desfazer, sobre os tokens que já existem; B = um GPT "fourbase" publicado pelo fourbase, com OAuth (authorization code) emitindo **o mesmo tipo de credencial** que `assistantAuth` já valida.

**Argumento-chave:**
O que a tela precisa (status, histórico, desfazer) depende da **conexão** e dos **lotes**, não de como o token nasceu. Se eu tratar `fourbase_api_tokens` como a tabela de "conexões do assistente" (com uma coluna `kind`: `personal` | `oauth`) e ligar cada lote à conexão que o criou (`token_id`), tudo o que construirmos para A — endpoints de status/atividade, a tela, o desfazer pelo app — serve igual para B. O OAuth vira só uma **nova forma de emitir a linha** na mesma tabela: `/oauth/authorize` cria um código, `/oauth/token` grava (e rotaciona) o `token_hash` dessa linha, e o `assistantAuth` continua fazendo exatamente o que faz hoje (hash → linha → escopo → usuário ativo → `last_used_at`). O motivo estrutural para não ficar só em A é o **contrato**: num GPT montado por cada gestor, o `openapi.json` e as instruções são *copiados* no momento da configuração; cada mudança de contrato exige que cada gestor reimporte e recole tudo, e o fourbase fica preso à compatibilidade com N cópias que não controla. Com um GPT oficial, contrato e instruções têm um único dono (o fourbase) e evoluem num só lugar — é isso que escala para "outros gestores em poucos meses". Mas B tem dependências externas (perfil de construtor verificado na OpenAI, política de privacidade pública, URL de callback do GPT) que não devem travar o Evandro agora; por isso A+ vai primeiro.

**Riscos se ignorado:**
- **Dados/estrutura:** fazer a tela de histórico sobre `fourbase_assistant_batches` como está (sem `token_id`, sem resumo) obriga a ler as tarefas para mostrar qualquer coisa — e depois de desfeito o lote não sobra nada para exibir; também não dá para dizer "qual conexão fez isto" quando houver um token pessoal e uma conexão OAuth ao mesmo tempo.
- **Integração/contrato:** escalar A para vários gestores congela o `openapi.json` em N GPTs de terceiros; qualquer `operationId` renomeado ou campo novo obrigatório quebra silenciosamente quem não reimportou. Só dá para mudar o contrato de forma aditiva, para sempre.
- **Migração:** implementar OAuth como sistema paralelo (tabela própria de access tokens, middleware próprio) duplica revogação, limites e "último uso", e a tela teria que juntar duas fontes. Reaproveitar a mesma linha evita isso.

**Dependências de outros domínios:**
- **Advocate:** o texto da tela, o "teste de conexão" guiado (frase para colar no ChatGPT) e o fluxo de consentimento do B ("Entrar no fourbase" → "Permitir").
- **Skeptic/Guardian:** revisão de segurança do OAuth (validação de `redirect_uri`, código de uso único, rotação de refresh, revogação) e a página pública de privacidade (exigência da OpenAI para publicar).
- **Strategist/Operator:** quem faz a verificação de construtor na OpenAI e em que nome (Fourbase como empresa), e quando abrir para o 2º gestor (é o gatilho para B).
- **Scout:** confirmar o estado atual de GPT Actions com OAuth x "apps"/conectores MCP — tratado aqui como incerto.

---

## Apêndice 1 — Contexto do código relevante

| Peça | Arquivo | O que faz hoje |
|---|---|---|
| Gestão de tokens (JWT, gestor) | `api/_lib/routes/assistant.js` | `POST/GET/DELETE /api/assistant/tokens`; máx 5 ativos; token mostrado uma vez; só hash no banco |
| Autenticação do assistente | `api/_lib/routes/assistant.js` (`assistantAuth`/`authenticate`) | `Bearer` → `isTokenShape` (`^fbk_…`) → busca por `token_hash` → revogado/expirado → escopo → usuário ativo no workspace → limite 120/min → `last_used_at` (melhor esforço) → `req.user`, `req.apiToken` |
| Rotas de dados | idem | `GET agenda`, `GET clients`, `POST tasks/preview`, `POST tasks` (lote idempotente por `batch_id`), `POST batches/:batchId/undo` (48 h, só tarefas ainda do dono) |
| Lógica pura + contrato | `api/_lib/assistant.js` | constantes, validação, conflitos/duplicatas, `buildOpenApi` com `securitySchemes: bearer` |
| Auth geral | `api/_lib/auth.js` | JWT 7 d, `auth`, `gestorOnly`, `workspaceOf` (workspace nunca vem do body) |
| Montagem | `api/index.js` | `express.json` apenas (sem `urlencoded` — relevante para `/oauth/token`); `trust proxy`; CORS só `APP_URL` |
| Tabelas | `supabase/migrations/20261101000000_assistant_tokens.sql` | `fourbase_api_tokens` (sem `kind`, sem vínculo a cliente OAuth); `fourbase_assistant_batches` (`user_id, batch_id, task_ids jsonb, undone_at, created_at`; único `(user_id, batch_id)`; **sem `token_id`, sem resumo**) |
| UI | `src/components/AssistantTokensPanel.jsx` (em Meu Perfil) | gerar/listar/revogar; já mostra `last_used_at` |
| Navegação | `src/routes.js` (`VIEW_KEYS`, `GESTOR_ONLY_VIEWS`), `src/App.jsx` (`VIEWS`, bloco "Área do gestor") | nova tela = `'assistente'` em `VIEW_KEYS` + `GESTOR_ONLY_VIEWS` + entrada em `VIEWS`/área do gestor |

Observações: os limites (força bruta e 120/min) são em memória por instância (aproximados na Vercel) — aceitável agora, mas no OAuth o `/oauth/token` também precisa de limite. O invariante "token só abre `/api/assistant/*` de dados; JWT não abre as rotas de dados" é bom e deve ser preservado na tela (o desfazer pelo app precisa de rota JWT própria, não de aceitar JWT na rota do token).

## Apêndice 2 — Backend para a tela "Assistente" (A+)

### O que o modelo atual já cobre
- **"Conectado" aproximado:** `last_used_at` por token já é gravado e já é devolvido em `GET /api/assistant/tokens`.
- **Desfazer:** a regra (48 h, só o que ainda é do dono, idempotente) já existe em `POST /api/assistant/batches/:batchId/undo` — falta só uma porta JWT.
- **Lista de lotes:** os dados existem em `fourbase_assistant_batches`, mas sem rota de leitura.

### Migração aditiva (uma, pequena)
```sql
-- conexões: prepara B sem mudar nada de A
alter table fourbase_api_tokens add column if not exists kind text not null default 'personal'
  check (kind in ('personal','oauth'));
alter table fourbase_api_tokens add column if not exists oauth_client text;          -- null em 'personal'
-- lotes: quem fez e o que foi, mesmo depois de desfeito
alter table fourbase_assistant_batches add column if not exists token_id uuid
  references fourbase_api_tokens(id) on delete set null;
alter table fourbase_assistant_batches add column if not exists summary jsonb;        -- {count, titles[≤5], first_date, last_date}
create index if not exists fourbase_assistant_batches_user_created_idx
  on fourbase_assistant_batches (user_id, created_at desc);
```
Código: em `POST /api/assistant/tasks`, gravar `token_id: req.apiToken.id` na reserva e `summary` junto com `task_ids`. Lotes antigos ficam com `token_id`/`summary` nulos — a tela cai para `jsonb_array_length(task_ids)` e "conexão desconhecida".

### Endpoints novos
Todos com `auth, gestorOnly` (JWT do app), filtrados por `req.user.id` + `workspaceOf(req)`.

```ts
// GET /api/assistant/status
interface AssistantStatus {
  state: 'nunca_configurado' | 'aguardando_primeiro_uso' | 'conectado' | 'parado';
  // nunca_configurado: nenhum token ativo; aguardando: token ativo sem last_used_at;
  // conectado: last_used_at nos últimos 14 dias; parado: ativo mas sem uso há >14 dias
  last_used_at: string | null;          // máx. entre conexões ativas
  active_connections: number;
  last_batch: { batch_id: string; created_at: string; count: number; undone: boolean } | null;
}

// GET /api/assistant/activity?limit=20&before=<created_at ISO>
interface AssistantActivityItem {
  batch_id: string;
  created_at: string;
  count: number;                        // summary.count ?? task_ids.length
  titles: string[];                     // até 5
  date_range: { from: string; to: string } | null;
  connection: { id: string; name: string; kind: 'personal'|'oauth' } | null;
  undone_at: string | null;
  can_undo_until: string | null;        // created_at + 48h, null se já desfeito/expirado
}
// resposta: { items: AssistantActivityItem[]; next_before: string | null }  (cursor por created_at)

// POST /api/assistant/activity/:batchId/undo   (JWT; mesma regra da rota do token)
// 200 { undone: number; kept: number } | 200 { undone: 0, already_undone: true }
// 404 'Lote não encontrado' | 400 'Só dá para desfazer lotes das últimas 48 horas'
```
Implementação: extrair o corpo do undo atual para `undoBatch({ userId, workspaceId, batchId })` e montar nas duas rotas — uma regra, duas portas.

### "Testar conexão"
O fourbase não consegue testar sozinho (o token vive dentro do ChatGPT). Desenho:
1. Nova operação barata no contrato: `GET /api/assistant/me` (readAuth) → `{ ok: true, name, workspace, connection_name, server_time }`, `operationId: 'verificarConexao'`. Ela já atualiza `last_used_at` via `assistantAuth`.
2. A tela mostra "Diga ao seu GPT: *teste a conexão com o fourbase*" e passa a consultar `GET /api/assistant/status` a cada ~5 s por até 2 min (TanStack Query `refetchInterval`), virando "Conectado ✓" quando `last_used_at` mudar.
Aditivo no `openapi.json` — quem já importou continua funcionando; quem reimportar ganha a operação.

### Opcional e útil já em A
`GET /api/assistant/setup` (JWT) devolvendo os blocos de configuração prontos para copiar (URL do schema, texto das instruções versionado no servidor). Assim as instruções têm uma fonte única no backend — e é exatamente o texto que vai para o GPT oficial em B.

**Esforço relativo A+:** 1x (referência) — uma migração aditiva, 4 rotas pequenas, refatoração do undo, tela nova.

## Apêndice 3 — O que B (GPT oficial com OAuth) exigiria

### Peças
| Peça | Desenho |
|---|---|
| Cliente OAuth | **Um** cliente (o GPT fourbase). Começar com env: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URIS` (lista exata do callback que o editor do GPT mostra — hoje algo como `https://chatgpt.com/aip/g-…/oauth/callback`; **confirmar**). Tabela `fourbase_oauth_clients` só quando houver 2º cliente (ex.: conector MCP / Claude). |
| Tela de consentimento (SPA) | Rota pública do front `/conectar?response_type=code&client_id&redirect_uri&state&scope`. Se não houver sessão, mostra o login existente e volta. Depois: "O ChatGPT poderá **ver sua agenda e clientes** e **criar tarefas para você**. [Permitir] [Cancelar]". Entra em `parseLocation` como `activate` já entra. |
| `POST /api/oauth/authorize` (JWT, gestor por ora) | Valida `client_id` + `redirect_uri` (igualdade exata) + escopos ⊆ `SCOPES`; cria código; devolve `{ redirect: redirect_uri?code=…&state=… }`. Cancelar → `error=access_denied`. |
| `fourbase_oauth_codes` | `code_hash pk, workspace_id, user_id, client_id, redirect_uri, scopes jsonb, code_challenge null, expires_at (5 min), used_at`. Uso único (update `used_at is null` → retorna linha). |
| `POST /api/oauth/token` (público) | Precisa `express.urlencoded` nesta rota; aceitar credenciais do cliente no corpo **ou** Basic (o GPT tem opção "Token exchange method"). `grant_type=authorization_code` → cria/atualiza a conexão; `grant_type=refresh_token` → rotaciona. Resposta `{ access_token, token_type: 'bearer', expires_in, refresh_token, scope }`. Limite por IP. |
| Reaproveitar `fourbase_api_tokens` | Uma linha **por (usuário, cliente OAuth)** com `kind='oauth'`, `oauth_client`, `name='GPT fourbase'`. Colunas novas: `refresh_hash text unique`, `prev_refresh_hash text`, `prev_refresh_until timestamptz` (tolerância a retry do ChatGPT). Cada refresh **atualiza em lugar** `token_hash` e `expires_at` (ex.: +1 h) e rotaciona o refresh. Reconectar o mesmo usuário substitui os hashes da mesma linha — não acumula linhas, não bate no limite de 5 (que passa a contar só `kind='personal'`). |
| `assistantAuth` | **Inalterado** na lógica. Só `isTokenShape` passa a aceitar `fbo_` (access OAuth) além de `fbk_`. Revogar na tela = `revoked_at` → access e refresh morrem juntos. `last_used_at`, escopos, limite 120/min, `req.apiToken.id` → `token_id` no lote: tudo igual. |
| Contrato | Mesmo `openapi.json`. Se o editor do GPT exigir `securitySchemes` OAuth no schema, servir variante por query (`?auth=oauth`) — **incerto**, a autenticação costuma ser configurada na UI do GPT. Instruções do GPT = texto do `GET /api/assistant/setup`. |
| Pré-requisitos externos | Perfil de construtor verificado na OpenAI (domínio fourbase), página pública `/privacidade`, GPT publicado "por link" (e talvez loja). Fora do código, mas no caminho crítico. |
| Opcional | PKCE se o ChatGPT enviar `code_challenge` (incerto) — a coluna já fica prevista. |

### Fluxo
```
Gestor abre link do GPT → ChatGPT: "Entrar no fourbase"
  → GET  fourbase/conectar?client_id&redirect_uri&state      (SPA; login se preciso)
  → POST /api/oauth/authorize (JWT)  → 302 redirect_uri?code&state
ChatGPT → POST /api/oauth/token (code + client creds) → access fbo_… + refresh
ChatGPT → /api/assistant/* com Bearer fbo_… → assistantAuth (igual a hoje)
```

**Esforço relativo B:** ~2,5–3x o de A+ em código (2 rotas de servidor, 1 tela de consentimento, 1 tabela, 3 colunas, testes de segurança do fluxo), **mais** o prazo externo da verificação/publicação na OpenAI (não controlado por nós). Uma tabela de clientes OAuth genérica / registro dinâmico (para MCP) seria +1x e não é necessária agora.

## Apêndice 4 — Compatibilidade: como A evolui para B sem jogar trabalho fora

| Construído em A+ | Em B |
|---|---|
| `kind` em `fourbase_api_tokens` | linhas `oauth` entram na mesma tabela; a tela lista "Conexões" de qualquer tipo |
| `token_id` + `summary` nos lotes | histórico mostra "feito pelo GPT fourbase" ou "pelo token X" sem mudança |
| `GET status` / `GET activity` / undo JWT | idênticos |
| `GET /api/assistant/me` + "testar conexão" | idêntico (vira a 1ª chamada depois do consentimento) |
| `GET /api/assistant/setup` (instruções no servidor) | vira a fonte das instruções do GPT oficial; o passo "cole as instruções" some da tela |
| `assistantAuth` | só ganha o prefixo `fbo_` |
| Tela "Assistente" | o bloco "Configurar" troca o passo a passo de 6 etapas por um botão "Abrir o GPT fourbase"; o resto da tela (status, histórico) fica |

O token pessoal **não é removido** em B: continua como modo avançado (outros clientes de IA, GPT próprio, automações) e como plano de contingência se a publicação na OpenAI atrasar ou mudar de regra. Regras para manter a compatibilidade desde já: (1) mudanças no `openapi.json` só aditivas, sem renomear `operationId`; (2) nenhuma lógica nova dependente de `fbk_` além de `isTokenShape`; (3) toda decisão de "o que a conexão pode fazer" lida de `scopes` da linha, nunca do tipo do token.
