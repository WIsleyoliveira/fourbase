# Design Document: Assistente (ChatGPT) didático para o gestor

Sessão do Conselho `assistente-chatgpt-didatico-20261028-2123` · 2026-10-28 · Advocate, Architect, Strategist, Oracle, Skeptic, Guardian.
Detalhes completos (textos, SQL, checklists) estão nas posições finais em `deliberation/round3/*.md` — este documento consolida as decisões.

## Overview
O Conselho foi unânime: **caminho A agora, para o Evandro** — uma tela própria **"Assistente"** que guia a conexão em **4 passos + teste**, sem jargão, com status honesto e histórico "O que o ChatGPT fez" com desfazer seguro — e **caminho B antes do 2º cliente**: um GPT oficial "fourbase" com login OAuth ("Entrar no fourbase"), que reduz a configuração a abrir um link. Conectores MCP (C) ficam em observação. A didática mora em três camadas: a **tela** (onboarding e uso diário), o **próprio GPT** (instruções curtas e didáticas) e o **servidor/contrato** (que garantem a segurança sem depender do prompt). Como a etapa 1 ainda não foi publicada, as mudanças de banco entram na migration atual, sem custo de migração.

## User Experience (Advocate — texto final em `round3/advocate.md`)
- **Menu "Assistente"** (só gestor). Meu Perfil passa a só linkar para lá.
- **Modo 1 — onboarding:** abertura "Monte sua agenda conversando com o ChatGPT" + 3 cartões (Você pede → Ele mostra a lista → Você confirma) + "Antes de começar" (plano pago, ~5 min, no computador). Stepper "Passo X de 4", um passo e um botão primário por vez:
  1. **Autorizar e criar sua chave** — aviso em 2 camadas ("O que o ChatGPT vai ver" + "Ver detalhes") e botão **"Autorizo e criar minha chave"**; chave mascarada com Copiar.
  2. **Abrir o ChatGPT** no criador de GPT, achar **Criar nova ação** (nomes do ChatGPT em negrito).
  3. **Colar o endereço e a chave** (Importar de URL; Autenticação → Chave de API → Bearer) → **"Já colei a chave"** limpa a área de transferência e some com a chave.
  4. **Ensinar o assistente e deixar só para você** — copiar Instruções, nome "fourbase", compartilhar **Somente eu** → botão "Está como Somente eu — ir para o teste".
  - **Teste:** "escreva: o que tenho amanhã?" → a tela muda sozinha para **"Funcionou! Sua chave foi usada às 08:12"**; após 3 min, "Não funcionou?" com 3 checagens.
- **Modo 2 — uso diário:** cartão de status em 4 estados com ícone + texto (Aguardando o primeiro uso / Conexão ativa · última atividade / Sem uso há 30 dias / Desconectado), **Desconectar**; **"O que o ChatGPT fez"** (pedidos que criaram tarefas, Ver no Kanban, Desfazer 48 h com prévia "Serão removidas (3) / Serão mantidas porque alguém mexeu (2)"); **Ideias para pedir** (frases com Copiar); **O que ele pode e não pode**; **Conexões** (avançado).
- Vocabulário: token → **chave de conexão**; revogar → **Desligar/Desconectar**; openapi → **endereço do fourbase**; "Actions/Bearer" só como rótulo literal do ChatGPT.
- Acessibilidade: `<ol>` + `aria-current`, `aria-live` para cópias/status, diálogo com foco preso, alvos ≥ 44 px, nunca só cor.
- Release note em "O que há de novo" com "Conhecer o Assistente".

