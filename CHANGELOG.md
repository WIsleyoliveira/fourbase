# Changelog

Histórico de versões do fourbase. O texto que os usuários veem ao entrar na
plataforma ("O que há de novo") fica em `src/releaseNotes.js` — ao publicar uma
versão, atualize os dois e a `version` do `package.json`.

## 1.1.0 — 2026-10-05 (ainda não publicada em produção)

### Novo
- **Sino de notificações**: avisos de menção e atribuição (no app e por e-mail) e de prazos chegando/vencidos; preferência de e-mail em Meu Perfil.
- **Kanban — opções avançadas ao criar tarefa**: status, responsável, cliente, prioridade, prazo, data final, horário de início/fim, mencionados, descrição, etiquetas e imagens.
- **Kanban — busca e filtros**: busca por título/descrição/etiqueta; filtros de responsável, mencionados, etiquetas, prioridade, prazo e cliente; ordenação; resumo do quadro; visual renovado.
- **Calendário — criação rápida** clicando num dia (data já preenchida).
- **Calendário — Pendências**: gaveta com tarefas em atraso e sem data; arrastar para um dia ou reagendar para hoje.
- **Calendário — mini-calendário e filtros laterais** (status, responsável, etiquetas) com contagens.
- **"O que há de novo"** exibido uma vez por versão ao entrar, e reaberto pelo botão "Novidades" do menu.

### Melhorias
- Calendário: tarefas de vários dias viram uma faixa contínua; hora antes do título; "+N mais" nos dias cheios; tooltip com título, responsável e prazo.
- Dados em cache com atualização instantânea e reversão automática em caso de erro (TanStack Query); URLs reais para cada tela.
- Segurança: tabelas fechadas ao acesso direto (RLS), limite de tentativas de login, isolamento entre workspaces coberto por testes.

### Para quem faz deploy
- Ordem obrigatória em `docs/deploy-runbook.md` (variáveis `SUPABASE_SERVICE_ROLE_KEY` e `APP_URL` antes das migrations).

## 1.0.0
- Versão em produção (https://fourbase.vercel.app/).
