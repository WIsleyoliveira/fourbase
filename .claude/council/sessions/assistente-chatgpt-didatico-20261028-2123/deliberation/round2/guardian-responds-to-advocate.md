# Guardian responde ao Advocate

**Posição dele:** lançar já a tela "Assistente" com um assistente de configuração em 4 passos (caminho A, "chave de conexão"), com teste automático de "Conectado" e histórico com desfazer via login normal, e tratar o caminho B (GPT publicado + OAuth) como destino para os próximos clientes. O consentimento fica numa caixa curta "O que o ChatGPT vai ver" com o botão "Entendi, continuar", sem etapas extras.

**Minha resposta:** **Modificar.** Aceito o fluxo de 4 passos como está. Encaixo os controles de compliance *dentro* dele ou *atrás* dele (no servidor, sem nada para o usuário fazer), e separo o que vale já para o Evandro do que vale antes do 2º cliente.

## Decisão item a item

| Item (Rodada 1) | Decisão | JÁ, para o Evandro (fase A, uso interno) | Antes do 2º cliente (primeiro externo) |
|---|---|---|---|
| **Aviso** | **Modificar.** Funde-se com a caixa "O que o ChatGPT vai ver" do Advocate, antes do Passo 1. Nenhuma tela a mais. | **Obrigatório** (custa só texto). Corrigir o rascunho do Advocate: a rota `agenda` devolve **`description`** (`taskView` em `api/_lib/routes/assistant.js`). O aviso precisa citar a descrição, que os dados saem do Brasil e que o fourbase não consegue apagar o que ficou no histórico do ChatGPT. Um aviso que omite isso não é verdadeiro. | Obrigatório, com **número de versão** (`v1`) e link para a Política de Privacidade pública. Se o escopo de dados mudar, sobe a versão e pede de novo. |
| **Caixa "autorizo em nome da empresa"** | **Modificar.** Sai a caixa de marcar e entra **o próprio botão do fluxo**, com o texto de autorização logo acima dele ("Autorizo e continuar"). Como se trata de uma instrução do controlador ao operador (LGPD art. 39) e não de consentimento do titular, uma ação clara de clicar basta; a caixa só acrescentaria atrito. | **Fortemente recomendado:** no clique, o servidor grava um evento (workspace, usuário, data/hora, `notice_version`) só com insert. O Evandro não vê nada disso. Se atrasar, pode ficar para depois, porque aqui o controlador é a própria Fourbase. | **Obrigatório:** o registro do evento precisa existir, porque é a prova de quem autorizou. Também é obrigatório gravar o desligamento (`disconnected`) no mesmo registro. |
| **Interruptor do workspace** | **Adiar** (e simplificar). Com um único gestor, que também é o dono, ele não protege ninguém. | **Não exigido.** | **Obrigatório**, mas sem passo novo no fluxo: o Assistente vem **permitido por padrão** e a primeira autorização equivale a "ligar". Na área "Conexões", **qualquer gestor vê quais gestores estão conectados** (sem ver as chaves) e tem um botão **"Desligar o Assistente nesta empresa"**, que derruba todas as conexões na hora (checagem no `authenticate`). Assim um gestor não manda sozinho, e sem ninguém saber, a carteira de clientes para o próprio ChatGPT. |
| **Log de leituras** | **Adiar.** | **Não exigido.** Basta o que já existe: `last_used_at` (o Advocate usa esse campo para o "Conectado") e, de preferência, **`token_id` em `fourbase_assistant_batches`**, que o Advocate também pede para o histórico. | **Fortemente recomendado** no lançamento externo. Vira **obrigatório** quando somar 6 meses de operação com terceiros (Marco Civil art. 15). Guarda token, rota, período, nº de itens, IP e data/hora, **sem conteúdo**. Se der tempo, alimenta a linha opcional "consultas recentes" do Advocate. |
| **Validade padrão da chave** | **Modificar.** Fica invisível no fluxo: sem campo e sem pergunta. | **Fortemente recomendado já** (uma linha de código): padrão de **365 dias** em vez de "sem validade", com "Válida até" em "Conexões (Avançado)". Fazer já evita criar chaves eternas que depois seria preciso migrar. | **Obrigatório**, com aviso na tela 15 dias antes de vencer e o botão "Conectar de novo" que o Advocate já desenhou. |

**Condições sobre o desenho do Advocate (sem custo de atrito):**
- "A chave fica guardada na tela até terminar o passo 3": só **em memória** (estado React). Nada de `localStorage`, nada de reenviar ao servidor, e ela some ao sair da tela.
- "Criar outra chave desliga a anterior": aprovado. Reduz chaves esquecidas e é o tipo de controle que eu quero.
- "Não pode... fazer nada sem você confirmar": manter "foi instruído a". Ele mesmo aponta que isso não é trava do servidor.

## Raciocínio

O Advocate tem razão: atrito no fluxo de configuração mata a adoção, e para o Evandro a carga regulatória real é baixa. Na fase A a Fourbase é ao mesmo tempo controladora e usuária, então caixa de marcar, interruptor e log de leitura protegeriam a empresa dela mesma. O que não abro mão é de o aviso ser **verdadeiro e completo** já: ele precisa citar a descrição, a OpenAI, a saída do Brasil e o histórico que o fourbase não apaga. Isso é só texto e serve de modelo para os próximos clientes. Também peço que os controles baratos e invisíveis (evento de autorização, `token_id`, validade de 365 dias) entrem agora, porque colocá-los depois, com chaves já emitidas, sai mais caro. O risco muda quando entra o 2º cliente. Aí o fourbase passa a ser **operador** de um terceiro, a rota `clients` entrega a carteira inteira do workspace e qualquer gestor pode ligar sozinho. Nesse momento registro, visibilidade e desligamento coletivo passam a ser obrigatórios, junto com termos e política pública (Rodada 1, Apêndice 8). Mesmo assim tudo cabe fora dos 4 passos: na área "Conexões" e no servidor. O resultado é que o Evandro conecta em poucos minutos e o produto chega ao 2º cliente sem retrabalho.

## Texto final do aviso (cabe na caixa "O que o ChatGPT vai ver", antes do Passo 1)

> **O que o ChatGPT vai ver**
>
> O **seu** ChatGPT vai ver **as suas tarefas** (título, descrição, data e cliente) e **os nomes dos clientes da empresa**, e poderá **criar tarefas para você**. Ele não vê tarefas da equipe e não altera nem apaga tarefas que já existem.
>
> Esses dados vão para a **OpenAI**, empresa do ChatGPT, com servidores fora do Brasil, e seguem as regras da sua conta do ChatGPT. O que entrar numa conversa fica no histórico do ChatGPT: **o fourbase não consegue apagar lá**.
>
> Dica: cole a chave **só no campo de Autenticação**, nunca na conversa. Evite CPF, senhas ou dados de saúde nas descrições.
>
> *Ao continuar, você autoriza, como responsável pela empresa, o envio desses dados ao seu ChatGPT. Você pode desligar quando quiser nesta tela.*
>
> **[Autorizo e continuar]**  ·  Política de Privacidade *(link obrigatório antes do 2º cliente)*

São cerca de 90 palavras, uma caixa e um clique, que é o mesmo número de cliques do "Entendi, continuar" do Advocate. O clique grava `notice_version = v1`.
