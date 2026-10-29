# Resumo da Rodada 2 (Desafio)

Consenso desde a Rodada 1: sequência **A agora (Evandro) → B antes do 2º cliente** (GPT oficial "fourbase" + OAuth); C (MCP) em observação.

## Guardian ↔ Advocate (privacidade × atrito)
- Guardian **modificou**: aviso obrigatório já, curto (~90 palavras), dentro do fluxo (cita descrição das tarefas, OpenAI fora do Brasil, "fourbase não apaga histórico do ChatGPT", "não cole a chave na conversa"). Autorização = botão "Autorizo e continuar" (sem caixa extra). Registro do evento (workspace, usuário, data, versão do aviso) recomendado já / obrigatório antes do 2º cliente. Validade padrão 365 dias, sem campo na tela. Interruptor do workspace e log de leituras (só metadados) → **adiados** para antes do 2º cliente; agora só `token_id` nos lotes.
- Advocate **modificou**: aviso no topo do Passo 1 em 2 camadas (4 linhas + "Ver detalhes"); caixa "autorizo em nome da empresa" que libera "Criar chave" (um gesto), 1x por versão do aviso. Seção "Empresa" só quando houver >1 gestor (obrigatória antes do 2º cliente). "Desconectar" no cartão de status.
- **Divergência pequena a fechar**: botão único "Autorizo e continuar" (Guardian) vs caixa que libera "Criar chave" (Advocate).

## Skeptic ↔ Advocate (didática × segurança)
- Skeptic **modificou** (aceita stepper/termos). BLOQUEANTE para A: passo explícito "Compartilhar: Somente eu" confirmado antes do teste; copiar chave com aviso + limpar área de transferência; status honesto ("Funcionou! sua chave foi usada às…", selo "Conexão ativa · última atividade"); desfazer pula tarefas editadas/concluídas e mostra quais; `assistantAuth` exige papel gestor; `openapi.json` só com `APP_URL`; `x-openai-isConsequential` nas escritas. Para B: detectar GPT compartilhado, auditoria completa, limite diário persistido, expiração, política de privacidade, defesas extra de prompt injection, checklist OAuth. +1–1,5 dia.
- Advocate **modificou**: chave mascarada; "Já colei" limpa clipboard e esconde; criar nova chave substitui a anterior; textos "cole só no campo Chave de API do GPT que você criou"; "Conectado" só após 1ª chamada real com evidência ("consultou sua agenda de 03/11 a 09/11"); desfazer com prévia "Serão removidas (3) / mantidas porque alguém mexeu (2)" (precisa de undo em modo prévia); "Somente eu" = item 4c com caixa obrigatória. Continua em 4 passos.

## Strategist ↔ Architect (escopo × preparação para B)
- **Cruzaram**: Strategist passou a aceitar `kind`, `token_id`, `summary` e índice na migration não publicada; Architect recuou para só `token_id`, `items jsonb` (retrato de cada tarefa com fingerprint `fp`) e índice `(user_id, created_at desc)`, adiando `kind`/`oauth_client`/`/setup` para B.
- **Fato verificado pelo conductor**: no Postgres não há trigger de `updated_at` em `fourbase_tasks` (só o mock local atualiza) → para "não desfazer tarefa editada" é preciso guardar o retrato/fingerprint no lote.
- Desenho único proposto pelo Architect: serviço (`listBatches`, `undoBatch`, `whoAmI`) com duas portas — GPT (token): `/me`, `/batches`, `/batches/:id/undo`; tela (JWT): `/tokens` existente + `/api/assistant/app/batches` e `/app/batches/:id/undo` (com prévia). Status calculado no cliente a partir de `/tokens` + último lote. Estimativa A: ~1,5–2 semanas.
- **A fechar**: `kind` agora ou em B? `summary` vs `items`? `/setup` no servidor ou instruções versionadas no front?

## Achados confirmados no código (conductor)
- `assistantAuth` não confere papel (gestor rebaixado mantém acesso) — real.
- `openapi.json` cai no `Host` sem `APP_URL` — real.
- JWT do app vale 7 dias sem consultar o banco — pré-existente, fora do escopo do assistente.
