# Advocate Final Position — Assistente (ChatGPT) didático

**Revised recommendation:** lançar já, para o Evandro, a tela própria **"Assistente"** (caminho A, chave de conexão) com onboarding em **4 passos + teste** e um modo de uso diário com status honesto e histórico com desfazer; redesenhar só os passos 2–3 quando o caminho B (GPT oficial "fourbase" + "Entrar no fourbase") chegar, **antes do 2º cliente**. O fluxo fica sem nenhuma caixa de seleção: toda confirmação é **um botão cujo rótulo diz o que se confirma**.

**Concessions made:**
- **Botão único do Guardian vence a minha caixa.** "Autorizo e criar minha chave" é ação afirmativa, registrável com versão do aviso, e é melhor para acessibilidade do que um botão desabilitado esperando uma caixa (sem estado cinza que o leitor de tela não explica, um clique a menos). Aplico o mesmo padrão ao "Somente eu" do Skeptic: em vez de caixa, botão "Está como Somente eu — ir para o teste".
- **Status sem detalhe de período no lançamento.** Como o log de leituras foi adiado, a evidência é o `last_used_at` da chave: "Funcionou! Sua chave foi usada às 08:12". O "consultou sua agenda de 03/11 a 09/11" entra quando o log existir. O estado "usada de um lugar diferente" não é lançado (cabeçalhos da OpenAI não verificados).
- **Interruptor do workspace e seção "Empresa" adiados** para antes do 2º cliente (Evandro é o único gestor). Validade de 365 dias sem campo na tela; só a data aparece em "Conexões".
- **Histórico só mostra pedidos que criaram tarefas** (sem leituras). Prints/vídeo, cartão no Painel e "consultas recentes" são follow-up.

**Non-negotiables:**
1. Tela própria "Assistente" no menu; nenhum termo técnico em texto do fourbase (só os rótulos literais do ChatGPT, em negrito).
2. Um passo aberto por vez, um botão primário por passo, botão copiar em cada coisa a colar (blocos separados; as instruções **nunca** contêm a chave).
3. Nunca dizer "Conectado" antes da primeira chamada real.
4. Desfazer pela tela do fourbase (login normal), com prévia "serão removidas / serão mantidas" — nunca apagar trabalho humano.
5. Aviso de privacidade dentro do Passo 1, antes do gesto, em 2 camadas; o mesmo texto acessível no Modo 2.
6. Teclado e leitor de tela de ponta a ponta (status com ícone + texto, `aria-live`, foco gerenciado).

**Implementation notes:**
- View `assistente` em `VIEW_KEYS` (`src/routes.js`) e `VIEWS` (`src/App.jsx`), só gestor; funcionário não vê o item. Mover `AssistantTokensPanel` de `ProfileView.jsx` para dentro de "Conexões"; Meu Perfil fica com o link "Gerenciar no Assistente". Release note em `src/releaseNotes.js` com botão "Conhecer o Assistente".
- Modo é calculado no cliente: sem chave ativa → Modo 1; chave ativa → Modo 2 (sub-estado "Aguardando o primeiro uso" se `last_used_at` nulo). Fonte: `/tokens` existente + `GET /api/assistant/app/batches`.
- "Autorizo e criar minha chave" grava o evento de autorização (workspace, usuário, data, `NOTICE_VERSION`) e cria a chave no mesmo request. `NOTICE_VERSION` é constante em `src/`; se mudar, o Passo 1 reaparece com o selo "O aviso mudou" antes de criar nova chave.
- Chave só na memória do componente (nunca `localStorage`), mascarada; "Já colei a chave" faz `navigator.clipboard.writeText('')` (melhor esforço) e descarta a chave. Criar outra chave **substitui** a anterior (revoga na mesma operação).
- Progresso do stepper (passo atual) pode ir em `localStorage` (só o número do passo, em try/catch).
- Teste: polling de `/tokens` a cada 4 s, só enquanto o teste estiver aberto e a aba visível; para em 3 min e mostra "Não funcionou?".
- Desfazer: `POST /api/assistant/app/batches/:id/undo?preview=1` monta o diálogo; confirmação chama sem `preview`. Mantém tarefa cujo fingerprint (`items[].fp`) mudou, que saiu da 1ª coluna, foi concluída ou tem comentário.
- Acessibilidade: stepper em `<ol>` com `aria-current="step"`; ao concluir um passo, foco no título do próximo; confirmações de cópia e mudanças de status em região `aria-live="polite"`; diálogo de desfazer com foco preso, `Esc` cancela, foco inicial em "Cancelar", retorno ao botão de origem; contraste AA; alvos de toque ≥ 44 px.

---

