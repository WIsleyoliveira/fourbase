# Strategist responde ao Architect (Rodada 2: Desafio)

**Posição do Architect, em uma frase:** fazer A+ agora (tela, status, histórico com desfazer), mas já com uma migration aditiva (`kind`, `oauth_client`, `token_id`, `summary`, índice), rotas JWT `status`/`activity`/`undo`, `GET /api/assistant/me`, `GET /api/assistant/setup` servindo as instruções e um contrato que só cresce, para que B seja só uma nova forma de emitir a mesma linha em `fourbase_api_tokens`.

**Minha resposta:** **Modificar.** Aceito a maior parte, porque quase tudo cai em itens que eu já tinha como Must (5: histórico + desfazer; 3/4: status + teste via GPT). O fato que muda minha conta: a migration `20261101000000_assistant_tokens.sql` **ainda não foi para produção**. Mexer no esquema agora custa minutos. Depois do deploy, cada coluna vira `ALTER` em produção, mais backfill de lotes antigos sem `token_id`/`summary`, e a tela fica com um ramo "conexão desconhecida" para sempre. Corto só o que é especulativo (só tem valor se B acontecer) **e** custa o mesmo para adicionar depois.

**Raciocínio:** o critério é o custo de adiar, não o custo de fazer. Entram já, editando a migration não publicada e sem criar outra, as colunas que mudam o que a tela de A mostra (`token_id`, `summary`, índice) ou uma regra de A (`kind` define o que conta no limite de 5). Assim os primeiros lotes do Evandro já nascem completos, e é justamente esse histórico que mede o gatilho de B (≥ 3 lotes em 14 dias, desfazer < 25 %). As colunas que só B usa (`oauth_client`, `refresh_hash`, `prev_refresh_*`) custam o mesmo `ALTER ... add column` aditivo hoje ou daqui a 2 meses, sem backfill (as linhas `personal` ficam nulas). Colocá-las agora é adivinhar o desenho do OAuth antes do spike que decide a superfície (Actions ou MCP). Nas rotas vale a mesma lógica: `me`, `activity` e o undo JWT são o próprio MVP, enquanto `status` como rota separada e `setup` servindo texto são luxo em A. O resultado custa +1,5 a 2 dias sobre a minha estimativa e elimina o retrabalho estrutural que o Architect apontou.

---

## Item a item

