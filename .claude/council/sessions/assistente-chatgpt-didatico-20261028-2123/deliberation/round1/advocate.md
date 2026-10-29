# Advocate Position — Assistente (ChatGPT) didático

## Recomendação central

Sequência, não escolha: lançar **já** a tela "Assistente" com um **assistente de configuração em 4 passos guiado pelo próprio fourbase (caminho A, "chave de conexão")**, com status "Conectado" e histórico com desfazer. Em paralelo, preparar o **caminho B (GPT "fourbase" publicado + botão "Entrar no fourbase")** como destino final para outros clientes. A tela tem que ser desenhada desde já para que, quando B chegar, os passos 2 e 3 virem só "Abrir o GPT do fourbase → Entrar", sem mudar o resto (status, histórico, frases).

## Argumento-chave

Acompanhe o Evandro. Ele lê no "O que há de novo" que dá para montar a agenda conversando com o ChatGPT, clica em "Assistente" no menu e fica animado. Hoje ele chegaria em Meu Perfil, leria "token", "Trate-o como uma senha", geraria uma chave e... teria que descobrir sozinho onde fica "Explorar GPTs → Criar → Configurar → Actions → Importar de URL → Chave de API → Bearer". São **sete telas fora do fourbase, em outro idioma de interface, com termos de programador**, e a recompensa só aparece no fim. É exatamente aí que ele abandona: não por falta de vontade, mas porque nada na tela do ChatGPT confirma que ele está no lugar certo, e o token "mostrado uma vez" cria medo de errar ("se eu fechar, perdi?"). O caminho B elimina 80% dessa dor (abrir link → "Entrar no fourbase" → pronto), e por isso é o caminho certo para "outros gestores em poucos meses" — mas depende de perfil de construtor verificado, política de privacidade publicada e implementar OAuth, ou seja, não é para esta semana. O caminho A, se for **guiado como um GPS** (um passo por vez, com "o que você vai ver", botão de copiar ao lado de cada coisa a colar, e um **teste de conexão** que detecta sozinho quando o ChatGPT falou com o fourbase pela primeira vez), é aceitável para o Evandro hoje. O que transforma confusão em confiança não é a explicação, é o **retorno**: o momento em que a tela do fourbase muda sozinha de "Aguardando o ChatGPT..." para "Conectado — o ChatGPT acabou de consultar sua agenda". Esse é o momento de encantamento que precisamos projetar, e ele existe tanto em A quanto em B.

## Riscos se ignorado

- **Abandono na metade da configuração fora do app.** Sem guia passo a passo com "o que você vai ver" e sem teste de conexão, o Evandro fica no ChatGPT sem saber se acertou; ele vai concluir que "não funciona" e não volta. O dono pediu explicitamente "sozinho, sem ajuda" — com o fluxo atual (só `docs/assistente-chatgpt.md`) isso não acontece.
- **Desconfiança por falta de visibilidade.** Tarefas aparecendo com a etiqueta "ChatGPT" sem um lugar que diga "quando, quantas, e como desfazer" geram medo ("o robô mexeu na minha agenda?"). Hoje o desfazer só existe pelo próprio GPT (rota `batches/:id/undo` só aceita o token, `writeAuth` em `api/_lib/routes/assistant.js:271`) e **não há rota para listar lotes** — o histórico pedido não tem backend.
- **Linguagem de programador vira barreira para todos os próximos clientes.** "Token", "revogar", "Bearer", "Actions", "OpenAPI" no texto do produto tornam a funcionalidade "coisa de TI" e matam a adoção por outros gestores; cada cliente novo vira um chamado de suporte.

## Dependências de outros domínios

