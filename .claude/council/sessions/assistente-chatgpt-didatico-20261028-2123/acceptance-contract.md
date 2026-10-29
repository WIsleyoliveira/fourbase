# Acceptance Contract: Assistente (ChatGPT) didático — Fase A
Session: assistente-chatgpt-didatico-20261028-2123 | PRD: prd.md | Status: locked

## Quality Gates
| Gate | Command | Required |
|---|---|---|
| tests | `npm test` | yes |
| build | `npm run build` | yes |
| stress | bateria pesada local + Postgres | yes |

## Acceptance Criteria

### US-001: Migration revisada (não publicada)

#### AC-001: `fourbase_api_tokens` ganha `kind` (default `personal`) e `expires_at not null`; tokens criados valem 365 dias
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-002: `fourbase_assistant_batches` ganha `token_id` e `items jsonb` (id + `fp` por tarefa, sem título/descrição) e índice `(user_id, created_at desc)`
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-003: Tabela `fourbase_assistant_consents` (só inserção) com workspace, usuário, data, versão do aviso
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-004: RLS ligado e sem policies nas 3 tabelas; migration roda limpa no Postgres real; shim local registra as tabelas
- **Method:** integration-test
- **Status:** pending
- **Evidence:** —

### US-002: Chave segura no servidor

#### AC-005: Chave de usuário que não é gestor ativo → 401; rebaixar ou desativar revoga as chaves dele
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-006: Criar nova chave desliga as anteriores do mesmo usuário
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-007: `ASSISTANT_ENABLED=false` faz todas as rotas do assistente responderem 503
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-008: `openapi.json` responde 503 sem `APP_URL` (nunca usa o Host)
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-009: `loadBatch` filtra por usuário **e** workspace
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

### US-003: Consentimento versionado

#### AC-010: `POST /api/assistant/tokens` sem a versão atual do aviso → 400 e nada criado
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-011: Com a versão atual, grava o consentimento e cria a chave na mesma requisição
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-012: Funcionário não consegue autorizar (403)
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

### US-004: Lotes com fingerprint e desfazer seguro

#### AC-013: Criar lote grava `token_id` e `items` com fingerprint de cada tarefa
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-014: Prévia lista "serão removidas" e "serão mantidas" (editada, concluída, reatribuída, fora da 1ª coluna)
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-015: Confirmação com `only_ids` remove só o que estava na prévia e ainda está intacto; idempotente
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-016: Depois de 48 h → 410; desfazer pela porta do GPT usa a mesma regra
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-017: Porta da tela (JWT, gestor) não aceita chave; porta do GPT não aceita JWT
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

### US-005: Contrato para o GPT (openapi 1.1.0)

#### AC-018: `GET /api/assistant/me` (verificar conexão) e `GET /api/assistant/batches` (listar lotes)
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-019: Respostas de agenda/prévia trazem `today` e `timezone` (America/Sao_Paulo); criação traz `undo_until`
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-020: `x-openai-isConsequential: true` só em criar e desfazer; schemas de resposta e erros descritos
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-021: Contrato só aditivo (operationIds anteriores mantidos)
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

### US-006: Tela Assistente — onboarding (Modo 1)

#### AC-022: Item de menu "Assistente" só para gestor; rota `/assistente`; funcionário redirecionado
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-023: Abertura + "Como funciona" + "Antes de começar"; stepper "Passo X de 4", um passo aberto por vez
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-024: Passo 1: aviso em 2 camadas e botão "Autorizo e criar minha chave"; chave mascarada com Copiar/Mostrar
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-025: Passos 2–4 com botões de copiar (endereço, chave, instruções); "Já colei a chave" limpa a área de copiar e descarta a chave; 4c "Somente eu"
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-026: Teste: polling de `/tokens` a cada 4 s com aba visível; "Funcionou! Sua chave foi usada às HH:MM"; após 3 min, "Não funcionou?"
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-027: Nenhum termo técnico em texto do fourbase (só rótulos literais do ChatGPT em negrito)
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

### US-007: Tela Assistente — uso diário (Modo 2)

#### AC-028: Status em 4 estados com ícone + texto (Aguardando o primeiro uso / Conexão ativa / Sem uso há 30 dias / Desconectado) e Desconectar com confirmação
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-029: "O que o ChatGPT fez": cartões por pedido, Ver no Kanban, Desfazer com diálogo de prévia; vazio/erro/carregando
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-030: "Ideias para pedir" com Copiar e "O que ele pode e não pode"
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-031: "Conexões" (avançado) com validade e último uso; "Compartilhei por engano" troca a chave
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-032: Acessível por teclado e leitor de tela; sem rolagem lateral em 390 px; tema claro/escuro
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

### US-008: Instruções do GPT v1.1

#### AC-033: Instruções (≤ 8.000 caracteres) e 4 conversation starters versionados em `src/` e copiados no Passo 4
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-034: Instruções nunca contêm a chave; recusam pedir a chave na conversa
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

#### AC-035: Mensagem de reconexão em 401 aponta para "fourbase → Assistente"
- **Method:** unit-test
- **Status:** pending
- **Evidence:** —

### US-009: Comunicação e documentação

#### AC-036: Release note com botão "Conhecer o Assistente"; CHANGELOG e `docs/assistente-chatgpt.md` atualizados; CLAUDE.md
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

#### AC-037: Meu Perfil troca o painel antigo por um link "Gerenciar no Assistente"
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

### US-010: Avaliação no ChatGPT real (manual)

#### AC-038: Roteiro de 16 casos executado com conta paga; 100 % nos críticos e datas; zero escrita sem "Permitir"
- **Method:** manual-check
- **Status:** pending
- **Evidence:** —