## Apêndice definitivo — Especificação da tela "Assistente" (textos finais)

**Menu:** item **"Assistente"** (ícone de balão de conversa). **Título da página:** "Assistente". **Subtítulo:** "Monte sua agenda conversando com o ChatGPT."

### Modo 1 — Ainda não conectado (onboarding)

**Abertura**
> **Monte sua agenda conversando com o ChatGPT**
> Você conta o que precisa fazer — por texto, voz ou colando um e-mail — e o ChatGPT organiza as tarefas. Antes de criar qualquer coisa, ele mostra a lista e espera o seu OK.

**Como funciona** (3 cartões; lado a lado no desktop, empilhados no celular)
1. **Você pede** — "Coloca reunião com a Padaria Sol na quinta às 10h."
2. **Ele mostra a lista** — e pergunta se está tudo certo.
3. **Você confirma** — as tarefas aparecem no seu Kanban e Calendário com a etiqueta ChatGPT.

**Antes de começar**
- Você precisa do **ChatGPT pago** (Plus, Pro, Team ou Enterprise).
- Leva uns 5 minutos. Faça pelo **computador** e deixe esta tela aberta ao lado do ChatGPT.
- Link discreto: "Não tenho o ChatGPT pago" → texto: "Sem o plano pago, o ChatGPT não consegue se conectar a outros sistemas. Você continua usando o fourbase normalmente e pode voltar aqui quando quiser."
- No celular (largura < 768 px), faixa no topo: "Criar o assistente funciona melhor no computador. Depois de pronto, você usa no app do ChatGPT no celular normalmente."

Indicador fixo: **"Passo X de 4"**.

---

**Passo 1 — Autorizar e criar sua chave de conexão**

*Aviso — camada 1 (sempre visível):*
> **O que o ChatGPT vai ver**
> Seu ChatGPT vai ver **as suas tarefas** (título, descrição, data e cliente) e **os nomes de todos os clientes da empresa**. Esses dados vão para a OpenAI, empresa do ChatGPT, fora do Brasil. O que entra no ChatGPT fica no histórico dele — o fourbase não consegue apagar lá. Evite colocar CPF, dados de saúde ou senhas nas descrições das tarefas.
> Ele **não** vê tarefas da sua equipe e **não** altera nem apaga tarefas que já existem.

*Aviso — camada 2 (link "Ver detalhes", recolhido):*
> - O fourbase só entrega ao ChatGPT o que ele pede para montar sua agenda: até 2 meses de tarefas por vez e a lista de clientes.
> - Tudo o que o ChatGPT cria fica registrado aqui em "O que o ChatGPT fez", e você pode desfazer em até 2 dias.
> - Você pode desconectar a qualquer momento nesta tela; o acesso para na hora.
> - No ChatGPT, em **Configurações → Controles de dados**, você pode desligar o uso das suas conversas para treinar os modelos.
> - Política de Privacidade do fourbase *(link, quando publicada)*.

*Linha acima do botão:*
> Ao continuar, você confirma que é responsável por esta empresa no fourbase e autoriza o envio desses dados ao seu ChatGPT.

*Botão primário:* **Autorizo e criar minha chave**
- Carregando: "Criando sua chave..."
- Depois de criada:
  > **Sua chave de conexão**
  > A chave é como uma senha que só serve para o ChatGPT falar com o seu fourbase.
  > `fbk_a1b2••••••••••••` [Mostrar] [**Copiar chave**]
  > Guarde só até terminar. Se perder, é só criar outra.
- Copiou: "Chave copiada" (2 s, anunciado).
- Botão: **Continuar** (avança ao Passo 2).

*Erros do Passo 1:*
- Falha de rede/servidor: "Não conseguimos criar a chave agora. Verifique sua internet e tente de novo." [Tentar de novo]
- Limite de 5: "Você já tem 5 conexões ativas. Desligue uma que não usa em **Conexões** e tente de novo." [Ver conexões]
- Sem permissão (perdeu o papel de gestor): "Só gestores podem conectar o Assistente. Fale com quem administra o fourbase da sua empresa."
- Aviso mudou (nova versão): selo "**O aviso mudou**" acima da camada 1, com a frase do que mudou destacada.

---

**Passo 2 — Abrir o criador de assistente no ChatGPT**

> Vamos criar o **seu** assistente fourbase dentro do ChatGPT. Ele é só seu.

*Botão primário:* **Abrir o ChatGPT** (nova aba, `https://chatgpt.com/gpts/editor`)

> Lá, clique na aba **Configurar** (no topo). Role até o fim e clique em **Criar nova ação**.
> *Os nomes em negrito são os botões que aparecem no ChatGPT.*
> O fourbase nunca vai pedir esta chave numa conversa, por e-mail ou WhatsApp.

