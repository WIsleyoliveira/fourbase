# PRD: Assistente (ChatGPT) didático — Fase A

## Overview
Tela própria "Assistente" para o gestor conectar o ChatGPT **sozinho** (4 passos + teste) e usar no dia a dia com status honesto, histórico "O que o ChatGPT fez" e desfazer seguro; segurança e consentimento garantidos no servidor; banco já preparado para o GPT oficial com OAuth (Fase B). Fonte: `design.md` e `deliberation/round3/*.md` (textos finais, SQL, checklist).

## Goals
- Evandro conecta sozinho em ≤ 15 min, sem jargão técnico no fourbase.
- Nunca mostrar "conectado" sem evidência; histórico de tudo que o GPT criou, com desfazer que preserva trabalho humano.
- Consentimento do gestor registrado e versionado (LGPD); aviso claro do que vai para a OpenAI.
- Endurecimento do checklist A1–A20 do Skeptic.
- Esquema pronto para B sem migração adicional nas tabelas já criadas.

## Non-Goals
- OAuth, GPT publicado, conector MCP (Fase B / observação).
- Interruptor por workspace, seção "Empresa", log de leituras, política de privacidade pública e termos de operador (obrigatórios **antes do 2º cliente**, fora desta fase).
- Detecção de GPT compartilhado, limite diário persistido, vídeo/prints por passo, cartão no Painel.
- Mudar o JWT de 7 dias do app.

## Quality Gates
- `npm test` — todos passam (inclui os novos)
- `npm run build` — build passa
- Bateria pesada do assistente (local + Postgres real no Docker) sem falhas
- Revisão no navegador: 390/820/1024 px, claro/escuro, teclado

## User Stories

### US-001: Migration revisada (não publicada)
**Description:** Como mantenedor, quero o esquema final da Fase A já na migration 20261101000000, para não migrar dados depois.
**Agent:** Architect
**Acceptance Criteria:**
- [ ] `fourbase_api_tokens` ganha `kind` (default `personal`) e `expires_at not null`; tokens criados valem 365 dias
- [ ] `fourbase_assistant_batches` ganha `token_id` e `items jsonb` (id + `fp` por tarefa, sem título/descrição) e índice `(user_id, created_at desc)`
- [ ] Tabela `fourbase_assistant_consents` (só inserção) com workspace, usuário, data, versão do aviso
- [ ] RLS ligado e sem policies nas 3 tabelas; migration roda limpa no Postgres real; shim local registra as tabelas

### US-002: Chave segura no servidor
**Description:** Como gestor, quero que minha chave só funcione enquanto eu for gestor ativo e que eu possa desligar tudo rapidamente.
**Agent:** Skeptic / Architect
**Acceptance Criteria:**
- [ ] Chave de usuário que não é gestor ativo → 401; rebaixar ou desativar revoga as chaves dele
- [ ] Criar nova chave desliga as anteriores do mesmo usuário
- [ ] `ASSISTANT_ENABLED=false` faz todas as rotas do assistente responderem 503
- [ ] `openapi.json` responde 503 sem `APP_URL` (nunca usa o Host)
- [ ] `loadBatch` filtra por usuário **e** workspace

### US-003: Consentimento versionado
**Description:** Como empresa cliente, quero que a autorização do gestor fique registrada com a versão do aviso.
**Agent:** Guardian
**Acceptance Criteria:**
- [ ] `POST /api/assistant/tokens` sem a versão atual do aviso → 400 e nada criado
- [ ] Com a versão atual, grava o consentimento e cria a chave na mesma requisição
- [ ] Funcionário não consegue autorizar (403)

### US-004: Lotes com fingerprint e desfazer seguro
**Description:** Como gestor, quero desfazer um pedido do ChatGPT vendo antes o que sai e o que fica, sem perder o que alguém editou.
**Agent:** Architect
**Acceptance Criteria:**
- [ ] Criar lote grava `token_id` e `items` com fingerprint de cada tarefa
- [ ] Prévia lista "serão removidas" e "serão mantidas" (editada, concluída, reatribuída, fora da 1ª coluna)
- [ ] Confirmação com `only_ids` remove só o que estava na prévia e ainda está intacto; idempotente
- [ ] Depois de 48 h → 410; desfazer pela porta do GPT usa a mesma regra
- [ ] Porta da tela (JWT, gestor) não aceita chave; porta do GPT não aceita JWT

