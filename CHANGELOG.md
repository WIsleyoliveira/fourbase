# Changelog

Histórico de versões do fourbase. O texto que os usuários veem ao entrar na
plataforma ("O que há de novo") fica em `src/releaseNotes.js` — ao publicar uma
versão, atualize os dois e a `version` do `package.json`.

## Próxima versão (em desenvolvimento)

- **Assistente (ChatGPT)** — gestor de empresa liberada (`ASSISTANT_WORKSPACE_IDS`): nova tela **Assistente** no menu que guia a conexão do ChatGPT em 4 passos + teste automático ("Funcionou!") e, no dia a dia, mostra o status, o histórico "O que o ChatGPT fez" com desfazer seguro (prévia; nunca apaga tarefa em que alguém mexeu), ideias de frases e o que ele pode/não pode. O ChatGPT vê a agenda e os clientes e cria tarefas em lote (prévia, idempotência, etiqueta ChatGPT).
- Segurança e privacidade do Assistente: aviso do que vai para a OpenAI com autorização registrada (versão do aviso), chave de conexão válida por 1 ano e só para gestor ativo, nova chave substitui a anterior, "Somente eu" no passo a passo, contrato só com `APP_URL`, interruptor `ASSISTANT_ENABLED=false`.
- **Assistente como app do ChatGPT (MCP + login OAuth):** novo caminho principal, porque a OpenAI está descontinuando os GPTs personalizados e o ChatGPT só aceita OAuth em servidor MCP. A tela Assistente passa a guiar 4 passos (modo desenvolvedor → criar o app → conectar) e o gestor autoriza na página `/conectar`; não há chave nem instruções para copiar. Mesmas regras do caminho antigo (agenda, lote, desfazer seguro, gestor ativo). Exige também a migration `20261102000000_assistant_oauth.sql`.
- Exige a migration `20261101000000_assistant_tokens.sql`. Fora do "O que há de novo" até abrir para todas as empresas (fase B). Ver `docs/assistente-chatgpt.md`.

## 1.3.0 — 2026-11-06

- **Tela inicial à escolha de cada pessoa:** Meu Perfil → Tela inicial. Ao entrar (ou abrir o app em "/"), vai para a tela escolhida; fica por usuário neste navegador e só aceita telas que a pessoa pode abrir. Links diretos continuam abrindo onde dizem.
- **Calendário no celular:** mês com células altas (estilo iPhone) mostrando até 2 tarefas por dia (nome em 2 linhas, cor do responsável) e "+N"; tocar no dia abre embaixo as tarefas dele em cartões completos, com "+ Nova" e fechar. No computador nada muda.
- **Ajustes de mobile:** Notas sem rolagem lateral, campos com 16px (sem zoom no iPhone), área de toque de ~44px nos botões pequenos, altura por `dvh`, tarefa aberta em tela cheia.

## 1.2.0 — 2026-10-26

- **Anexos de tarefa aceitam qualquer tipo de arquivo** (PDF, planilhas, documentos, zip, áudio…), além de imagens: imagens aparecem como miniaturas e os demais arquivos numa lista com ícone, nome, baixar e excluir. Limite de 25 MB por arquivo; executáveis, scripts e páginas (.exe, .js, .html, .svg…) são recusados por segurança.
- **Editar colunas do Kanban** (gestor): lápis no cabeçalho de cada coluna para renomear, trocar a cor, mover para a esquerda/direita e excluir. Ao excluir, as tarefas vão para a coluna escolhida; sempre sobra ao menos uma coluna além de "Concluído", que é fixa (não edita, não move, não exclui).
- Contadores do Painel, da Equipe e dos clientes acompanham as colunas editadas (nome, cor e posição); a primeira coluna aberta é "a fazer" e as demais viram "em andamento".
- Coluna nova criada por "Adicionar grupo" entra antes de "Concluído", que fica sempre por último.
- Ao falhar uma ação por causa de um quadro desatualizado (coluna excluída por outra pessoa), a tela recarrega as colunas.
- Segurança: anexos de tarefa só aceitam endereços http(s) (o servidor descarta "javascript:", "data:" etc.; no máximo 50 por tarefa) e a tela só mostra como link o que é http(s). Evita que alguém plante um link que executa código quando outra pessoa clica em "abrir".
- Tarefas nunca ficam numa coluna que não existe mais (aba antiga ou quadro ainda carregando): vão para a primeira coluna do quadro.
- Tirado o "ou escreva com IA" do campo de descrição da tarefa.

## 1.1.0 — 2026-10-07

### Novo
- **Tema dia/noite**: botão no topo (e no cabeçalho do celular); a escolha fica salva no navegador e, sem escolha, segue o tema do sistema.
- **Sino de notificações**: avisos de menção e atribuição e de prazos chegando/vencidos, no app. O envio por e-mail está implementado (menção e atribuição, com preferência em Meu Perfil) mas só é ativado quando `RESEND_API_KEY`/`EMAIL_FROM` estiverem configurados com domínio verificado; na 1.1.0 o texto do aviso aos usuários anuncia o e-mail como "em breve" (hoje o Resend só entrega ao dono da conta, até haver domínio verificado).
- **Kanban — opções avançadas ao criar tarefa**: status, responsável, cliente, prioridade, prazo, data final, horário de início/fim, mencionados, descrição, etiquetas e imagens.
- **Kanban — busca e filtros**: busca por título/descrição/etiqueta; filtros de responsável, mencionados, etiquetas, prioridade, prazo e cliente; ordenação; resumo do quadro; visual renovado.
- **Calendário — criação rápida** clicando num dia (data já preenchida).
- **Calendário — Pendências**: gaveta com tarefas em atraso e sem data; arrastar para um dia ou reagendar para hoje.
- **Calendário — mini-calendário e filtros laterais** (status, responsável, etiquetas) com contagens.
- **Excluir etiquetas** (gestor): lixeira em cada etiqueta do seletor; a etiqueta sai também de todas as tarefas.
- **Painel principal renovado**: gráfico de rosca de progresso, concluir tarefas pela lista de próximos prazos (atrasadas em destaque, com responsável), agenda de hoje, nota rápida e atalho de criar tarefa nos cartões; "Criar Tarefa" e "Recarregar dados" foram para o topo (no celular, "+" no cabeçalho e recarregar no menu).
- **"O que há de novo"** exibido uma vez por versão ao entrar, e reaberto pelo botão "Novidades" do menu.

### Melhorias
- Calendário: tarefas de vários dias viram uma faixa contínua; hora antes do título; "+N mais" nos dias cheios; tooltip com título, responsável e prazo.
- Dados em cache com atualização instantânea e reversão automática em caso de erro (TanStack Query); URLs reais para cada tela.
- Segurança: tabelas fechadas ao acesso direto (RLS), limite de tentativas de login, isolamento entre workspaces coberto por testes.

### Para quem faz deploy
- Ordem obrigatória em `docs/deploy-runbook.md` (variáveis `SUPABASE_SERVICE_ROLE_KEY` e `APP_URL` antes das migrations).

## 1.0.0
- Versão em produção (https://fourbase.vercel.app/).