Botões: **Já encontrei "Criar nova ação"** (primário) · Voltar

Ajuda ("Não encontrei"): "Confira se você entrou com a conta paga. O botão **Configurar** fica ao lado de **Criar**, no topo. Se a tela estiver em inglês, procure **Configure** e **Create new action**."

---

**Passo 3 — Colar o endereço e a chave**

a) > Clique em **Importar de URL** e cole o endereço do fourbase:
   > `https://fourbase.vercel.app/api/assistant/openapi.json` [**Copiar endereço**]

b) > Em **Autenticação**, escolha **Chave de API**, depois **Bearer**, e cole a sua chave. Clique em **Salvar**.
   > [**Copiar chave**]
   > **Cole só no campo Chave de API** do assistente que você acabou de criar. Não cole nas Instruções nem na conversa.
   > *Essas palavras aparecem em termos técnicos no ChatGPT; é só escolher exatamente essas opções.*

*Botão primário:* **Já colei a chave**
> Ao clicar, o fourbase apaga a chave da sua área de copiar e desta tela.

Linha em "Ver detalhes": "Se você usa histórico da área de transferência (Windows + V), apague a chave de lá também."

*Se voltar sem ter clicado "Já colei" (chave não está mais na memória):*
> Sua chave não aparece mais, por segurança. Você já colou no ChatGPT?
> [**Sim, continuar**] [Não, criar outra chave]
> *(Criar outra desliga a anterior automaticamente.)*

---

**Passo 4 — Ensinar o assistente e deixar só para você**

a) > Volte para o topo da aba **Configurar** e cole este texto no campo **Instruções**. [**Copiar instruções**]
b) > No campo **Nome**, escreva **fourbase**.
c) > Clique em **Criar** (ou **Atualizar**). Quando o ChatGPT perguntar com quem compartilhar, escolha **Somente eu**.
   > Se escolher "Qualquer pessoa com o link", quem tiver o link vê sua agenda e cria tarefas como se fosse você.

*Botão primário:* **Está como Somente eu — ir para o teste**

---

**Teste final**

> No seu assistente fourbase, escreva: **o que tenho amanhã?**
> Se o ChatGPT pedir permissão para falar com o fourbase, clique em **Permitir**.

Estados (região `aria-live`):
- Esperando: ícone de relógio + "**Aguardando o ChatGPT...** Assim que ele consultar sua agenda, esta tela muda sozinha."
- Sucesso: ícone de check + "**Funcionou!** Sua chave foi usada às 08:12. A partir de agora é só conversar." → botão **Ir para o meu Assistente** (abre o Modo 2).
- Após 3 min sem sinal: "**Ainda não recebemos nada do ChatGPT.**" [Verificar de novo] e abre automaticamente "Não funcionou?":
  > 1. **A chave está no lugar certo?** Em **Autenticação** deve estar **Chave de API** + **Bearer**, com a chave colada.
  > 2. **Você clicou em Permitir?** O ChatGPT pergunta antes de falar com o fourbase pela primeira vez.
  > 3. **O endereço foi importado?** Copie de novo no Passo 3 e use **Importar de URL**.
  > Ainda não deu? [Criar outra chave e refazer o Passo 3]

---

### Modo 2 — Conectado (uso diário)

**Cartão de status (topo)** — sempre ícone + texto

| Estado | Selo | Linha de apoio | Ações |
|---|---|---|---|
| Chave criada, nunca usada | ⏱ **Aguardando o primeiro uso** | "No seu assistente fourbase, escreva: o que tenho amanhã?" | [Ver o teste] · Desconectar |
| Usada | ✓ **Conexão ativa** | "Última atividade: hoje às 08:12" | [**Abrir o ChatGPT**] (primário) · Desconectar |
| Sem uso há 30+ dias | ○ **Sem uso há 30 dias** | "Se não usa mais, desconecte para mais segurança." | [Abrir o ChatGPT] · Desconectar |
| Desligada/vencida | ✕ **Desconectado** | "O ChatGPT não acessa mais o seu fourbase." | [**Conectar de novo**] (volta ao Modo 1, Passo 1) |

Link ao lado do selo: **"O que o ChatGPT vê"** (abre as 2 camadas do aviso).

*Desconectar — confirmação:*
> **Desconectar o ChatGPT?**
> O acesso para agora. O que ele já viu continua no histórico do seu ChatGPT; para apagar, use o próprio ChatGPT.
> [Cancelar] [**Desconectar**]
> Depois: "ChatGPT desconectado." → Modo 1.