| # | Proposta | Decisão | Por quê / como |
|---|---|---|---|
| 1 | `token_id uuid references fourbase_api_tokens(id) on delete set null` em `fourbase_assistant_batches` | **Manter (entra já)** | Sem ele, não dá para dizer "qual conexão fez isto", e isso não se recupera depois. XS: uma coluna + `token_id: req.apiToken.id` na reserva em `POST /api/assistant/tasks`. |
| 2 | `summary jsonb` (`count`, `titles[≤5]`, `first_date`, `last_date`) | **Manter (entra já)** | É o que a tela de histórico mostra, inclusive depois de desfazer (as tarefas somem). Sem ele, o histórico precisa ler as tarefas ou fica vazio. Gravar junto com `task_ids`. XS. |
| 3 | Índice `(user_id, created_at desc)` em lotes | **Manter (entra já)** | Uma linha, e é exatamente a query do histórico. Custo zero. |
| 4 | `kind text not null default 'personal' check (...)` em tokens | **Manter (entra já)** | Custo zero agora, e já define uma regra de A: o máx. de 5 ativos conta só `kind='personal'`. Evita mudar a constraint depois, com dados reais. |
| 5 | `oauth_client text` | **Adiar para B** | Só vale com OAuth. Adicionar depois é aditivo (nulo para `personal`, sem backfill). Entra na migration de B junto com `refresh_hash`/`prev_refresh_*`, desenhada depois do spike. |
| 6 | Migration nova para essas colunas | **Modificar** | Não criar um segundo arquivo: **editar `20261101000000_assistant_tokens.sql`** direto nos `create table`. Evita `alter` sobre tabela recém-criada e deixa um único arquivo para revisar. Condição: confirmar que a migration não foi aplicada em nenhum banco compartilhado (staging/preview). Se foi, recriar só lá. |
| 7 | `GET /api/assistant/activity` (JWT, cursor `before`) | **Manter, simplificado** | É o meu item 5. MVP: `limit=20`, sem paginação na UI ("ver mais" fica como fast-follow). O contrato já aceita `before`, para não mudar depois. |
| 8 | `POST /api/assistant/activity/:batchId/undo` (JWT) + extrair `undoBatch()` | **Manter** | Também é o item 5. Uma regra, duas portas, como ele propõe. Preserva o invariante "JWT não abre rota de dados do token". |
| 9 | `GET /api/assistant/status` com 4 estados | **Modificar** | Em A, `GET /api/assistant/tokens` já devolve `last_used_at`. A tela calcula o estado no cliente, com 3 estados: "Ainda não configurado", "Aguardando a 1ª conversa", "Conectado · último uso há X". O estado "Parado > 14 dias" fica para o fast-follow. Se o Architect fizer questão da rota, aceito como XS, desde que devolva só agregados do que já existe (sem tabela nova). Polling de 5 s só com a tela aberta. |
| 10 | `GET /api/assistant/me` (`verificarConexao`) | **Manter (Must)** | Destrava o "testar conexão" (meu item 4). Com o `today`/`timezone` que o Oracle pediu, ataca o maior risco de qualidade: datas relativas. XS, aditivo no `openapi.json`. |
| 11 | `GET /api/assistant/setup` servindo instruções | **Adiar / Modificar** | A "fonte única no servidor" só tem valor em B, e lá as instruções são coladas uma vez pelo fourbase no GPT oficial, sem rota. Em A basta um módulo versionado (ex.: `src/assistant/gptInstructions.js` com `VERSION = '1.0'` e o texto do Apêndice 1 do Oracle), importado pelo botão "Copiar". Se B tiver consumidor real, a rota é XS sobre o mesmo módulo. |
| 12 | Contrato só aditivo (sem renomear `operationId`; lógica lida de `scopes`; nada dependente de `fbk_` além de `isTokenShape`) | **Manter** | Custo zero, é disciplina. Registrar como regra no `CLAUDE.md` (seção Assistente). |
| 13 | (Oracle) `GET /api/assistant/batches` no contrato do token (`listarLotes`) | **Manter como Should** | Mesma query da `activity`, por outra porta. Resolve "desfaz o que você criou ontem" numa conversa nova. É o 1º corte se A atrasar. |
| 14 | (Oracle) melhorias no `openapi.json` | **Dividir** | Já (XS somados): `today`/`timezone` em `agenda`/`preview`, `undo_until` na criação, `x-openai-isConsequential` em `criarTarefas`/`desfazerLote`, `description` curta por operação. Na 1.1 (S): `components.schemas` completos de resposta e de erros. O Evandro reimporta uma vez de qualquer forma, e o contrato é aditivo. |

## O que entra já no esquema não publicado

```sql
-- dentro do create table fourbase_api_tokens
kind text not null default 'personal' check (kind in ('personal','oauth')),
-- dentro do create table fourbase_assistant_batches
token_id uuid references fourbase_api_tokens(id) on delete set null,
summary  jsonb,
-- após a tabela
create index if not exists fourbase_assistant_batches_user_created_idx
  on fourbase_assistant_batches (user_id, created_at desc);
```

**Fica para a migration de B:** `oauth_client`, `refresh_hash`, `prev_refresh_hash`, `prev_refresh_until` e `fourbase_oauth_codes`. Tudo aditivo e anulável, sem backfill. O desenho depende do spike Actions ou MCP.

## Estimativa revisada da fase A

| Bloco | Antes | Agora |
|---|---|---|
| Esquema (`kind`, `token_id`, `summary`, índice) + gravação na criação | n/a | +0,5 d |
| `me` + `today`/`timezone`/`undo_until` + `isConsequential` + descrições | parte do item 4 | +0,5 d |
| `activity` + undo JWT com `undoBatch()` extraído | M (2 a 3 d) | M (2 a 3 d), igual |
| `listarLotes` no contrato (Should) | n/a | +0,5 d (cortável) |
| `status` calculado no cliente; `setup` vira módulo no front | n/a | 0 (economia frente à proposta) |
| Restante (tela, passo a passo, frases, avisos, Novidades, métricas) | igual | igual |

**Fase A: de ~1,5 semana para ~1,5 a 2 semanas (+1,5 a 2 dias).** Se precisar cortar, a ordem é: `listarLotes`, depois o refinamento de descrições e `isConsequential`, depois a paginação do histórico. **O esquema não se corta**, porque é o único item cujo custo cresce depois do deploy.

## Implicação para B
B fica exatamente com o que o Architect previu: emissor OAuth, 1 migration aditiva e `isTokenShape` aceitando `fbo_`. A tela, o histórico, o `me` e o undo não mudam. Na tela de A entra ainda, como Must XS, o aviso "nunca compartilhe este GPT" (Oracle), que é o risco real de segurança do modo token.