- **Architect:** (1) `GET /api/assistant/batches` com login normal (JWT, gestor), devolvendo lote, data, quantidade, títulos resumidos, `undone_at` e se ainda dá para desfazer (48 h); (2) `POST /api/assistant/batches/:id/undo` também via JWT (hoje só via token); (3) gravar `token_id` em `fourbase_assistant_batches` para saber "qual conexão fez"; (4) um sinal de "primeira chamada recebida" (o `last_used_at` já existe em `fourbase_api_tokens`, `routes/assistant.js:132`) para a tela fazer polling leve durante a configuração; (5) nova chave `assistente` em `VIEW_KEYS` (`src/routes.js`) e em `VIEWS` (`src/App.jsx`), gestor-only enquanto as rotas forem só de gestor.
- **Oracle:** instruções do GPT que **conduzam o usuário** (o GPT se apresenta, explica que sempre mostra a lista antes de criar, e oferece frases-exemplo na primeira mensagem); "conversation starters" iguais às frases da tela; mensagem amigável quando receber 401 ("Sua conexão com o fourbase foi desligada. Abra fourbase → Assistente para religar.").
- **Skeptic/Guardian:** texto de consentimento curto sobre o que vai para a OpenAI (títulos, datas, nomes de clientes) — precisa ser verdadeiro e aparecer antes do passo 1; política de privacidade para B.
- **Strategist:** confirmar que A é ponte e B é destino, com data-alvo, para eu não superinvestir em vídeo/prints do caminho A que vão envelhecer.
- **Artisan:** visual do stepper e dos estados de status (cores com contraste AA, não depender só de cor).

---

## Apêndice A — Mapa da jornada (do "nunca ouvi falar" ao "uso toda semana")

**Persona:** Evandro, gestor, não técnico, usa ChatGPT pago todo dia (Drive, Gmail, papel timbrado). Trabalho a ser feito: *"Quero falar a minha semana em voz alta e ela aparecer organizada no fourbase, sem digitar tarefa por tarefa."* Estado ao chegar: curioso, otimista, pouca paciência para configuração.

**Pontos de entrada:** (1) modal "O que há de novo" (`src/releaseNotes.js`) com botão "Conhecer o Assistente"; (2) item "Assistente" no menu lateral; (3) cartão discreto no Painel para gestores que nunca conectaram ("Monte sua agenda conversando com o ChatGPT — Conhecer"); (4) link dentro do GPT quando a conexão falha.

| # | Etapa | O que ele vê / faz | Resposta do sistema | Emoção | Onde se perde (risco) |
|---|---|---|---|---|---|
| 0 | Descoberta | Vê a novidade no modal | Botão leva à tela Assistente | Curioso | Se o botão levar a Meu Perfil, não entende a relação |
| 1 | Entendimento | Lê "Como funciona" (3 desenhos: você fala → ChatGPT mostra a lista → você confirma → aparece no fourbase) | — | Interessado | Texto longo; jargão |
| 2 | Pré-requisito | "Você precisa do ChatGPT pago (Plus, Team...)". Marca "Tenho" | Libera passo 1 | Seguro / ou frustrado se não tem | Descobrir no fim que o plano não serve |
| 3 | Consentimento | Lê "O que o ChatGPT vai ver" | Botão "Entendi, continuar" | Tranquilo | Medo genérico de "IA na minha empresa" sem explicação |
| 4 | Criar a chave (A) | Clica "Criar chave de conexão" | Chave aparece com botão "Copiar" grande; a chave **fica guardada na tela até ele terminar o passo 3** | Confiante | "Mostrado uma única vez" assusta; fechar a aba = perder |
| 5 | Ir ao ChatGPT | Clica "Abrir o ChatGPT em nova aba" (abre direto em chatgpt.com/gpts/editor) | Tela do fourbase continua com o passo seguinte aberto | Atento | **Ponto crítico 1**: troca de aba, interface do ChatGPT muda; não sabe onde clicar |
| 6 | Colar endereço | Copia "endereço do fourbase" e cola em "Importar de URL" | — | Inseguro | **Ponto crítico 2**: acha "Actions" escondido em "Configurar" (rolar até o fim) |
| 7 | Colar chave | Escolhe "Chave de API" → "Bearer" → cola a chave | — | Ansioso | **Ponto crítico 3**: três escolhas técnicas seguidas; escolher "Basic" ou "Personalizado" por engano |
| 8 | Colar instruções | Copia bloco "Instruções" e cola em "Instruções" do GPT; dá nome "fourbase" | — | Cansado | Colar instruções no campo errado (Descrição) |
| 9 | Teste | Fourbase diz: "Agora, no ChatGPT, escreva: *o que tenho amanhã?*" e mostra "Aguardando o ChatGPT..." | Ao receber a 1ª chamada, a tela vira **"Conectado"** automaticamente | **Encantado** (momento-chave) | Se nada mudar, não sabe se o erro é dele; precisa de "Não funcionou?" com causas prováveis |
| 10 | Primeiro uso real | Pede "crie 3 tarefas para o cliente X na sexta" | GPT mostra lista, pede confirmação; tarefas aparecem com etiqueta ChatGPT | Surpreso, com leve medo | Medo de bagunça → precisa ver o lote no histórico com "Desfazer" |
| 11 | Confiança | Abre Assistente → "O que o ChatGPT fez" → vê o lote, desfaz um teste | Desfazer funciona pelo fourbase, sem depender do GPT | Seguro, no controle | Se desfazer só existir no GPT, sente que perdeu o controle |
| 12 | Hábito | Segunda de manhã: "Monte minha semana a partir deste e-mail" | Fluxo vira rotina; status mostra "último uso: hoje 08:12" | Eficiente | Esquece frases úteis → "Ideias para pedir" na tela e no GPT |
| 13 | Problema futuro | Chave desligada / perdida / trocou de computador | Status "Desconectado" com botão "Conectar de novo" (reabre o passo 4) | Leve frustração, resolvida | Mensagem "401" crua no ChatGPT |