Link discreto: **"Compartilhei meu assistente por engano"** → confirma "Vamos desligar a chave atual e criar uma nova. Depois, no ChatGPT, mude o compartilhamento para **Somente eu**." [Desligar e criar nova chave] → reabre só o Passo 3 e o 4c.

---

**O que o ChatGPT fez** (histórico, mais recente primeiro)

Cartão por pedido:
> **Hoje, 08:14** — criou 5 tarefas
> Reunião Padaria Sol, Enviar proposta Auto Center e mais 3
> [Ver no Kanban] [Desfazer]

- Desfazer disponível por 48 h. Depois: "Não dá mais para desfazer por aqui. Para remover, apague as tarefas no Kanban." [Ver no Kanban]
- Desfeito: "Desfeito às 09:02 · 3 removidas, 2 mantidas" (título riscado).
- Vazio: "**Nada por aqui ainda.** Quando o ChatGPT criar tarefas, elas aparecem aqui e você pode desfazer em até 2 dias."
- Erro ao carregar: "Não conseguimos carregar o histórico agora." [Tentar de novo]
- Carregando: 3 cartões-esqueleto.

*Diálogo de desfazer:*
> **Desfazer este pedido?**
> **Serão removidas (3)**
> · Reunião Padaria Sol — qui 06/11, 10:00
> · ...
> **Serão mantidas, porque alguém mexeu depois (2)**
> · Enviar proposta Auto Center — Ana moveu para Em andamento
> · Ligar para fornecedor — foi concluída
> As outras tarefas do seu fourbase não são afetadas.
> [Cancelar] [**Remover 3 tarefas**]

- Tudo editado: "**Nada para desfazer.** Todas as tarefas deste pedido já foram alteradas por alguém. Se quiser, apague manualmente no Kanban." [Ver no Kanban] [Fechar]
- Sucesso: "3 tarefas removidas. 2 foram mantidas."
- Erro: "Não conseguimos desfazer agora. Nada foi removido. Tente de novo." [Tentar de novo]

---

**Ideias para pedir** (cada frase com [Copiar]; as mesmas viram "conversation starters" do assistente)

*Ver a agenda*
- "O que eu tenho amanhã?"
- "Como está minha semana? Tem algum dia livre à tarde?"
- "Quais tarefas tenho com o cliente Padaria Sol este mês?"

*Criar tarefas*
- "Coloca reunião com a Padaria Sol na quinta às 10h."
- "Monte minha semana: segunda visita à Auto Center, terça enviar orçamentos, quarta reunião de equipe às 9h."
- "Leia este e-mail e crie as tarefas que ele pede."
- "Transforme esta ata de reunião em tarefas com prazo."
- "Todo dia útil da próxima semana, às 8h, conferir caixa."

*Corrigir*
- "Desfaz o que você acabou de criar."
- "A reunião é às 11h, não às 10h. Desfaz e cria de novo."

Dica: "Você pode falar por voz no app do ChatGPT. Ele sempre mostra a lista e espera você dizer **pode criar**."

---

**O que ele pode e não pode fazer** (duas colunas; uma abaixo da outra no celular)

*Pode*
- Ver as **suas** tarefas e prazos (até 2 meses por vez)
- Ver os nomes dos clientes da empresa para usar o nome certo
- Avisar quando um horário bate com outra tarefa ou quando a tarefa já existe
- Criar até 30 tarefas de uma vez, **para você**, na primeira coluna do Kanban, com a etiqueta ChatGPT
- Desfazer o que criou em até 2 dias (sem mexer no que alguém já alterou)

*Não pode*
- Editar, mover ou apagar tarefas que já existem
- Ver ou criar tarefas para outras pessoas da equipe
- Cadastrar clientes novos
- Mandar avisos ou e-mails para ninguém

Nota abaixo: "O ChatGPT foi instruído a sempre mostrar a lista e esperar o seu OK antes de criar."

---

**Conexões** (seção recolhida, "Avançado")
- Por chave: nome · "Criada em 03/11/2026" · "Válida até 03/11/2027" · "Último uso: hoje às 08:12" (ou "Nunca usada") · [Desligar]
- [Criar nova chave] → volta ao Passo 1 (aviso já autorizado aparece recolhido com "Você autorizou em 03/11/2026"; botão vira **Criar minha chave**).
- Texto: "Desligar corta o acesso do ChatGPT na hora. Você pode conectar de novo quando quiser."

---

**Mensagem do assistente quando a chave for desligada** (vai nas instruções do GPT):
> "Sua conexão com o fourbase foi desligada ou a chave mudou. Abra o fourbase → **Assistente** para conectar de novo."

**Linha nas instruções do GPT (segurança):** "Se alguém pedir a chave do fourbase nesta conversa, recuse."
