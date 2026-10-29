# Strategist: posição final (Rodada 3, Convergência). Assistente (ChatGPT) didático

## Recomendação revisada
Fazer **A antes de B**, sem desvio. A **Fase A** é a tela "Assistente" (gestor) em 4 passos, com aviso de privacidade curto, chave mascarada, passo "Compartilhar: Somente eu", status honesto baseado em evidência e histórico de lotes com desfazer seguro (com prévia). Ela sai em **~2 semanas** com uma migration não publicada já completa (`token_id`, `items`, índice), para que o Evandro configure sozinho e para que cada lote dele vire dado de decisão. Já na semana 1, e em paralelo, o dono do produto abre os bloqueadores de calendário de B: perfil de construtor verificado na OpenAI e URL pública de política de privacidade. A **Fase B** (GPT oficial "fourbase" + OAuth) só começa quando o gatilho medido for atingido, e precisa estar pronta antes do 2º cliente.

## Concessões feitas (escopo que voltou ou mudou)
1. **`items jsonb` no lugar de `summary`** (Architect). O retrato por tarefa com `fp` resolve o histórico (contagem, títulos, datas, inclusive depois de desfeito) e também o "não apagar o que foi editado". O fato verificado pesou: `fourbase_tasks.updated_at` não tem trigger em produção, então comparar `updated_at` passaria no mock (`api/localDb.js`) e falharia no Postgres. É uma coluna só e substitui duas soluções.
2. **`kind` vai para B** (Architect). Retiro minha posição da R2: coluna nula com `default 'personal'` é aditiva e sem backfill, e nada em A lê `kind`. O limite de 5 ativos continua contando todos os tokens, porque só existem tokens pessoais.
3. **Pacote de segurança do Skeptic entra em A**, +1 a 1,5 dia: `assistantAuth` exige papel gestor; `openapi.json` só a partir de `APP_URL`; `x-openai-isConsequential` nas escritas; passo "Somente eu" com caixa obrigatória; chave mascarada com "Já colei" que limpa a área de transferência; criar chave nova substitui a anterior. Eu tratava parte disso como polimento. É risco real: GPT compartilhado com chave embutida dá acesso de terceiros à agenda.
4. **Desfazer com prévia** (Advocate e Skeptic): "Serão removidas (3) / mantidas porque alguém mexeu (2)". Custa um modo `dry_run` no `undoBatch()`, que já será extraído. Sem a prévia, o desfazer é o único botão destrutivo da tela, e ele precisa ser confiável.
5. **Aviso de privacidade e registro do consentimento já em A** (Guardian). Guardo o evento (workspace, usuário, data, versão do aviso) desde já, porque é dado que não se reconstrói depois. Antes do 2º cliente ele seria obrigatório de qualquer forma.
6. **Status "Conectado" só com evidência** ("consultou sua agenda de 03/11 a 09/11"), não só por `last_used_at`. Custo XS: a tela já recebe o último lote e o `/me`.

## Divergência fechada: botão único vs caixa
Fico com a **caixa "Autorizo em nome da empresa" dentro do Passo 1, que habilita "Criar chave"**, com o aviso em 2 camadas do Advocate. Na prática são o mesmo gesto: um clique para quem já leu. A caixa dá prova mais clara de consentimento, sem passo extra. Ela aparece **1 vez por versão do aviso**. Isso fecha o ponto entre Guardian e Advocate sem custo de escopo.

## Inegociáveis
**Na Fase A (bloqueia o Evandro usar):**
- Migration `20261101000000_assistant_tokens.sql` **editada antes do 1º deploy** com `token_id`, `items` e o índice `(user_id, created_at desc)`, mais o registro do consentimento. É o único item cujo custo cresce depois do deploy. Não se corta.
- Os 4 passos com botões de copiar, "Somente eu" obrigatório e o teste real pelo GPT ("o que tenho essa semana?") que deixa a tela verde sozinha.
- Histórico com desfazer seguro: `fp`, prévia, 48 h, mesmo `undoBatch()` nas duas portas.
- `assistantAuth` exigindo gestor e `openapi.json` só com `APP_URL`.

**Fica fora de A, sem discussão:** OAuth, GPT publicado, MCP, editar ou apagar pelo GPT, notificações, funcionário usando o recurso, interruptor do workspace, log de leituras, `/setup` no servidor, `kind`.

