# Posição final do Architect: Assistente (ChatGPT) didático (Rodada 3: Convergência)

**Recomendação revisada:** fazer **A agora para o Evandro e B antes do 2º cliente**. A fase A sai em uma única migration, a `20261101000000`, que ainda não foi publicada e por isso pode ser editada a custo zero. Ela tem 3 tabelas: tokens, lotes e um registro de autorizações só de inserção. Por cima dela fica um serviço único (`whoAmI`, `listBatches`, `planUndo`, `undoBatch`) com **duas portas que não se misturam**: a do GPT, via token `fbk_`, e a da tela, via JWT e só para gestor. Para B ficam só o emissor OAuth, uma migration aditiva e `isTokenShape` aceitando `fbo_`. A tela, o histórico e o desfazer não mudam em B.

## Pendências fechadas

| # | Pendência | Decisão | Motivo |
|---|---|---|---|
| 1 | `kind` agora ou em B | **Agora** (cedo ao Strategist): `kind text not null default 'personal' check (kind in ('personal','oauth'))` | Com a migration não publicada, custa zero. A fase A já usa o campo: o limite de 5 chaves ativas conta só `kind='personal'`. Trocar um `check` depois, com dados reais, custa mais que fazer agora. `oauth_client`, `refresh_hash`, `prev_refresh_*` e `fourbase_oauth_codes` continuam para B. |
| 2 | `summary` ou `items` | **Só `items jsonb`**, um retrato por tarefa com `fp`. **Sem** coluna `summary` | Uma fonte só. O resumo da tela (contagem, títulos, intervalo de datas, inclusive depois de desfazer) é **derivado** em `toBatchView(items)`, uma função pura e testável. Uma coluna `summary` separada seria um dado duplicado que pode divergir. O `fp` é a única forma de saber se uma tarefa foi editada, porque em Postgres `fourbase_tasks.updated_at` não tem trigger (`20260806000000_base_schema.sql`) e só o mock o atualiza (`api/localDb.js`, `TIMESTAMPED`). `task_ids` fica, por compatibilidade com o código atual. |
| 3 | `/setup` no servidor ou instruções versionadas no front | **Front versionado**: `src/assistant/gptInstructions.js` exporta `GPT_INSTRUCTIONS_VERSION = '1.0'` e `GPT_INSTRUCTIONS` | Na fase A o único consumidor é o botão "Copiar instruções". Em B as instruções vão uma vez para o GPT oficial, sem rota. Regra de implementação: o módulo **nunca** interpola a chave, e um teste garante isso. |
| 4 | Registro de autorização (Guardian): coluna ou tabela | **Tabela `fourbase_assistant_consents`**, só de inserção, com eventos `authorized`, `disconnected` e `workspace_disabled` | Uma coluna no token perde a história: não registra o desligamento, nem a reautorização a cada nova versão do aviso, nem o desligamento do workspace inteiro que o Guardian exige em B. Uma tabela de eventos responde "quem autorizou o quê, quando, com qual versão do aviso" e é aditiva para B. Também fecha a divergência entre Guardian e Advocate: **um só gesto**, o botão "Autorizo e criar chave", faz um `POST /api/assistant/tokens` com `notice_version`, e o servidor grava o evento e a chave na mesma requisição. Sem `notice_version` válido, responde 400. |
| 5 | Validade padrão de 365 dias | **Sim.** O servidor aplica 365 dias quando `expires_days` vem vazio (a faixa 1..730 continua). A coluna fica `expires_at not null` | "Chave eterna" deixa de existir no esquema, e B também expira. Não existem linhas antigas para migrar, porque a migration não foi publicada. |
| 6 | Papel gestor no `assistantAuth` | **Sim, na fase A.** `user.role !== 'gestor'` responde 401 com a mesma mensagem de "chave desligada" | Lido do banco, como `status` já é. A emissão em `POST /tokens` passa a reler o usuário no banco, porque o JWT vale 7 dias e não basta. Revogar as chaves ao rebaixar ou desativar alguém, em `routes/members.js`, fica para B; na fase A a checagem no middleware já corta o acesso. |
| 7 | `openapi.json` só com `APP_URL` | **Sim.** Sem `APP_URL`, responde `503 { error: 'Configuração indisponível' }`, e `req.get('host')` sai do código | A tela também lê o endereço de `APP_URL`, que vem do servidor em `GET /api/assistant/tokens` como `openapi_url`, e não do `window.location`. |
| 8 | `isConsequential` | `true` em `criarTarefas` e `desfazerLote`. `false` explícito em `verificarConexao`, `verAgenda`, `listarClientes`, `prever` e `listarLotes` | Assim o "Sempre permitir" só aparece nas leituras, e toda escrita pede confirmação. |