**Caminhos alternativos e de erro que a tela precisa cobrir:**
- **Não tem plano pago:** mensagem honesta no passo 2 ("Sem o plano pago o ChatGPT não consegue se conectar a outros sistemas. Você pode continuar usando o fourbase normalmente.") — sem beco sem saída.
- **Funcionário (não gestor) abre a tela:** por ora não vê o item no menu (rotas são gestor-only). Se no futuro aparecer, mostrar "Peça ao seu gestor".
- **Perdeu a chave antes de colar:** botão "Criar outra chave" desliga a anterior automaticamente com aviso claro (evita acumular 5 chaves "fantasmas").
- **Limite de 5 conexões:** "Você já tem 5 conexões. Desligue uma que não usa." em vez de erro técnico.
- **Teste não chega em 2 min:** painel "Não funcionou?" com as 3 causas mais prováveis: (a) colou a chave no lugar errado — confira "Chave de API" + "Bearer"; (b) o ChatGPT pediu permissão e você não clicou "Permitir"; (c) importou o endereço errado — copie de novo.
- **Lote fora das 48 h:** botão "Desfazer" some e aparece "Para remover, apague as tarefas no Kanban" com link filtrado pela etiqueta.
- **Caminho B (futuro):** passos 4–8 colapsam em "Abrir o GPT do fourbase" → "Entrar no fourbase" (login normal, tela de permissão em português: "O ChatGPT poderá ver sua agenda e criar tarefas para você. Ele não altera nem apaga tarefas existentes.") → volta para o teste.

---

## Apêndice B — Estrutura da tela "Assistente"

Nova view `assistente` (gestor), item no menu principal com ícone de conversa, título "Assistente", subtítulo "Monte sua agenda conversando com o ChatGPT". Mover o painel de `ProfileView.jsx:473` para cá (em Meu Perfil fica só um link "Gerenciar no Assistente").

A tela tem **dois modos** (uma ação principal por vez):

### Modo 1 — Ainda não conectado (onboarding = estado vazio)

**Cabeçalho:** "Monte sua agenda conversando com o ChatGPT"
"Você conta o que precisa fazer — por texto, voz ou colando um e-mail — e o ChatGPT organiza as tarefas. Antes de criar qualquer coisa, ele mostra a lista e espera o seu OK."

**Como funciona** (3 cartões ilustrados, horizontais no desktop, empilhados no celular):
1. "Você pede" — *"Coloca reunião com a Padaria Sol na quinta às 10h."*
2. "Ele mostra a lista e pergunta se está certo"
3. "Você confirma e as tarefas aparecem no seu Kanban e Calendário, com a etiqueta ChatGPT"

**Antes de começar** (checklist curto):
- "Você usa o ChatGPT pago (Plus, Pro, Team ou Enterprise)" [ ] Sim
- "Leva uns 5 minutos. Deixe esta tela aberta ao lado do ChatGPT."

**O que o ChatGPT vai ver** (caixa recolhível, aberta por padrão no primeiro acesso):
"Para montar sua agenda, o ChatGPT vê **as suas** tarefas (título, data, cliente) e a lista de clientes. Essas informações passam pela OpenAI, empresa do ChatGPT, conforme a sua conta do ChatGPT. Ele **não** vê tarefas da sua equipe, **não** altera e **não** apaga tarefas que já existem."

