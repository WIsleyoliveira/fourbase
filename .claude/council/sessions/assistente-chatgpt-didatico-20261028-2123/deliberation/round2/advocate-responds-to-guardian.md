# Advocate Response to Guardian — Assistente (ChatGPT) didático

**Their position:** a ativação é uma instrução do controlador (empresa), então a tela precisa de aviso curto, caixa "autorizo em nome da empresa" registrada com versão do texto, interruptor no nível do workspace, botão de desligar visível e log de leituras sem conteúdo.

**Resumo:** Manter o aviso e o desligar; Modificar a caixa de autorização e o interruptor (fundidos num só gesto para o Evandro); Manter o log de leituras no servidor, Adiar a parte visível dele.

---

## 1. Aviso de privacidade — **Manter (com ajuste de lugar e tamanho)**

**Raciocínio:** concordo com o conteúdo, e ele já estava no meu desenho ("O que o ChatGPT vai ver", antes do passo 1). O que não aceito é o aviso virar uma parede de texto antes de o Evandro entender o que ganha: ele precisa ler primeiro "Como funciona" (3 cartões) e depois o aviso, nessa ordem, porque informação sem contexto não informa — ele clica "aceito" sem ler, e aí nem a LGPD nem a UX ganham. Por isso o aviso **não vira um passo novo**: ele é o cabeçalho do Passo 1, em duas camadas. **Camada 1** (sempre visível, 4 linhas): "Seu ChatGPT vai ver **suas** tarefas (título, descrição, data) e **os nomes de todos os clientes da empresa**. Esses dados vão para a OpenAI, fora do Brasil. O que entra no ChatGPT fica no histórico dele: o fourbase não apaga lá. Evite CPF, dados de saúde e senhas nas descrições." **Camada 2** ("Ver detalhes", recolhida): o restante do texto-exemplo do Guardian, o link da Política de Privacidade (quando existir) e a dica de desligar o uso para treino no ChatGPT. O mesmo texto continua acessível no Modo 2 pelo link "O que o ChatGPT vê", ao lado do status. Adoto a correção do Guardian sobre clientes: meu texto dizia "a lista de clientes" de forma vaga; tem que dizer "**todos** os nomes de clientes da empresa", porque é verdade e é o ponto que mais importa para um dono de empresa.

## 2. Caixa "autorizo em nome da empresa" — **Modificar**

**Raciocínio:** aceito a ação afirmativa (caixa não pré-marcada) e o registro com versão do texto: custa um clique e protege o Evandro e a Fourbase. Modifico duas coisas. (a) **Linguagem:** "Sou responsável por esta empresa no fourbase e autorizo o envio desses dados ao meu ChatGPT" é bom; "controlador/operador/instrução" não aparecem em nenhum texto visível. (b) **Posição e efeito:** a caixa fica **imediatamente acima** do botão principal do Passo 1, e "Criar chave de conexão" fica desabilitado até marcar, com ajuda visível e não só cor cinza ("Marque a caixa acima para continuar", ligada por `aria-describedby`). Não existe botão "Ligar Assistente" separado de "Criar chave": é **um único gesto** que autoriza e começa. A caixa aparece **uma vez por usuário e por versão do aviso**; se o texto mudar (escopo de dados maior), ela volta com o selo "O aviso mudou" mostrando só a diferença. Repetir a cada nova chave viraria ruído que treina o "aceitar sem ler".

## 3. Interruptor do workspace — **Modificar (implícito agora; seção própria antes do 2º cliente)**

**Raciocínio:** o risco é real (qualquer gestor leva a lista inteira de clientes para o próprio ChatGPT), mas um interruptor separado antes do stepper cria um "passo zero" que, para o Evandro, é pura burocracia: ele é o único responsável pela empresa e teria que "ligar a empresa" e depois "ligar a si mesmo". Proposta: **o primeiro gestor que marca a caixa do item 2 liga o interruptor do workspace implicitamente** (o registro grava `workspace_enabled` + `connected` no mesmo evento, com a mesma versão do aviso). Para o Evandro, zero cliques a mais. Quando o workspace tiver **mais de um gestor**, o interruptor aparece como bloco próprio na tela Assistente, seção "Empresa" (com atalho em Equipe): "Assistente permitido nesta empresa [ligado]" + "Gestores conectados: Evandro (último uso hoje), Ana (nunca usou)" — sem mostrar chaves. Um segundo gestor que chegar com o interruptor ligado vê uma linha a mais no aviso: "O Assistente foi permitido nesta empresa por Evandro em 03/11." Se estiver desligado, o Passo 1 vira um estado vazio honesto: "O Assistente está desligado nesta empresa. Peça a quem autorizou para ligar." — nunca um erro técnico. Desligar o interruptor pede confirmação com a consequência explícita: "Isso desconecta o ChatGPT de **todos** os gestores agora: Evandro, Ana." Concordo que a seção visível é **obrigatória antes do 2º cliente externo**; para o Evandro hoje, a versão implícita basta.

## 4. Botão de desligar — **Manter**

**Raciocínio:** é o meu "Desligar/Desconectar"; adoto o pedido de que seja tão fácil quanto ligar. Mudança no meu desenho: ele **sai do rodapé "Avançado"** e vai para o cartão de status como ação secundária (botão de contorno, ao lado de "Abrir meu GPT fourbase", que continua sendo a ação primária). Confirmação em uma frase: "Desconectar o ChatGPT? O acesso para agora. O que ele já viu continua no histórico do seu ChatGPT; para apagar, use o próprio ChatGPT." Depois a tela volta ao Modo 1 com "Conectar de novo". A lista de chaves individuais continua em "Avançado".

## 5. Log de leituras — **Manter no servidor, Adiar a interface**

**Raciocínio:** gravar token, rota, período consultado, nº de itens e data/hora, sem conteúdo, é invisível para o usuário e não toca o fluxo de 4 passos — sem objeção. E resolve um problema meu: é uma fonte melhor que o `last_used_at` para o status e para o teste final ("o ChatGPT acabou de consultar sua agenda de 03/11 a 09/11"). A exibição no histórico fica como follow-up: no lançamento o histórico mostra só pedidos que criaram tarefas, para não poluir a tela com dezenas de leituras. Quando entrar, entra **agrupado** ("3 consultas hoje") e recolhido.

## 6. Itens do Guardian que adoto sem discussão

- **Validade padrão da chave (365 dias):** mostrar "Válida até 03/11/2027" em Conexões e um aviso no cartão de status 15 dias antes, com um único botão "Renovar" (gera chave nova e reabre só o Passo 3, onde ela é colada).
- **Dicas de segurança:** não vão num bloco separado; cada uma fica **no passo em que o erro acontece** (não colar a chave na conversa → Passo 3, ao lado do copiar; não pôr CPF/saúde → camada 1 do aviso; treino → camada 2). Dica longe do gesto não é lida.

## Implicação para o fluxo

Continua igual em número de passos: Como funciona → **Passo 1 (aviso em 2 camadas + caixa + Criar chave)** → Passo 2 (abrir ChatGPT) → Passo 3 (endereço e chave) → Passo 4 (instruções e compartilhamento) → Teste. Nenhum passo novo para o Evandro; em workspaces com vários gestores, aparece a seção "Empresa".

**Dependências:** Architect — tabela de registro (`connected`/`disconnected`/`workspace_enabled`/`workspace_disabled`, versão do aviso), checagem do interruptor no `assistantAuth`, endpoint JWT de "gestores conectados" e log de leituras como fonte do status. Chronicler — versão numerada do aviso como constante em `src/`, para a caixa saber quando reaparecer.