## Concessões feitas
- **`kind` entra agora** (era "adiar"). O Strategist mostrou uma regra da fase A que depende dele.
- **Sem rotas `/status`, `/activity` e `/setup`.** O status é derivado no cliente (`src/assistantStatus.js`), e os nomes das rotas seguem o Oracle (`me`, `batches`).
- **Prévia do desfazer sem rota pública nova para o GPT.** A prévia existe só na porta da tela (pedido do Advocate). O GPT recebe a mesma divisão (removidas e mantidas) na resposta do próprio desfazer.
- **Log de leituras e interruptor do workspace ficam para B.** Na fase A entra só `last_activity`, que guarda os metadados da última chamada e é sobrescrito a cada uso, então não é um log. É o que dá ao selo a evidência "consultou sua agenda de 03/11 a 09/11" sem criar uma tabela nova.

## Inegociáveis
1. **`items` com `fp` gravado na criação do lote.** Sem isso, o "não apagar o que alguém editou" passaria nos testes (mock) e falharia em produção. Não se reconstrói depois.
2. **`token_id` no lote e o registro de autorização desde o 1º lote.** Lote gravado sem eles fica "mudo" para sempre.
3. **Duas portas separadas.** O token nunca abre uma rota de JWT, e o JWT nunca abre uma rota de token. Nada de middleware "aceita os dois". As rotas `/app/*` ficam registradas antes de `/api/assistant/batches/:batchId/undo`.
4. **Uma regra de desfazer** (`planUndo` + `undoBatch` em `api/_lib/assistant.js`, com acesso a dados injetado). As duas portas chamam essas funções, e as regras de 48 h e de "editadas ficam" não podem divergir.
5. **Isolamento por `user_id` e `workspace_id` em toda consulta de lote.** Hoje `loadBatch` filtra só por `user_id` (`routes/assistant.js:215`), e isso precisa ser corrigido.
6. **Contrato só aditivo**: não renomear `operationId`, e as decisões saem de `scopes`, não do prefixo do token.

## Notas de implementação
- **Formato de `items` e `fp`:**
  ```ts
  type BatchItem = {
    id: string; title: string;
    due_date: string|null; due_date_end: string|null; due_time: string|null;
    column_key: string;
    fp: string; // sha256 de JSON canônico (chaves ordenadas, arrays ordenados) dos campos editáveis
    result?: 'removed' | 'kept_edited' | 'kept_moved' | 'kept_done' | 'kept_reassigned' | 'gone';
  }
  ```
  Campos do `fp`: `title, description, priority, due_date, due_date_end`, os horários (com os nomes reais do schema/`taskView`), `column_key, assigned_to, client_id, tags, mentioned_users, attachments, logged_time_seconds`. O cronômetro conta como trabalho humano. Ponha `taskFingerprint(task)` em `api/_lib/assistant.js` e use a **mesma função** na criação e no desfazer, aplicada à linha relida do banco **depois** do insert (default de colunas incluído).
