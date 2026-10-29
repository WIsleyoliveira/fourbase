# Briefing comum do Conselho — Assistente (ChatGPT) didático

Workspace: C:/Users/adiss/OneDrive/Desktop/fourbase-production/fourbase (branch `features/assistente-chatgpt`, NÃO publicada ainda).
Leia `CLAUDE.md` do workspace (seção "Assistente (ChatGPT)") e `docs/assistente-chatgpt.md`.

## Produto
fourbase (antigo WeFlow): SaaS de gestão de tarefas em PT-BR para pequenas empresas. React 18 + Vite, TanStack Query, Express serverless na Vercel (`api/index.js`, rotas em `api/_lib/routes/*.js`), Supabase Postgres (service_role, RLS sem policies), JWT próprio, papéis gestor/funcionário, multi-workspace. Telas: Painel, Kanban, Calendário, Notas, Clientes, Relatórios, Cadastro, Equipe (gestor), Meu Perfil. Novas telas de topo: `VIEW_KEYS`/`VIEWS` em `src/routes.js`/`App.jsx`. Release notes em `src/releaseNotes.js` (modal "O que há de novo").

## O que já existe (etapa 1, testado, não publicado)
- Token pessoal `fbk_…` (só hash SHA-256 em `fourbase_api_tokens`), gerado por GESTOR em Meu Perfil (`src/components/AssistantTokensPanel.jsx`): texto curto, campo nome, botão "Gerar token", token mostrado uma vez, lista com prefixo/último uso/revogar. Máx 5 ativos.
- Rotas `/api/assistant/*` (`api/_lib/routes/assistant.js`, lógica pura em `api/_lib/assistant.js`): `openapi.json` público; `agenda?from&to` (≤62 dias); `clients`; `tasks/preview` (erros, conflitos de horário, duplicatas); `tasks` (lote ≤30, `batch_id` idempotente, etiqueta "ChatGPT", 1ª coluna, sem notificações, só para o dono do token); `batches/:id/undo` (48 h). Tabela `fourbase_assistant_batches` (user_id, batch_id, task_ids, undone_at, created_at).
- Escopos `agenda:read`/`agenda:write`; token só vale nessas rotas; limites: 120/min por token, força bruta só conta 401 por IP e token válido sempre passa.
- Configuração hoje (só em docs técnico): no ChatGPT → Explorar GPTs → Criar → Configurar → Actions → Importar de URL `https://fourbase.vercel.app/api/assistant/openapi.json` → Autenticação "Chave de API / Bearer" → colar token → colar instruções sugeridas (consultar agenda, usar prévia, mostrar lista e pedir confirmação, fuso de Brasília, não inventar cliente, desfazer).

## O usuário
Evandro Flexa Jr, gestor da Fourbase, NÃO técnico. Já usa ChatGPT pago com Drive/Gmail e papel timbrado. Quer montar a agenda conversando e o GPT criar as tarefas no fourbase.

## Entrevista (decisões do dono do produto)
- Evandro deve configurar **sozinho**, sem ajuda.
- Explicação numa **tela própria "Assistente"** no menu (não só em Meu Perfil).
- Maiores dores: **configurar o GPT** (Actions/openapi/Bearer/instruções), **saber se está funcionando**, **como usar no dia a dia**.
- Caminho: **o Conselho decide** entre (A) manter token e guiar melhor e (B) o fourbase publicar UM GPT "fourbase" com login OAuth (usuário só abre o link e clica "Entrar no fourbase"), ou uma sequência das duas.
- Deve servir a **outros gestores/clientes em poucos meses**.
- Feedback desejado: **status "Conectado"** (com último uso) e **histórico do que o GPT fez** (lotes, com desfazer).

## Fatos a considerar (verifique se puder; marque incertezas)
- GPTs com Actions exigem plano pago do ChatGPT; Actions suportam autenticação "API key" e "OAuth" (authorization code). Publicar GPT por link/loja exige perfil de construtor verificado e URL de política de privacidade.
- A OpenAI também tem "apps"/conectores baseados em MCP; disponibilidade por plano muda com frequência — trate como incerto.
- Custos: a IA roda na assinatura do usuário; servidor do fourbase quase sem custo.

## Regras
- Responda em **português do Brasil**.
- Seja concreto e ligado ao código real (cite arquivos). Não implemente nada; apenas escreva o arquivo pedido.