**Passo a passo (stepper vertical, um passo aberto por vez, com "Passo X de 4")** — caminho A:

- **Passo 1 — Criar sua chave de conexão**
  "A chave é como uma senha que só serve para o ChatGPT falar com o seu fourbase."
  [Botão principal: Criar chave de conexão]
  Depois: campo com a chave + [Copiar chave] (feedback "Copiada!" por 2 s) + "Guarde só até terminar. Se perder, é só criar outra."
- **Passo 2 — Abrir o criador de GPT no ChatGPT**
  [Botão: Abrir o ChatGPT (nova aba)]
  "Lá, clique em **Configurar** (no topo). Role até o fim e clique em **Criar nova ação**." + print pequeno com a área destacada.
- **Passo 3 — Colar o endereço e a chave**
  a) "Clique em **Importar de URL** e cole:" `https://fourbase.vercel.app/api/assistant/openapi.json` [Copiar endereço]
  b) "Em **Autenticação**, escolha **Chave de API**, depois **Bearer**, e cole a sua chave." [Copiar chave de novo]
  Nota em linguagem simples: "Essas palavras aparecem em inglês técnico no ChatGPT; é só escolher exatamente essas opções."
- **Passo 4 — Ensinar o ChatGPT a trabalhar com o fourbase**
  "Volte para o topo e cole este texto no campo **Instruções**. Dê o nome **fourbase** e clique em **Criar** (ou **Atualizar**)." [Copiar instruções]
- **Teste final**
  "No seu GPT fourbase, escreva: **o que tenho amanhã?** Se o ChatGPT pedir permissão para falar com o fourbase, clique em **Permitir**."
  Estado: spinner "Aguardando o ChatGPT..." → ao detectar `last_used_at` novo: "Pronto! O ChatGPT acabou de consultar sua agenda." (som/animação discreta, anúncio em `aria-live="polite"`) → muda para o Modo 2.
  [Link: Não funcionou?] abre as 3 causas prováveis.

### Modo 2 — Conectado (uso diário)

**Cartão de status (topo):**
- Selo **"Conectado"** (ícone de check + texto, não só cor verde) — "Último uso: hoje às 08:12 · ChatGPT do Evandro"
- Variações: **"Conectado, ainda sem uso"** (chave criada, nenhuma chamada) → mostra o Teste final de novo; **"Desconectado"** (todas desligadas) → [Conectar de novo].
- [Botão primário: Abrir meu GPT fourbase] (link salvo pelo usuário ou chatgpt.com) — a ação principal desta tela no dia a dia.

**O que o ChatGPT fez** (histórico, mais recente primeiro):
Cada lote como um cartão: "**Hoje, 08:14** — criou 5 tarefas" · títulos resumidos ("Reunião Padaria Sol, Enviar proposta Auto Center +3") · [Ver no Kanban] · [Desfazer] (até 48 h; confirmação: "Remover estas 5 tarefas criadas pelo ChatGPT? As outras tarefas não são afetadas.") · lote desfeito aparece riscado com "Desfeito às 09:02". Estado vazio: "Nada por aqui ainda. Quando o ChatGPT criar tarefas, elas aparecem aqui e você pode desfazer em até 2 dias."
Opcional (follow-up, não bloqueia): consultas recentes ("consultou sua agenda de 03/11 a 09/11").

**Ideias para pedir** (chips com [Copiar]):
lista da seção D abaixo.

**O que ele pode e não pode fazer** (duas colunas, seção E).

**Conexões** (recolhido, rodapé — "Avançado"):
Lista: nome, criada em, último uso, [Desligar]. [Criar nova chave]. Texto: "Desligar corta o acesso do ChatGPT na hora. Você pode conectar de novo quando quiser."

**Acessibilidade e celular:** stepper com `<ol>` e `aria-current="step"`; botões de copiar com rótulo explícito ("Copiar endereço do fourbase") e confirmação em `aria-live`; status com texto, não só cor (contraste AA); no celular, aviso honesto: "Criar o GPT funciona melhor no computador. Depois de pronto, você usa no app do ChatGPT no celular normalmente." (o editor de GPT é ruim no celular — verificar). Tudo navegável por teclado; foco vai para o próximo passo ao concluir o atual.