## Architecture (Architect — SQL e rotas em `round3/architect.md`)
- **Migration `20261101000000` reescrita (não publicada):** `fourbase_api_tokens` + `kind` (default `personal`), `expires_at not null` (365 dias); `fourbase_assistant_batches` + `token_id`, `items jsonb` (por tarefa: id + **fingerprint `fp`**, sem título/descrição), índice `(user_id, created_at desc)`; nova **`fourbase_assistant_consents`** (só inserção: workspace, usuário, data, versão do aviso). RLS ligado sem policies em todas.
- **Um serviço, duas portas que não se misturam:** porta do GPT (token): `me`, `agenda`, `clients`, `tasks/preview`, `tasks`, `batches`, `batches/:id/undo`; porta da tela (JWT, gestor): `tokens` (criar exige versão do aviso e grava o consentimento no mesmo request; criar nova chave desliga a anterior), `app/batches`, `app/batches/:id/undo?preview=1` → confirmação com `only_ids`.
- **Desfazer:** `planUndo` + `undoBatch` únicos; remove só tarefas cujo `fp` não mudou, ainda do dono, fora de "Concluído"; idempotente; 410 após 48 h.
- **Status calculado no cliente** a partir de `/tokens` (`last_used_at`) + último lote. Teste = polling de `/tokens` a cada 4 s, só com o teste aberto e a aba visível, até 3 min.
- **Instruções do GPT versionadas no front** (sem `/setup`); contrato `openapi` 1.1.0 só aditivo (descrições, schemas de resposta, `today`/`timezone`, `undo_until`).
- Correção: `loadBatch` passa a filtrar também `workspace_id`.

## GPT (Oracle — instruções prontas em `round3/oracle.md`)
- Instruções v1.1 (~4.400 caracteres), 4 conversation starters, fuso America/Sao_Paulo, datas relativas usando `today` da API, mensagens de erro simples (401 → "abra o fourbase → Assistente").
- **Sem confirmação dupla:** `x-openai-isConsequential: true` nas escritas faz o ChatGPT mostrar **Permitir**, que é a confirmação, logo após a tabela; o GPT só pergunta no chat quando há pendência (conflito, cliente ambíguo, horário sugerido, > 30 tarefas). Se a avaliação mostrar que o "Permitir" não aparece sempre, volta o "sim" no chat.
- Roteiro de avaliação de 16 casos (~1h30) antes de liberar ao Evandro: 100 % nos críticos e datas, zero escrita sem Permitir.

## Risk Assessment (Skeptic — checklist A1–A20 / B1–B21 em `round3/skeptic.md`)
Inegociáveis para liberar ao Evandro: papel **gestor** e status conferidos no banco a cada chamada (rebaixar/desativar revoga as chaves); desfazer por fingerprint com prévia; `isConsequential`; `openapi.json` responde 503 sem `APP_URL` (nada de `Host`); chave nunca nas instruções; status só com evidência; nova chave desliga a anterior; isolamento por usuário e workspace; **`ASSISTANT_ENABLED=false`** desliga tudo sem deploy. Adiados para B: detecção de GPT compartilhado, limite diário persistido, auditoria completa, defesas extras de prompt injection, todo o checklist OAuth (redirect_uri exato, `state`, código de uso único, PKCE/segredo, rotação de refresh, grant por user+workspace, revisão de segurança).

## Privacy & Compliance (Guardian — textos em `round3/guardian.md`)
- Ligar o Assistente = autorização da empresa (controladora) via gestor ao fourbase (operador); OpenAI é fornecedora do próprio usuário; transferência internacional explicitada no aviso.
- Já para o Evandro: aviso completo em 2 camadas, consentimento registrado com versão, chave de 365 dias, "Somente eu", Desconectar, lotes sem título/descrição.
- Retenção: consentimento = vida do workspace + 5 anos; lotes e chaves revogadas = 12 meses; log de leituras (quando existir) = 6 meses.
- Antes do 2º cliente: política de privacidade pública (12 seções esboçadas), termos de operador (12 cláusulas), interruptor do workspace + seção "Empresa", log de leituras (metadados).