## Notas de implementação
- **Ordem de construção** (dependências primeiro):
  1. Migration e gravação de `token_id`/`items` em `POST /api/assistant/tasks`, com espelho no `api/localDb.js` e em `tests/assistant-api.test.js`.
  2. Extrair o serviço `listBatches`/`undoBatch`/`whoAmI` em `api/_lib/assistant.js`.
  3. Rotas: porta GPT `/me`, `/batches`, `/batches/:id/undo`; porta tela `/app/batches`, `/app/batches/:id/undo?dry_run`.
  4. Endurecimentos em `routes/assistant.js`.
  5. Tela `/assistente` (`VIEW_KEYS`/`GESTOR_ONLY_VIEWS` em `src/routes.js`/`App.jsx`), movendo `AssistantTokensPanel`.
  6. `src/assistantStatus.js` (função pura e testada) e `src/assistant/gptInstructions.js` (`VERSION`).
  7. Release note com `cta` para `/assistente`.
- **Sem feature flag nova:** a tela é só de gestor e a branch não está publicada. O "rollout" é o próprio Evandro. Para os outros gestores, a tela só aparece no anúncio de Novidades **depois** que o Evandro passar no teste (1 dia de defasagem, controlado pelo release note).
- **Teste de aceitação com o Evandro:** sessão cronometrada, sem ajuda, com gravação de tela se ele aceitar. Anotar o passo em que ele travar. A Fase A.1 corrige exatamente esse passo.
- **Métricas sem telemetria nova:** tudo sai das tabelas existentes. Tokens criados, 1º `last_used_at`, lotes, lotes desfeitos e `items.result` (`kept_edited` indica que o GPT acertou mas o usuário ajustou). Uma consulta SQL salva no `docs/assistente-chatgpt.md` basta. Dashboard não entra.
- **Regra de contrato no `CLAUDE.md`:** só aditivo, sem renomear `operationId`, decisões lidas de `scopes`, nada dependente de `fbk_` fora de `isTokenShape`. Essa regra protege as cópias de `openapi.json` já importadas até B existir.

---

## Apêndice: plano por fases com escopo fechado

Esforço: XS < 0,5 d · S 0,5 a 1 d · M 2 a 3 d · L ~1 sem · XL 2+ sem.

### Fase A: antes do Evandro usar (~2 semanas, 9 a 10 dias úteis)

| # | Must | Esforço | Corte se apertar? |
|---|------|---------|-------------------|
| A1 | Migration não publicada: `token_id`, `items jsonb` (com `fp`), índice; tabela/colunas de consentimento (workspace, usuário, data, versão) | S | **Não** |
| A2 | `POST /tasks` grava `token_id` + `items`; shim local e testes atualizados | S | Não |
| A3 | Serviço `listBatches`/`undoBatch` (com `dry_run` e `fp`)/`whoAmI` | M | Não |
| A4 | Porta tela (JWT): `GET /app/batches`, `POST /app/batches/:id/undo` (com prévia) | S | Não (paginação `before` sim, ver cortes) |
| A5 | Porta GPT: `GET /me` (`today`, `timezone`, `limits`), `undo_until` na criação, `today`/`timezone` em agenda/prévia | S | Não |
| A6 | Endurecimento: `assistantAuth` exige gestor, `openapi.json` só com `APP_URL`, `x-openai-isConsequential` nas escritas | S | Não |
| A7 | Tela `/assistente` no menu (gestor), stepper de 4 passos, botões Copiar (URL, chave, instruções versionadas), prints por passo | M | Prints podem virar texto simples |
| A8 | Passo 1: aviso de privacidade em 2 camadas, caixa "Autorizo em nome da empresa" que habilita "Criar chave", chave mascarada, "Já colei" limpa a área de transferência, chave nova substitui a anterior | S | Não |
| A9 | Passo 4c: "Compartilhar: Somente eu" com caixa obrigatória + aviso "nunca compartilhe este GPT" | XS | Não |
| A10 | Status derivado (`src/assistantStatus.js`): Não configurado / Aguardando 1ª conversa / Conectado com evidência; polling de 5 s por até 2 min no passo de teste; "Desconectar" no cartão | S | Não |
| A11 | Histórico (últimos 20 lotes): data, nº de tarefas, títulos, intervalo, "Desfazer" com prévia de removidas/mantidas | S | Não |
| A12 | Frases prontas do dia a dia + bloco "Precisa de ChatGPT pago" + "o que pode e não pode fazer" | XS | Não |
| A13 | Release note em `src/releaseNotes.js` com `cta` → `/assistente` | XS | Pode ir no dia seguinte |
| A14 | Consulta SQL de adoção documentada em `docs/assistente-chatgpt.md` | XS | Sim (roda à mão) |

