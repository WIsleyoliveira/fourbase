# Architect responde ao Strategist (Rodada 2: Desafio)

**Posição do Strategist:** fazer A mínimo (tela "Assistente", passo a passo com copiar, status por `last_used_at`, histórico com desfazer via JWT) em ~1,5 semana para o Evandro validar. Iniciar já as pendências externas de B (verificação de construtor, política de privacidade). Construir OAuth + GPT publicado só depois do gatilho (uso comprovado + 2º gestor à vista).

**Minha resposta:** **Modificar.** Aceito a sequência e o prazo. Recuo de quase toda a "preparação para B". Mantenho só o que, se faltar no dia do deploy, **perde dado** dos lotes que o Evandro criar. Esse dado não se recupera depois com migration aditiva.

## Raciocínio
O critério certo não é "preparar B agora ou depois". É **"isso custa caro mudar depois?"**. Coluna nova e nula numa tabela é sempre aditiva e barata, por isso `kind`, `oauth_client` e as colunas de refresh podem esperar a fase 2 sem retrabalho: a linha `personal` é o default implícito. Já o que o lote **precisa lembrar no momento da criação** (qual conexão o fez e como cada tarefa era ao nascer) não dá para reconstruir: depois do deploy, cada lote gravado sem isso fica "mudo" para sempre no histórico. E a etapa 1 não foi publicada, então mexer em `20261101000000_assistant_tokens.sql` agora custa zero. Há também um achado que reforça isso. O Skeptic pede que o desfazer não apague tarefas editadas depois. Em Postgres, `fourbase_tasks.updated_at` é só `default now()` (`20260806000000_base_schema.sql`), sem trigger, e `routes/tasks.js` não o atualiza no PATCH. Quem o atualiza é o mock local (`api/localDb.js:66`, `TIMESTAMPED`). Ou seja, "comparar `updated_at`" passaria nos testes e falharia em produção. A detecção precisa de um retrato salvo no próprio lote. Do lado das rotas, adoto os nomes do Oracle (`/me`, `batches`) e retiro meus `/status`, `/activity` e `/setup`: menos superfície, um recurso só ("lotes") com duas portas de autenticação.

## Manter / Modificar / Adiar, item por item

| # | Minha preparação (R1) | Decisão | Por quê |
|---|---|---|---|
| 1 | `token_id` em `fourbase_assistant_batches` | **Manter (agora)** | Não se reconstrói depois. Responde "qual GPT/token fez isto" e permite, na revogação, mostrar o que aquela conexão criou. |
| 2 | `summary jsonb` no lote | **Modificar → `items jsonb`** | Um retrato por tarefa (`id, title, due_date, due_date_end, due_time, column_key` + `fp` = hash desses campos e de `description/tags/attachments`). Daí saem o resumo (contagem, títulos, intervalo de datas, mesmo depois de desfeito) **e** o "não apagar o que foi editado" do Skeptic. Uma coluna resolve as duas coisas. |
| 3 | Índice `(user_id, created_at desc)` | **Manter (agora)** | É a consulta das duas rotas de histórico. Custo nulo. |
| 4 | `kind` + `oauth_client` em `fourbase_api_tokens` | **Adiar (fase 2)** | Aditivo depois (`default 'personal'`), sem retrabalho. Nada em A lê isso. |
| 5 | Colunas de refresh, `fourbase_oauth_codes`, rotas `/oauth/*` | **Adiar (fase 2)** | Só existem com B. Sigo de acordo com o gatilho do Strategist. |
| 6 | `GET /api/assistant/status` (JWT) | **Retirar** | A tela deriva o estado de `GET /api/assistant/tokens` (já devolve `last_used_at`) + 1º item do histórico. A derivação vira função pura no front (`src/assistantStatus.js`, testável). |
| 7 | `GET /activity` + `POST /activity/:id/undo` (JWT) | **Modificar → nomes do Oracle** | Mesmo recurso `batches`, mesmo formato de resposta nas duas portas (ver desenho abaixo). |
| 8 | `GET /api/assistant/me` (token) | **Manter** | Coincide com o `verificarConexao` do Oracle. É o "testar conexão" do item 4 do Strategist (a tela fica verde porque `/me` atualiza `last_used_at`). XS. |
| 9 | `GET /api/assistant/setup` (instruções no servidor) | **Adiar (fase 2)** | Em A as instruções podem ser texto estático no front. Viram fonte do servidor quando houver GPT oficial. |
| 10 | Refatorar o desfazer em `undoBatch()` único | **Manter** | Uma regra, duas portas. Sem isso, as regras de 48 h e "editadas ficam" divergem entre GPT e tela. |
| 11 | Regras de contrato (só aditivo, sem renomear `operationId`, decisões por `scopes`) | **Manter** | Custo zero, e é o que protege as N cópias do `openapi.json` até B existir. |

## O que muda AGORA dentro da migration não publicada

Editar `supabase/migrations/20261101000000_assistant_tokens.sql` (ainda não aplicada em produção), na criação de `fourbase_assistant_batches`:

```sql
create table if not exists fourbase_assistant_batches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  user_id      uuid not null references fourbase_users(id) on delete cascade,
  token_id     uuid references fourbase_api_tokens(id) on delete set null,   -- NOVO
  batch_id     text not null,
  task_ids     jsonb not null default '[]'::jsonb,                           -- mantido (código atual usa)
  items        jsonb not null default '[]'::jsonb,                           -- NOVO: retrato por tarefa
  undone_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, batch_id)
);
create index if not exists fourbase_assistant_batches_user_created_idx
  on fourbase_assistant_batches (user_id, created_at desc);                 -- NOVO
```