- **Motivo, quando o `fp` difere:** se `column_key='done'`, o motivo é `kept_done`. Se a coluna mudou, `kept_moved`. Se `assigned_to` não é mais o dono, `kept_reassigned`. Senão, `kept_edited`. Se a tarefa não existe mais, `gone` (não conta como mantida).
- **Corrida entre a prévia e a confirmação:** a tela manda `only_ids` (a lista "serão removidas" que o usuário viu). O servidor apaga `only_ids ∩ (ainda inalteradas agora)`, então nunca apaga mais do que o usuário confirmou. A resposta traz o que de fato aconteceu.
- **`DELETE` com guarda:** `.in('id', toRemove).eq('workspace_id', ws).eq('assigned_to', userId)`, como hoje. Depois grava `undone_at` e `items[].result` num único `update`.
- **Chave nova substitui a anterior:** `POST /tokens` aceita `replaces: <token_id>`. Na mesma requisição, revoga essa chave e grava `disconnected` com `reason: 'replaced'`. Isso é validado como sendo do próprio usuário, senão responde 404.
- **`last_activity`:** é atualizado em melhor esforço pelo handler, depois de responder, no mesmo `update` de `last_used_at`, para não gerar um segundo round-trip. Formato: `{ op: 'verAgenda'|'listarClientes'|'prever'|'criarTarefas'|'desfazerLote'|'verificarConexao'|'listarLotes', from?, to?, count? }`. Nunca guarda título ou descrição.
- **Shim local** (`api/localDb.js`): registrar `fourbase_assistant_consents` em `WORKSPACE_SCOPED` e `TIMESTAMPED`. Os campos novos dos tokens (`kind`, `last_activity`) e dos lotes (`token_id`, `items`) entram no seed shape. Ao ser revogado, o `token_id` não vira nulo no mock, porque não existe `on delete set null` (o token é revogado, nunca apagado), então não há divergência.
- **Status no cliente:** `deriveAssistantStatus(tokens, lastBatch, now)` devolve `nunca_configurado | aguardando_primeiro_uso | conectado | sem_uso_30d | desligado`. O estado "conectado" exige que `last_used_at` seja posterior ao `created_at` daquela chave. Durante o passo de teste, a tela faz polling de `GET /tokens` a cada 5 s por no máximo 2 min.
- **Deploy:** a migration é aditiva e as tabelas são novas. Siga a ordem de `docs/deploy-runbook.md`. Antes de editar o arquivo, confirme que a `20261101000000` não foi aplicada em nenhum banco compartilhado (preview ou staging). Se foi, aplique lá um `drop` das 2 tabelas e recrie.

---

## Apêndice final e definitivo

### 1. Migration revisada: `supabase/migrations/20261101000000_assistant_tokens.sql` (substitui o conteúdo atual)