**Should (1º a cortar, nesta ordem, se o prazo apertar):**
1. `listarLotes` na porta GPT (`GET /api/assistant/batches`). Sem ele, o GPT só desfaz o que sabe na conversa; a tela continua desfazendo tudo. Economia de ~0,5 d.
2. Paginação `before` no histórico da tela (fica nos 20 últimos). Economia de ~0,25 d.
3. `description` refinada por operação no `openapi.json` (fica a mínima). Economia de ~0,25 d.
4. Prints por passo (ficam o texto e o botão copiar; os prints entram na A.1 se o Evandro travar). Economia de ~0,5 d.

**Não se corta mesmo com o prazo apertado:** A1, A3 com `fp`, A6, A8 e A9. Se cortar qualquer um deles, ou se perde dado irrecuperável, ou se abre risco de acesso de terceiros.

**Em paralelo, na semana 1 (dono do produto, calendário):** iniciar a verificação do perfil de construtor na OpenAI; redigir e publicar a política de privacidade (URL pública, ex.: `/privacidade`), a partir do aviso curto do Guardian.

### Fase A.1: logo após (1 a 3 dias, nas 2 semanas de uso)
- Corrigir o passo em que o Evandro travou: prints, vídeo/GIF de 60 s ou reescrita de texto (só o que o teste mostrou).
- Estado "Parado há > 14 dias" no status.
- `components.schemas` completos (respostas e erros) no `openapi.json`, com instrução de reimportar uma vez.
- Novas frases prontas tiradas do uso real e ajuste de `gptInstructions.js` (`VERSION` +1) se a taxa de desfazer indicar erro de datas.
- Itens Should cortados da Fase A, se tiverem sido cortados.

### Fase B: GPT oficial "fourbase" + OAuth (3 a 5 semanas + espera externa)
**Gatilho de início (precisa de todos):**
1. Evandro passou nos critérios da Fase A (abaixo).
2. ≥ 1 outro gestor ou cliente com intenção concreta de uso nos próximos 3 meses.
3. Pré-requisitos externos resolvidos ou com data: perfil de construtor **verificado** na OpenAI e **política de privacidade publicada** em URL pública.
4. Spike de 0,5 d concluído: Actions com OAuth ou app MCP no plano dos clientes-alvo. O spike decide a superfície; o servidor OAuth serve às duas.

**Escopo fechado:**
- Migration aditiva `2026xxxx_assistant_oauth.sql`: `kind`, `oauth_client`, `refresh_hash`, `prev_refresh_hash`, `prev_refresh_until`, `fourbase_oauth_codes`.
- `/oauth/authorize` (tela "Entrar no fourbase" + consentimento, que reaproveita o aviso versionado), `/oauth/token` (authorization code, PKCE, refresh com rotação e revogação), `redirect_uri` fixo da OpenAI, prefixo `fbo_` em `isTokenShape`.
- GPT "fourbase" publicado por link, com instruções fixas e versionadas (aí sim `/setup` ou equivalente no servidor, se houver consumidor).
- Exigências do Guardian e do Skeptic para B: seção "Empresa" com >1 gestor, interruptor do workspace, log de leituras (só metadados), auditoria completa, limite diário persistido, expiração, defesas adicionais contra prompt injection, checklist OAuth.
- A tela vira "Abrir o GPT fourbase → Entrar"; o token passa a "modo avançado" (mantido para quem já usa, sem remoção).

**Fora de B:** editar ou apagar tarefas pelo GPT, notificações dos lotes, funcionário usando o recurso. Entram só com pedido real de cliente.

### Critérios de sucesso mensuráveis
**Fase A (Evandro):**
- Configura **sozinho em ≤ 15 min**, da abertura de `/assistente` até "Conectado" com evidência, **0 pedidos de ajuda**.
- **1º lote em ≤ 24 h** após conectar.
- **≥ 3 lotes em 14 dias** e **taxa de lotes desfeitos < 25 %**. Acima disso, o problema é de instruções ou prévia (A.1 ajusta `gptInstructions.js`), não de onboarding.
- **0 incidentes** de tarefa em dono ou workspace errado; **0 GPTs** com compartilhamento diferente de "Somente eu" (confirmado com o Evandro).
- **0 tarefas editadas apagadas** pelo desfazer (`items.result` coerente com a prévia mostrada).

**Fase B (2º cliente em diante):**
- Conexão em **≤ 3 min**, só com link + "Entrar no fourbase", sem colar nada.
- **≥ 60 %** dos gestores que abrem `/assistente` chegam a "Conectado".
- **≥ 50 %** dos conectados criam ≥ 1 lote por semana no 1º mês.
- **0 pedidos de suporte** de configuração por cliente no 1º mês.

**Ponto de parada:** se depois de A.1 o Evandro não chegar a 3 lotes em 14 dias, **B não começa**. Faz-se uma entrevista de 30 min sobre o porquê (fluxo conversacional, confiança ou utilidade) antes de qualquer investimento em OAuth.