Formato de `items` (escrito em `POST /api/assistant/tasks`; no desfazer, cada item recebe `result`):
```ts
type BatchItem = {
  id: string; title: string;
  due_date: string | null; due_date_end: string | null; due_time: string | null;
  column_key: string;
  fp: string;                               // sha256 de title|description|due_*|column_key|tags|attachments na criação
  result?: 'removed' | 'kept_edited' | 'kept_moved' | 'gone';   // gravado pelo undo
}
```

Mudanças de código que acompanham (não são esquema, mas são "agora"):
1. `POST /api/assistant/tasks`: gravar `token_id: req.apiToken.id` e `items`. Espelhar `token_id`/`items` no shim (`api/localDb.js`) e em `tests/assistant-api.test.js`.
2. `undoBatch({ userId, workspaceId, batchId })`: apaga só a tarefa cujo `fp` atual == `fp` salvo e que ainda é do dono. As demais ficam com `result`. Resposta `{ undone, kept: [{ id, title, reason }] }`.
3. `assistantAuth` (`routes/assistant.js:127`): exigir `user.role === 'gestor'` (pedido do Skeptic), lido do banco como `status` já é. `POST /api/assistant/tokens` relê o usuário no banco antes de emitir.
4. `x-openai-isConsequential: true` em `criarTarefas` e `desfazerLote` no `buildOpenApi` (aditivo).

**Pode esperar sem retrabalho:** `kind`, `oauth_client`, `refresh_hash`/`prev_refresh_*`, `fourbase_oauth_codes`, `/oauth/authorize|token`, `express.urlencoded`, prefixo `fbo_` em `isTokenShape`, `/setup`. Todos são colunas nulas, tabelas novas ou rotas novas, aplicáveis numa migration `2026xxxx_assistant_oauth.sql` na fase 2.

## Desenho único de rotas (Oracle + Architect)

Um recurso (**lotes**) e uma conexão (**token**), com duas portas que **não se misturam**. Token nunca abre rota JWT, JWT nunca abre rota de token (invariante da etapa 1 preservado). As duas portas chamam as mesmas funções de serviço em `api/_lib/assistant.js`: `listBatches`, `undoBatch`, `toBatchView`.

```
                      serviço único (api/_lib/assistant.js)
                 listBatches · undoBatch · toBatchView · whoAmI
                    ▲                                   ▲
   PORTA GPT (Bearer fbk_…, assistantAuth)    PORTA TELA (JWT, auth + gestorOnly)
   ───────────────────────────────────────    ─────────────────────────────────────
   GET  /api/assistant/me          verificarConexao   GET    /api/assistant/tokens          (já existe; last_used_at = status)
   GET  /api/assistant/batches     listarLotes        GET    /api/assistant/app/batches     (histórico da tela)
   POST /api/assistant/batches/:id/undo  desfazerLote POST   /api/assistant/app/batches/:id/undo
   (agenda, clients, tasks/preview, tasks: iguais)    POST/DELETE /api/assistant/tokens     (já existem)
```

- **Por que `/app/` e não a mesma URL com dupla autenticação:** um middleware "aceita JWT ou token" é exatamente o tipo de atalho que quebra o invariante e complica o teste de isolamento. Um prefixo distinto custa 3 linhas e mantém `assistantAuth` intocado. As rotas `/app/*` são registradas **antes** de `/api/assistant/batches/:id/undo`, para não haver captura.
- **Mesmo formato nas duas portas:**
```ts
interface BatchView {
  batch_id: string; created_at: string;
  count: number; titles: string[];                  // até 5, de items
  date_range: { from: string; to: string } | null;
  undone_at: string | null; undo_until: string | null;   // created_at + 48 h; null se desfeito/expirado
}
// Porta GPT:  GET /api/assistant/batches?limit=10        → { batches: BatchView[] }
// Porta tela: GET /api/assistant/app/batches?limit=20&before=<ISO> → { batches: (BatchView & { connection: { id, name } | null; items: BatchItem[] })[]; next_before: string | null }
```
  A porta da tela só **acrescenta** `connection` e `items` (para mostrar "estas 2 foram editadas e serão mantidas" antes de confirmar, como pede o Skeptic). O GPT não precisa disso, e assim o contrato público fica menor.
- **`/me`** (`whoAmI`): `{ user_name, workspace_name, connection_name, today, timezone: 'America/Sao_Paulo', scopes, limits: { max_batch: 30, undo_hours: 48 } }`. É o formato do Oracle mais `connection_name`. Não precisa de rota JWT espelho.
- **Status na tela:** `deriveAssistantStatus(tokens, lastBatch, now)` puro → `nunca_configurado | aguardando_primeiro_uso | conectado | parado`. Polling de `GET /api/assistant/tokens` a cada 5 s, por até 2 min, enquanto o passo "teste a conexão" estiver aberto.
- **Em B nada disso muda:** `fbo_…` passa pela mesma porta GPT, e `connection.name` vira "GPT fourbase".

**Esforço adicional sobre o A do Strategist:** ~0,5 dia (duas colunas e um índice na migration, gravar `items`, `fp` no undo, checagem de papel). Cabe na 1,5 semana e remove dois retrabalhos: histórico sem dados e desfazer inseguro em produção.