```sql
-- Assistente (ChatGPT): conexões (tokens), lotes de tarefas criados por ele e registro de autorizações.
--
-- Aditiva: só cria tabelas novas. Nada em dados existentes muda. O código novo funciona sem elas
-- (as rotas do assistente respondem erro, o resto do app não é afetado).
--
-- fourbase_api_tokens: uma "conexão do assistente". O token NUNCA é guardado, só o hash SHA-256
--   (token_hash) e o prefixo para reconhecer na lista. kind='personal' = chave fbk_ colada pelo gestor;
--   kind='oauth' fica reservado para o GPT oficial (fase B, colunas de refresh numa migration futura).
--   Toda chave expira (padrão 365 dias, aplicado pela API). last_activity = metadados da ÚLTIMA chamada
--   (operação e período), sobrescrito a cada uso; não é log e nunca contém título/descrição.
-- fourbase_assistant_batches: cada lote criado pelo assistente. (user_id, batch_id) é único (idempotência).
--   token_id = qual conexão criou. items = retrato de cada tarefa na criação, com fp (hash dos campos
--   editáveis): o desfazer só apaga tarefas cujo fp atual é igual ao salvo (updated_at NÃO serve: não há
--   trigger em fourbase_tasks). O resumo do histórico é derivado de items.
-- fourbase_assistant_consents: eventos só de inserção. Quem autorizou o envio de dados ao ChatGPT, quando,
--   com qual versão do aviso; e quando desligou. Prova de autorização (LGPD, instrução do controlador).

create table if not exists fourbase_api_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references weflow_workspaces(id) on delete cascade,
  user_id       uuid not null references fourbase_users(id) on delete cascade,
  kind          text not null default 'personal' check (kind in ('personal', 'oauth')),
  name          text not null check (char_length(name) between 1 and 60),
  token_hash    text not null unique,
  prefix        text not null,
  scopes        jsonb not null default '["agenda:read","agenda:write"]'::jsonb
                  check (jsonb_typeof(scopes) = 'array'),
  last_used_at  timestamptz,
  last_activity jsonb check (last_activity is null or jsonb_typeof(last_activity) = 'object'),
  revoked_at    timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  check (expires_at > created_at)
);

-- lista de conexões do gestor e contagem de ativas
create index if not exists fourbase_api_tokens_user_idx
  on fourbase_api_tokens (user_id, created_at desc);
-- (fase B) "quais gestores do workspace estão conectados"
create index if not exists fourbase_api_tokens_workspace_active_idx
  on fourbase_api_tokens (workspace_id) where revoked_at is null;

create table if not exists fourbase_assistant_batches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  token_id     uuid references fourbase_api_tokens(id) on delete set null,
  batch_id     text not null check (batch_id ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  task_ids     jsonb not null default '[]'::jsonb check (jsonb_typeof(task_ids) = 'array'),
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  undone_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, batch_id)
);

-- histórico (as duas portas): por usuário, mais recentes primeiro, cursor "before"
create index if not exists fourbase_assistant_batches_user_created_idx
  on fourbase_assistant_batches (user_id, created_at desc);
-- FK com on delete set null + "o que esta conexão criou"
create index if not exists fourbase_assistant_batches_token_idx
  on fourbase_assistant_batches (token_id) where token_id is not null;

create table if not exists fourbase_assistant_consents (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references weflow_workspaces(id) on delete cascade,
  user_id        uuid references fourbase_users(id) on delete set null,
  token_id       uuid references fourbase_api_tokens(id) on delete set null,
  event          text not null check (event in ('authorized', 'disconnected', 'workspace_disabled')),
  notice_version text check (event <> 'authorized' or notice_version is not null),
  reason         text check (reason is null or reason in ('user', 'replaced', 'expired', 'role_change', 'workspace')),
  created_at     timestamptz not null default now()
);

create index if not exists fourbase_assistant_consents_ws_created_idx
  on fourbase_assistant_consents (workspace_id, created_at desc);
create index if not exists fourbase_assistant_consents_user_idx
  on fourbase_assistant_consents (user_id, created_at desc);

-- Só de inserção: impede update/delete mesmo pela service_role (a API nunca edita eventos).
-- Exceção: os "on delete set null"/"cascade" das FKs continuam funcionando, porque o trigger só barra
-- UPDATE que mude colunas além de user_id/token_id e DELETE direto fora de cascata não é usado pela API.
create or replace function fourbase_assistant_consents_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (
       new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.event is distinct from old.event or new.notice_version is distinct from old.notice_version
    or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at) then
    raise exception 'fourbase_assistant_consents é só de inserção';
  end if;
  return new;
end $$;

drop trigger if exists fourbase_assistant_consents_append_only on fourbase_assistant_consents;
create trigger fourbase_assistant_consents_append_only
  before update on fourbase_assistant_consents
  for each row execute function fourbase_assistant_consents_append_only();

-- RLS ligado e SEM policies: só a API (service_role) alcança as tabelas, como nas demais.
-- (A migration 20261002000000 só varreu as tabelas que existiam quando rodou.) Nunca criar policy permissiva.
alter table fourbase_api_tokens          enable row level security;
alter table fourbase_assistant_batches   enable row level security;
alter table fourbase_assistant_consents  enable row level security;
```

Observação: a função de trigger não precisa de `security definer` (roda como quem escreve). O mock local não executa trigger nem `check`, e a API nunca faz `update` ou `delete` em consents, o que é coberto por teste.

### 2. Rotas finais

Serviço único em `api/_lib/assistant.js`: `whoAmI`, `listBatches`, `toBatchView`, `taskFingerprint`, `planUndo`, `undoBatch`. O acesso a dados é injetado, então tudo é testável sem rede.

**Tipos comuns**
```ts
interface BatchView {
  batch_id: string; created_at: string;
  count: number; titles: string[];                     // até 5, de items
  date_range: { from: string; to: string } | null;
  undone_at: string | null;
  undo_until: string | null;                           // created_at + 48 h; null se desfeito/expirado
}
interface UndoResult {
  undone: number;                                      // quantas foram removidas agora
  removed: { id: string; title: string }[];
  kept: { id: string; title: string; reason: 'edited'|'moved'|'done'|'reassigned' }[];
  gone: number;                                        // já não existiam
  already_undone?: true;
}
// Erros (todas as rotas): { error: string } com 400/401/403/404/409/429/503.
```