---

## Apêndice C — Dicionário: termos técnicos → linguagem do Evandro

| Técnico (hoje) | Na tela do fourbase | Observação |
|---|---|---|
| Token / token pessoal | **Chave de conexão** | Explicar uma vez: "como uma senha que só serve para o ChatGPT" |
| Gerar token | **Criar chave de conexão** | |
| Revogar | **Desligar** / **Desconectar** | "Desligar corta o acesso na hora" |
| Token ativo | **Conexão ativa** | |
| Actions / Criar nova ação | Manter o nome **só quando é o botão literal do ChatGPT**, em negrito, com "(é o nome do botão lá)" | Não inventar nome para o que ele precisa achar na tela de outro produto |
| Bearer / Chave de API | Idem: "escolha **Chave de API** e depois **Bearer**" | Nunca explicar o que é; só dizer o que clicar |
| openapi.json / Importar de URL | **Endereço do fourbase** | |
| Escopos agenda:read/write | "**Ver sua agenda**" e "**Criar tarefas**" | |
| Lote / batch | **Pedido** ou "grupo de tarefas criadas de uma vez" | No histórico: "criou 5 tarefas" |
| Desfazer lote | **Desfazer** (remove só aquelas tarefas) | |
| 401 / não autorizado | "A conexão foi desligada ou a chave mudou" | Mensagem do GPT via instruções |
| Prévia / preview | "**Ele mostra a lista antes**" | |
| GPT | **Seu assistente fourbase no ChatGPT** | Na primeira menção |

---

## Apêndice D — Frases para o dia a dia (vão na tela e como "conversation starters" do GPT)

**Ver a agenda**
- "O que eu tenho amanhã?"
- "Como está minha semana? Tem algum dia livre à tarde?"
- "Quais tarefas tenho com o cliente Padaria Sol este mês?"

**Criar tarefas**
- "Coloca reunião com a Padaria Sol na quinta às 10h."
- "Monte minha semana: segunda visita à Auto Center, terça enviar orçamentos, quarta reunião de equipe às 9h."
- "Leia este e-mail e crie as tarefas que ele pede." (aproveita o Gmail que ele já usa)
- "Transforme esta ata de reunião em tarefas com prazo." (cola o texto ou anexa do Drive)
- "Todo dia útil da próxima semana, às 8h, 'conferir caixa'." (até 30 de uma vez)

**Corrigir**
- "Desfaz o que você acabou de criar."
- "Na verdade a reunião é às 11h — desfaça e crie de novo." (enquanto não há edição)

**Dica na tela:** "Você pode falar por voz no app do ChatGPT. Ele sempre mostra a lista e espera você dizer *pode criar*."

---

## Apêndice E — O que ele pode / não pode fazer (texto da tela)

**Pode**
- Ver as **suas** tarefas e prazos (até 2 meses por vez)
- Ver a lista de clientes para usar o nome certo
- Avisar quando um horário bate com outra tarefa ou quando a tarefa já existe
- Criar até 30 tarefas de uma vez, **para você**, na primeira coluna do Kanban, com a etiqueta ChatGPT
- Desfazer o que criou, em até 2 dias

**Não pode**
- Editar, mover ou apagar tarefas que já existem
- Ver ou criar tarefas para outras pessoas da equipe
- Cadastrar clientes novos (ele usa os que já existem)
- Mandar avisos ou e-mails para ninguém
- Fazer nada sem você confirmar a lista antes (o ChatGPT foi instruído a sempre perguntar)

> Honestidade importante: o último item depende das instruções do GPT, não de uma trava do servidor. No caminho A o usuário pode editar as instruções; no caminho B o fourbase controla. A frase deve dizer "foi instruído a", não "não consegue".

---

## Notas de escopo (blind spot check: o que bloqueia o lançamento e o que é follow-up)

**Bloqueia o lançamento para o Evandro:** tela Assistente com Modo 1 (stepper + botões copiar + teste com detecção automática) e Modo 2 (status + histórico com desfazer via login normal); dicionário de termos aplicado; "o que pode/não pode".
**Follow-up:** prints/vídeo curto de cada passo (envelhecem com a UI do ChatGPT — preferir texto que cite nomes de botões); consultas recentes no histórico; cartão no Painel; caminho B completo para outros clientes.