## Quality Strategy
- ~21 testes `node:test` novos (Architect): duas portas não se cruzam, isolamento entre workspaces, consentimento obrigatório e versionado, nova chave revoga a anterior, rebaixar revoga, desfazer por fingerprint (prévia ≡ execução, `only_ids`, 410), 503 sem `APP_URL`, kill switch.
- Repetir a bateria pesada (local + Postgres real) e o checklist A1–A20.
- Avaliação do GPT com 16 casos no ChatGPT real (só possível com conta paga).
- Revisão no navegador em 390/820/1024 px, claro/escuro, teclado.

## Plano e escopo (Strategist — `round3/strategist.md`)
- **Fase A (~2 semanas de esforço estimado):** tudo acima. **Cortes se apertar, nesta ordem:** `listarLotes` no GPT → paginação do histórico → descrições do openapi → prints por passo. **Não cortáveis:** migration, `fp` no desfazer, reforço do `assistantAuth`/`APP_URL`, chave mascarada, "Somente eu".
- **Semana 1, em paralelo (externo):** verificar perfil de construtor na OpenAI e publicar política de privacidade — caminho crítico de B.
- **Gatilho de B:** Evandro conecta sozinho em ≤ 15 min, ≥ 3 lotes em 14 dias, desfaz < 25 %; existe 2º cliente concreto; política publicada e perfil verificado; spike Actions × MCP (0,5 dia). Meta de B: conectar em ≤ 3 min.

## Tension Resolutions
| Tensão | Agentes | Resolução | Raciocínio |
|---|---|---|---|
| Privacidade × atrito | Guardian ↔ Advocate | Aviso em 2 camadas no Passo 1 + **um botão** "Autorizo e criar minha chave" que grava o consentimento versionado; interruptor e log de leituras só antes do 2º cliente | Ato afirmativo registrável sem passo extra; Evandro é gestor único e dono da empresa |
| Didática × segurança | Skeptic ↔ Advocate | Mantém copiar/stepper/termos simples, com travas no fluxo: chave mascarada, "Já colei" limpa a área de transferência, "Somente eu" no 4c, "Funcionou!" só com evidência, desfazer com prévia que preserva trabalho humano, papel gestor no servidor | Segurança vai para o servidor e para o fluxo, não para avisos longos |
| Escopo × preparação para B | Strategist ↔ Architect | Entram já, na migration não publicada: `token_id`, `items`+`fp`, `kind`, `expires_at`, consentimentos, índice; ficam para B: `oauth_client`, refresh, `oauth_codes` | Esquema é o único item que encarece depois do deploy; OAuth em si só com gatilho |
| Confirmação dupla | Oracle (vs prompt anterior) | `isConsequential` = confirmação; chat só pergunta com pendência | Evitar cansaço sem perder a trava; fallback se "Permitir" falhar na avaliação |

## Decision Log
| Decisão | Opções | Escolhida | Motivo |
|---|---|---|---|
| Caminho | A, B, C, sequência | A agora → B antes do 2º cliente; C em observação | Unânime; B exige OAuth + verificação externa |
| Onde explicar | Meu Perfil, tela própria, Novidades | Tela própria "Assistente" + release note | Decisão da entrevista; Meu Perfil só linka |
| Gesto de autorização | Caixa que libera botão / botão único | Botão único "Autorizo e criar minha chave" | Advocate + Architect; Guardian aceitou ambos; mais acessível |
| Status | `last_used_at` / log de leituras | "Funcionou! usada às…" via `last_used_at`; nunca "Conectado" antes da 1ª chamada | Log de leituras adiado |
| Desfazer | por id / por fingerprint | Fingerprint guardado no lote + prévia + `only_ids` | Postgres sem trigger de `updated_at` (verificado) |
| Instruções do GPT | `/setup` no servidor / versionadas no front | Versionadas no front | Menos rota; B passa a controlar o prompt de qualquer jeito |
| Validade da chave | sem validade / 365 dias | 365 dias, sem campo na tela | Guardian + Skeptic |
| Desligar tudo | redeploy / variável | `ASSISTANT_ENABLED=false` | Skeptic: resposta a incidente sem deploy |