**Porta GPT** (Bearer `fbk_…`, `assistantAuth(scope)`, exige gestor ativo, 120/min por token)

| Método e rota | operationId | Escopo | Entrada | Saída |
|---|---|---|---|---|
| GET `/api/assistant/openapi.json` | — | público | — | contrato; 503 sem `APP_URL` |
| GET `/api/assistant/me` **(nova)** | `verificarConexao` | `agenda:read` | — | `{ user_name, workspace_name, connection_name, today, timezone:'America/Sao_Paulo', scopes, limits:{ max_batch:30, undo_hours:48, max_agenda_days:62 } }` |
| GET `/api/assistant/agenda?from&to` | `verAgenda` | read | igual | igual + `today`, `timezone` (aditivo) |
| GET `/api/assistant/clients` | `listarClientes` | read | — | igual |
| POST `/api/assistant/tasks/preview` | `prever` | write | igual | igual + `today`, `timezone` |
| POST `/api/assistant/tasks` | `criarTarefas` | write | `{ batch_id, tasks[] ≤30 }` | igual + `undo_until`; grava `token_id` e `items` |
| GET `/api/assistant/batches?limit=10` **(nova)** | `listarLotes` | read | `limit` 1..20 | `{ batches: BatchView[] }` |
| POST `/api/assistant/batches/:batchId/undo` | `desfazerLote` | write | — | `UndoResult` (regra nova: mantém as editadas); 400 após 48 h; 404 se não é do usuário/workspace |

**Porta tela** (JWT, `auth` + `gestorOnly`; todas filtram `user_id` e `workspace_id` do JWT)

| Método e rota | Entrada | Saída |
|---|---|---|
| GET `/api/assistant/tokens` (existe) | — | `{ tokens: [{ id, name, kind, prefix, created_at, last_used_at, last_activity, expires_at, revoked_at }], openapi_url: string\|null, notice: { accepted_version: string\|null } }` (campos **aditivos**: `kind`, `last_activity`, `openapi_url`, `notice`) |
| POST `/api/assistant/tokens` (muda) | `{ name?, notice_version: string (obrigatório), replaces?: uuid, expires_days?: 1..730 }` | 201 `{ id, name, prefix, expires_at, created_at, token }`. Relê o usuário no banco (gestor e ativo); padrão de 365 dias; grava `authorized` (e `disconnected/replaced` se houver `replaces`); o limite de 5 conta só `personal`. Erros: 400 sem `notice_version`, 404 se `replaces` não é seu |
| DELETE `/api/assistant/tokens/:id` (muda) | — | 204; grava `disconnected/user` |
| GET `/api/assistant/app/batches?limit=20&before=<ISO>` **(nova)** | `limit` 1..50, `before` opcional | `{ batches: (BatchView & { connection: { id, name } \| null; items: BatchItem[] })[], next_before: string\|null }` |
| GET `/api/assistant/app/batches/:batchId/undo-plan` **(nova)** | — | `{ remove: {id,title,due_date}[], keep: {id,title,reason}[], gone: number, undo_until }`; 400 após 48 h, 404 fora do escopo, 200 com `already_undone:true` se já foi desfeito |
| POST `/api/assistant/app/batches/:batchId/undo` **(nova)** | `{ only_ids: uuid[] }` (a lista "serão removidas" exibida) | `UndoResult`; remove `only_ids ∩ inalteradas agora` |

Ordem de registro em `routes/assistant.js`: as rotas `/api/assistant/app/*` vêm antes de `/api/assistant/batches/:batchId/undo`.

### 3. Mudanças no `openapi.json` (`buildOpenApi`, todas aditivas)
1. `servers[0].url` sai **só** de `APP_URL`. A rota responde 503 sem ele, e o `req.get('host')` é removido.
2. Novas operações: `GET /api/assistant/me` (`verificarConexao`) e `GET /api/assistant/batches` (`listarLotes`, com parâmetro `limit`).
3. `x-openai-isConsequential: true` em `criarTarefas` e `desfazerLote`; `false` em `verificarConexao`, `verAgenda`, `listarClientes`, `prever` e `listarLotes`.
4. `description` curta em cada operação, por exemplo: `desfazerLote` diz "Só quando o usuário pedir explicitamente. Tarefas já editadas, concluídas ou movidas são mantidas e voltam em `kept`". E `criarTarefas` diz "Só depois de mostrar a lista e o usuário confirmar; use sempre o mesmo `batch_id` ao repetir".
5. Respostas documentadas (nível mínimo agora): `today`/`timezone` em `verAgenda` e `prever`, `undo_until` em `criarTarefas`, o esquema `UndoResult` em `desfazerLote` e o esquema de erro `{ error }`. `components.schemas` completos ficam para a versão 1.1.
6. `info.version` vai para `1.1.0`. Nenhum `operationId` é renomeado e nenhum campo sai.