### US-005: Contrato para o GPT (openapi 1.1.0)
**Description:** Como GPT, quero rotas e descrições que me deixem explicar ao usuário o que aconteceu.
**Agent:** Oracle / Architect
**Acceptance Criteria:**
- [ ] `GET /api/assistant/me` (verificar conexão) e `GET /api/assistant/batches` (listar lotes)
- [ ] Respostas de agenda/prévia trazem `today` e `timezone` (America/Sao_Paulo); criação traz `undo_until`
- [ ] `x-openai-isConsequential: true` só em criar e desfazer; schemas de resposta e erros descritos
- [ ] Contrato só aditivo (operationIds anteriores mantidos)

### US-006: Tela Assistente — onboarding (Modo 1)
**Description:** Como gestor não técnico, quero ser guiado passo a passo para conectar o ChatGPT sozinho.
**Agent:** Advocate
**Acceptance Criteria:**
- [ ] Item de menu "Assistente" só para gestor; rota `/assistente`; funcionário redirecionado
- [ ] Abertura + "Como funciona" + "Antes de começar"; stepper "Passo X de 4", um passo aberto por vez
- [ ] Passo 1: aviso em 2 camadas e botão "Autorizo e criar minha chave"; chave mascarada com Copiar/Mostrar
- [ ] Passos 2–4 com botões de copiar (endereço, chave, instruções); "Já colei a chave" limpa a área de copiar e descarta a chave; 4c "Somente eu"
- [ ] Teste: polling de `/tokens` a cada 4 s com aba visível; "Funcionou! Sua chave foi usada às HH:MM"; após 3 min, "Não funcionou?"
- [ ] Nenhum termo técnico em texto do fourbase (só rótulos literais do ChatGPT em negrito)

### US-007: Tela Assistente — uso diário (Modo 2)
**Description:** Como gestor, quero ver se está funcionando, o que o ChatGPT fez e como usar.
**Agent:** Advocate
**Acceptance Criteria:**
- [ ] Status em 4 estados com ícone + texto (Aguardando o primeiro uso / Conexão ativa / Sem uso há 30 dias / Desconectado) e Desconectar com confirmação
- [ ] "O que o ChatGPT fez": cartões por pedido, Ver no Kanban, Desfazer com diálogo de prévia; vazio/erro/carregando
- [ ] "Ideias para pedir" com Copiar e "O que ele pode e não pode"
- [ ] "Conexões" (avançado) com validade e último uso; "Compartilhei por engano" troca a chave
- [ ] Acessível por teclado e leitor de tela; sem rolagem lateral em 390 px; tema claro/escuro

### US-008: Instruções do GPT v1.1
**Description:** Como gestor, quero um assistente que me guie, confirme e explique em linguagem simples.
**Agent:** Oracle
**Acceptance Criteria:**
- [ ] Instruções (≤ 8.000 caracteres) e 4 conversation starters versionados em `src/` e copiados no Passo 4
- [ ] Instruções nunca contêm a chave; recusam pedir a chave na conversa
- [ ] Mensagem de reconexão em 401 aponta para "fourbase → Assistente"

### US-009: Comunicação e documentação
**Description:** Como usuário e mantenedor, quero saber que o Assistente existe e como ele funciona.
**Agent:** Advocate / Chronicler
**Acceptance Criteria:**
- [ ] Release note com botão "Conhecer o Assistente"; CHANGELOG e `docs/assistente-chatgpt.md` atualizados; CLAUDE.md
- [ ] Meu Perfil troca o painel antigo por um link "Gerenciar no Assistente"

### US-010: Avaliação no ChatGPT real (manual)
**Description:** Como responsável, quero validar o GPT real antes de entregar ao Evandro.
**Agent:** Oracle (roteiro) / usuário (execução)
**Acceptance Criteria:**
- [ ] Roteiro de 16 casos executado com conta paga; 100 % nos críticos e datas; zero escrita sem "Permitir"

## Technical Notes
- SQL, rotas e payloads: `round3/architect.md` §1–3; textos da tela: `round3/advocate.md`; aviso e retenção: `round3/guardian.md`; instruções e roteiro: `round3/oracle.md`; checklist A1–A20: `round3/skeptic.md`.
- Postgres sem trigger de `updated_at` em tarefas → fingerprint calculado de campos da tarefa (título, descrição, datas, horários, coluna, responsável, cliente, prioridade).
- `NOTICE_VERSION` constante compartilhada (front envia, servidor valida).

## Dependencies
- Migration manual no Supabase (backup antes), `APP_URL` definido na Vercel.
- Conta paga do ChatGPT para US-010.
- Externo, em paralelo (para B): verificação de construtor na OpenAI e política de privacidade publicada.