## Verification Summary
| ID | Criterion | Method | Status | Evidence |
|---|---|---|---|---|
| AC-001 | `fourbase_api_tokens` ganha `kind` (default `personal`) e `e | unit-test | pending | — |
| AC-002 | `fourbase_assistant_batches` ganha `token_id` e `items jsonb | unit-test | pending | — |
| AC-003 | Tabela `fourbase_assistant_consents` (só inserção) com works | unit-test | pending | — |
| AC-004 | RLS ligado e sem policies nas 3 tabelas; migration roda limp | integration-test | pending | — |
| AC-005 | Chave de usuário que não é gestor ativo → 401; rebaixar ou d | unit-test | pending | — |
| AC-006 | Criar nova chave desliga as anteriores do mesmo usuário | unit-test | pending | — |
| AC-007 | `ASSISTANT_ENABLED=false` faz todas as rotas do assistente r | unit-test | pending | — |
| AC-008 | `openapi.json` responde 503 sem `APP_URL` (nunca usa o Host) | unit-test | pending | — |
| AC-009 | `loadBatch` filtra por usuário **e** workspace | unit-test | pending | — |
| AC-010 | `POST /api/assistant/tokens` sem a versão atual do aviso → 4 | unit-test | pending | — |
| AC-011 | Com a versão atual, grava o consentimento e cria a chave na  | unit-test | pending | — |
| AC-012 | Funcionário não consegue autorizar (403) | unit-test | pending | — |
| AC-013 | Criar lote grava `token_id` e `items` com fingerprint de cad | unit-test | pending | — |
| AC-014 | Prévia lista "serão removidas" e "serão mantidas" (editada,  | unit-test | pending | — |
| AC-015 | Confirmação com `only_ids` remove só o que estava na prévia  | unit-test | pending | — |
| AC-016 | Depois de 48 h → 410; desfazer pela porta do GPT usa a mesma | unit-test | pending | — |
| AC-017 | Porta da tela (JWT, gestor) não aceita chave; porta do GPT n | manual-check | pending | — |
| AC-018 | `GET /api/assistant/me` (verificar conexão) e `GET /api/assi | unit-test | pending | — |
| AC-019 | Respostas de agenda/prévia trazem `today` e `timezone` (Amer | unit-test | pending | — |
| AC-020 | `x-openai-isConsequential: true` só em criar e desfazer; sch | unit-test | pending | — |
| AC-021 | Contrato só aditivo (operationIds anteriores mantidos) | unit-test | pending | — |
| AC-022 | Item de menu "Assistente" só para gestor; rota `/assistente` | manual-check | pending | — |
| AC-023 | Abertura + "Como funciona" + "Antes de começar"; stepper "Pa | manual-check | pending | — |
| AC-024 | Passo 1: aviso em 2 camadas e botão "Autorizo e criar minha  | manual-check | pending | — |
| AC-025 | Passos 2–4 com botões de copiar (endereço, chave, instruções | manual-check | pending | — |
| AC-026 | Teste: polling de `/tokens` a cada 4 s com aba visível; "Fun | manual-check | pending | — |
| AC-027 | Nenhum termo técnico em texto do fourbase (só rótulos litera | manual-check | pending | — |
| AC-028 | Status em 4 estados com ícone + texto (Aguardando o primeiro | manual-check | pending | — |
| AC-029 | "O que o ChatGPT fez": cartões por pedido, Ver no Kanban, De | manual-check | pending | — |
| AC-030 | "Ideias para pedir" com Copiar e "O que ele pode e não pode" | manual-check | pending | — |
| AC-031 | "Conexões" (avançado) com validade e último uso; "Compartilh | manual-check | pending | — |
| AC-032 | Acessível por teclado e leitor de tela; sem rolagem lateral  | manual-check | pending | — |
| AC-033 | Instruções (≤ 8.000 caracteres) e 4 conversation starters ve | manual-check | pending | — |
| AC-034 | Instruções nunca contêm a chave; recusam pedir a chave na co | unit-test | pending | — |
| AC-035 | Mensagem de reconexão em 401 aponta para "fourbase → Assiste | unit-test | pending | — |
| AC-036 | Release note com botão "Conhecer o Assistente"; CHANGELOG e  | manual-check | pending | — |
| AC-037 | Meu Perfil troca o painel antigo por um link "Gerenciar no A | manual-check | pending | — |
| AC-038 | Roteiro de 16 casos executado com conta paga; 100 % nos crít | manual-check | pending | — |

Progress: 0/38 verified

## Verification sweep — 2026-10-28

| Gate | Resultado |
|---|---|
| `npm test` | 252/252 |
| `npm run build` | ok |
| Bateria pesada (local) | 115/115 |
| Bateria pesada (Postgres 17 real + PostgREST, migrations do repo) | 115/115 |
| Banco: autorizações só de inserção, RLS nas 3 tabelas, cascata ao apagar empresa | verificado via psql |
| Navegador (local): 4 passos + teste "Funcionou!", desfazer com prévia, 375 px, claro/escuro, foco | verificado |

- US-001 a US-008: verificados (testes `tests/assistant-*.test.js` + navegador).
- US-009: docs/CHANGELOG/CLAUDE.md/.env.example atualizados; **release note adiada de propósito** (o Assistente ficou liberado só por empresa — `ASSISTANT_WORKSPACE_IDS` —, e o "O que há de novo" aparece para todos).
- US-010 (avaliação no ChatGPT real): **pendente** — exige conta paga e deploy.
- Fora do PRD, acrescentado na verificação: liberação por empresa (fechado por padrão), "Cancelar e voltar" no onboarding, histórico com polling de 30 s, resumo "N removidas, M mantidas".