### 4. Testes a escrever (`node:test`)
**`tests/assistant-api.test.js` (ampliar)**
1. Criar lote grava `token_id = req.apiToken.id` e um `items[]` com `fp` para cada tarefa.
2. Undo pela porta GPT: com uma tarefa intacta e outras editada, movida, concluída e reatribuída, só a intacta é removida, e `kept` traz o `reason` certo. `items[].result` é gravado.
3. Undo é idempotente: a 2ª chamada responde `already_undone`. Depois de 48 h, 400.
4. Undo pela porta tela com `only_ids`: uma tarefa editada entre a prévia e a confirmação **não** é removida, e um id fora de `only_ids` nunca é removido.
5. `undo-plan` não altera nada: as tarefas e o `undone_at` continuam iguais depois da chamada.
6. `GET /me` devolve `today`, `timezone`, `limits` e `connection_name`, e atualiza `last_used_at` e `last_activity`.
7. `GET /batches` (GPT) e `GET /app/batches` (tela) devolvem o mesmo `BatchView` para o mesmo lote. A da tela acrescenta `connection` e `items`. A paginação com `before`/`next_before` funciona.
8. `last_activity` nunca contém título ou descrição.
9. Gestor rebaixado a funcionário: a chave recebe 401 em todas as rotas. Usuário inativo: 401.
10. `POST /tokens` sem `notice_version` responde 400. Com ele, cria a chave e um evento `authorized` com essa versão. `replaces` revoga a anterior e grava `disconnected/replaced`. `replaces` de outro usuário responde 404.
11. `expires_at` padrão = criação + 365 dias (±1 min). Uma chave vencida recebe 401.
12. O limite de 5 ativas conta só `kind='personal'`, e as revogadas ou vencidas não contam.
13. `DELETE /tokens/:id` grava `disconnected/user`. Nenhuma rota faz update ou delete em `fourbase_assistant_consents`.
14. `openapi.json`: sem `APP_URL` responde 503. Com ele, `servers[0].url === APP_URL` mesmo com um `Host` forjado. `isConsequential` está correto nas 7 operações. Os `operationId` antigos continuam presentes.
15. Invariante das portas: o token `fbk_` recebe 401 em `/app/*` e `/tokens`, e o JWT recebe 401 em `/me`, `/batches`, `/agenda` e `/tasks`. Funcionário com JWT recebe 403 em `/app/*`.

**`tests/workspace-isolation.test.js` (ampliar)**
16. Um gestor do workspace B não lista, não planeja e não desfaz um lote do workspace A (404), nem pela porta GPT nem pela porta tela, mesmo usando o mesmo `batch_id`. Isso cobre a correção do `loadBatch` (que passa a filtrar `user_id` **e** `workspace_id`).

**Testes puros**
17. `tests/assistant-fingerprint.test.js`: `taskFingerprint` é estável sob reordenação de `tags`, `attachments` e `mentioned_users` e muda a cada campo editável. O cálculo de `reason` segue a precedência done > moved > reassigned > edited.
18. `tests/assistant-batch-view.test.js`: `toBatchView` calcula `count`, `titles` (≤5), `date_range` (inclusive com `due_date_end`) e `undo_until` (null se desfeito ou expirado).
19. `tests/assistantStatus.test.js`: `deriveAssistantStatus` cobre os 5 estados, e "conectado" exige `last_used_at > created_at` da chave atual.
20. `tests/gptInstructions.test.js`: as instruções existem, têm `VERSION` e não contêm `fbk_` nem placeholder de chave.
21. `tests/localdb-operators.test.js` (ampliar): o shim conhece `fourbase_assistant_consents`, que é escopada por workspace e tem timestamp.
