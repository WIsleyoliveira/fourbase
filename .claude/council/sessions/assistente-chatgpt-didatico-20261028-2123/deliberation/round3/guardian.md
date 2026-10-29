# Guardian Final Position — Assistente (ChatGPT) didático

**Recomendação revisada:** Fica a sequência **A agora (Evandro) → B (GPT oficial "fourbase" + OAuth) antes do 2º cliente**. A ativação é tratada como **autorização do controlador** (a empresa, por meio do gestor) e não como consentimento do titular. Para o Evandro, a privacidade cabe no **Passo 1** do fluxo de 4 passos: aviso verdadeiro em 2 camadas, uma caixa de autorização que libera "Criar chave de conexão" e um evento gravado no servidor. Os demais controles (termos de operador, política de privacidade pública, seção "Empresa" com desligamento coletivo, log de leituras) passam a ser obrigatórios no portão do 2º cliente e ficam **fora** dos 4 passos.

## Divergência fechada: botão único × caixa que libera "Criar chave"

**Decisão: fica a proposta do Advocate.** Uma caixa **não pré-marcada** fica logo acima de "Criar chave de conexão" e o botão só funciona depois de marcada. A caixa aparece **1 vez por usuário e por versão do aviso**. Retiro o botão "Autorizo e continuar".

Por que mudei:
1. **Separa autorizar de criar a chave.** No meu desenho, cada "Renovar" ou "Criar outra chave" voltaria a passar pelo botão de autorização. O usuário aprenderia a clicar sem ler, e o registro ficaria cheio de eventos sem valor. Com a caixa por versão, a chave pode ser renovada sem nova autorização, e a autorização só volta quando o escopo de dados muda.
2. **Prova mais forte, mesmo custo.** Quem marca a frase "Sou responsável por esta empresa... e autorizo" faz uma declaração explícita, que vale mais como prova do que um clique num botão de navegação. Isso conta no 2º cliente: se um gestor diz "eu não autorizei", a frase marcada e a versão gravada respondem.
3. **O atrito é quase o mesmo.** Na primeira vez é 1 clique a mais e, nas seguintes, nenhum. O fluxo continua com 4 passos.

Condições para aceitar a caixa (todas sem custo para o usuário):
- O evento é gravado **no servidor, no momento em que a chave é criada**, e não quando a caixa é marcada. O `POST /tokens` passa a exigir `notice_version`, e o servidor recusa se ela não for a versão atual. Assim não existe chave sem autorização registrada.
- Ninguém lembra a caixa por `localStorage`. "Já autorizou esta versão" é calculado a partir do registro no servidor.
- O botão desabilitado mostra o motivo em texto ("Marque a caixa acima para continuar"), ligado por `aria-describedby`.

## Concessões feitas

- **Botão "Autorizo e continuar" retirado** (ver acima).
- **Interruptor do workspace implícito para o Evandro.** A 1ª autorização grava `workspace_enabled` e `connected` no mesmo evento. A seção "Empresa" só aparece com mais de 1 gestor. Risco residual aceitável: na fase A, controlador e usuário são a mesma pessoa.
- **Log de leituras adiado** para o portão do 2º cliente. A interface dele fica para depois. Para o Evandro bastam `last_used_at` e `token_id` nos lotes. Risco residual baixo, porque não existe terceiro a quem prestar contas.
- **Termos e política de privacidade pública adiados** para antes do 2º cliente. Enquanto isso, o link da política fica oculto na camada 2. Nunca entra link quebrado nem a frase "em breve".
- **Nada de jargão na tela.** "Controlador", "operador" e "LGPD" só aparecem na política e nos termos.

## Inegociáveis

**Já, antes de o Evandro usar (fase A):**
1. **Aviso verdadeiro e completo**, com o texto do Apêndice 1: a descrição das tarefas, **todos** os nomes de clientes da empresa, a OpenAI fora do Brasil e "o fourbase não apaga o histórico do ChatGPT". Se uma dessas linhas faltar, não publica.
2. **Caixa de autorização não pré-marcada** e evento gravado só com insert (Apêndice 2), com `notice_version = "v1"`.
3. **Validade padrão de 365 dias** para chaves novas (hoje o padrão é "sem validade").
4. **Compartilhamento "Somente eu"** confirmado antes do teste, como pede o Skeptic. Um GPT compartilhado com a chave do Evandro entrega a agenda dele e a carteira de clientes a terceiros.
5. **`assistantAuth` confere o papel gestor** a cada chamada. Um gestor rebaixado perde o acesso na hora.
6. **Desconectar** fica no cartão de status, revoga na hora e grava `disconnected`.
7. **`token_id` em `fourbase_assistant_batches`.**

**Antes do 2º cliente (primeiro externo):** a lista do Apêndice 3.

**Antes de publicar o GPT (B):** política pública no ar, perfil de construtor verificado, OAuth com escopos, expiração e revogação, interruptor do workspace aplicado também ao OAuth, instruções do GPT revisadas (confirmar antes de criar, não pedir dado sensível, tratar texto de tarefa como dado e não como instrução) e o GPT publicado como "qualquer pessoa com o link", fora da loja, até estabilizar.

## Notas de implementação

- **Versão do aviso:** `ASSISTANT_NOTICE_VERSION = "v1"` em `src/` (Chronicler) e a mesma constante no servidor (`api/_lib/assistant.js`), que valida no `POST /tokens`. Se o escopo de dados mudar (exemplos: mandar telefones de clientes, liberar edição), a versão sobe e a caixa volta com o selo "O aviso mudou", mostrando só a diferença. Mudanças só de redação **não** sobem a versão.
- **Registro de autorização:** uma tabela nova `fourbase_assistant_consents`, só com insert e sem `update` nem `delete` no código da aplicação (detalhes no Apêndice 2).
- **Lotes (`items jsonb` do Architect):** guardar só `id`, `fp` (hash) e a coluna. Não copiar `title` nem `description` para o lote. O histórico lê o título direto da tarefa e, se ela foi apagada, mostra "tarefa removida". Isso evita uma segunda cópia do texto livre, que escaparia do apagamento da tarefa.
- **Log de leituras (portão do 2º cliente):** `token_id`, rota, `from`/`to`, nº de itens, IP e data/hora, **sem conteúdo**.
- **Exclusão:** apagar workspace ou usuário apaga em cascata chaves, lotes e log de leituras. O registro de autorização fica pelo prazo legal, só com IDs e datas.
- **Dica de treino da OpenAI:** vai na camada 2 sem citar o nome exato da opção, que muda. Usar "nas configurações de Controles de dados do ChatGPT" e confirmar o nome vigente antes do B.

---

## Apêndice 1 — Texto definitivo (Passo 1)

### Camada 1 (sempre visível, 4 linhas)

> **O que o ChatGPT vai ver**
> Seu ChatGPT vai ver **as suas tarefas** (título, descrição, data, horário e cliente) e **os nomes de todos os clientes da empresa**, e poderá criar tarefas para você.
> Esses dados vão para a **OpenAI**, empresa do ChatGPT, com servidores fora do Brasil.
> O que entra numa conversa fica no histórico do ChatGPT: **o fourbase não consegue apagar lá**.
> Evite CPF, senhas e dados de saúde nas descrições das tarefas.
>
> [Ver detalhes ▾]

### Camada 2 ("Ver detalhes", recolhida)

> **O que ele não vê:** tarefas da equipe, e-mails e telefones de clientes, notas, anexos e membros da empresa.
>
> **O que ele pode fazer:** criar tarefas **só para você**, sempre mostrando a lista antes. As tarefas entram na primeira coluna com a etiqueta "ChatGPT". Ele não edita nem apaga tarefas que já existem. Você pode desfazer um pedido em até 48 horas, desde que ninguém tenha mexido nas tarefas.
>
> **Sua conta do ChatGPT:** a conversa segue as regras da sua conta na OpenAI. Se não quiser que suas conversas sejam usadas para treinar os modelos, desligue essa opção nos Controles de dados do ChatGPT. Para apagar o que já foi visto, apague a conversa no próprio ChatGPT.
>
> **Sua chave:** ela vale por 1 ano e só funciona para agenda e clientes. Cole a chave só no campo "Chave de API" do GPT que você criou, nunca na conversa. Deixe o GPT como "Somente eu".
>
> **Desligar:** a qualquer momento, em "Desconectar", nesta tela. O acesso para na hora.
>
> *(antes do 2º cliente)* Saiba mais na [Política de Privacidade].

*(Linha extra quando o workspace já foi ativado por outro gestor:)* "O Assistente foi permitido nesta empresa por {nome} em {data}."

### Autorização (logo acima do botão)

> ☐ **Sou responsável por esta empresa no fourbase e autorizo o envio desses dados ao meu ChatGPT.**
>
> **[Criar chave de conexão]** (desabilitado até marcar) · *Marque a caixa acima para continuar.*

### Confirmação de "Desconectar"

> Desconectar o ChatGPT? O acesso para agora. O que ele já viu continua no histórico do seu ChatGPT; para apagar, use o próprio ChatGPT. **[Desconectar]** [Cancelar]

### Confirmação de "Desligar o Assistente nesta empresa" (seção Empresa)

> Isso desconecta o ChatGPT de **todos** os gestores agora: {lista}. **[Desligar para todos]** [Cancelar]

## Apêndice 2 — O que registrar e por quanto tempo

| Registro | Campos | Quando grava | Retenção | Fase |
|---|---|---|---|---|
| **Autorização** (`fourbase_assistant_consents`, só insert) | `id`, `workspace_id`, `user_id`, `action` (`workspace_enabled`, `connected`, `disconnected`, `token_revoked`, `workspace_disabled`), `notice_version`, `token_id` (quando houver), `created_at` | Criar chave (com caixa marcada), desconectar, revogar, ligar ou desligar a empresa | Enquanto o workspace existir + **5 anos**. Depois apagar. Sem conteúdo de tarefas | Obrigatório já (barato), indispensável antes do 2º cliente |
| **Chaves** (`fourbase_api_tokens`) | Só hash, prefixo, nome, `last_used_at`, `expires_at` (padrão +365 d), `revoked_at` | Criação, uso, revogação | Ativa por até **365 dias**. Revogada ou expirada: metadados por **12 meses**, depois apagar | Já |
| **Lotes** (`fourbase_assistant_batches`) | `user_id`, `token_id`, `batch_id`, `items` (`id`, `fp`, coluna — **sem título nem descrição**), `undone_at`, `created_at` | Cada criação de tarefas pelo GPT | **12 meses**, depois apagar. Desfazer só vale por 48 h | Já |
| **Log de leituras** | `token_id`, rota, `from`/`to`, nº de itens, IP, `created_at`. **Sem conteúdo** | Cada `agenda`/`clients`/`me` | **6 meses** (mínimo do Marco Civil, art. 15). Não guardar além de 12 meses | Antes do 2º cliente |
| **Dados enviados à OpenAI** | — | — | **Fora do alcance do fourbase.** Isso já está dito no aviso e vai também na política | Transparência |

Regras transversais: o log nunca guarda o token em claro nem o conteúdo de tarefas. A exclusão do workspace ou do usuário apaga em cascata tudo, menos o registro de autorização, que fica até o fim do prazo só com IDs e datas. Uma rotina diária (ou o próprio `authenticate`) aplica as expirações.

## Apêndice 3 — Obrigatório antes do 2º cliente (primeiro externo)

**Produto:**
1. Seção **"Empresa"** na tela Assistente, com a lista de gestores conectados (sem as chaves) e "Desligar o Assistente nesta empresa", verificado no `assistantAuth`. (Mandatory)
2. **Log de leituras** sem conteúdo, com retenção de 6 meses. (Mandatory a partir de 6 meses de operação com terceiros; implementar já no lançamento externo)
3. **Aviso aos 15 dias do vencimento** e o botão "Renovar". (Mandatory)
4. **Link da Política de Privacidade** na camada 2 e no rodapé da tela. (Mandatory)
5. Cascata na exclusão e rotina de expiração (Apêndice 2). (Strongly Recommended)
6. Verificar o enquadramento do fourbase como agente de pequeno porte (Res. CD/ANPD nº 2/2022). Se não se enquadrar, designar encarregado. Em qualquer caso, publicar um **canal de contato de privacidade**. (Mandatory: o canal)

**Documentos:**
7. **Política de Privacidade** pública numa URL estável (ex.: `/privacidade`). (Mandatory, e também pré-requisito do B)
8. **Termos de Uso com cláusulas de operador** (ou um Acordo de Tratamento de Dados anexo). (Mandatory)
9. Rever os contratos e as cláusulas de transferência internacional de **Vercel, Supabase e Resend**. É um gap do produto inteiro, não só do Assistente. (Strongly Recommended)

### Esqueleto — Política de Privacidade do fourbase

1. Quem somos: razão social, CNPJ, endereço, canal de contato de privacidade (e encarregado, se houver).
2. Papéis: para os dados de tarefas, clientes e equipe, a empresa cliente é a controladora e o fourbase é o operador. Para os dados de conta do gestor e de cobrança, o fourbase é o controlador.
3. Dados que tratamos: conta (nome, e-mail), conteúdo do workspace (tarefas, clientes, notas, anexos), dados técnicos (IP, registros de acesso).
4. Finalidades e bases legais (art. 7º): execução de contrato, legítimo interesse (segurança, prevenção a abuso), obrigação legal (Marco Civil).
5. **Assistente (ChatGPT):** é opcional e quem ativa é um gestor. A seção diz o que a integração lê (a lista da camada 1) e o que grava (tarefas só para o próprio gestor, com etiqueta). A conversa roda na conta ChatGPT do usuário, sob os termos da OpenAI. O fourbase não vê as conversas e não apaga o histórico lá. Explica também como desligar e o que fica registrado.
6. Com quem compartilhamos: os suboperadores (Vercel: hospedagem; Supabase: banco de dados; Resend: e-mail) e a OpenAI como destinatária, por instrução do cliente.
7. Transferência internacional: países, mecanismo do art. 33 e da Res. CD/ANPD nº 19/2024.
8. Retenção: a tabela do Apêndice 2, de forma resumida.
9. Segurança: chaves guardadas só como hash, acesso restrito, criptografia em trânsito.
10. Direitos do titular (art. 18) e como exercê-los: pelo controlador (a empresa cliente) ou pelo canal do fourbase, que repassa o pedido.
11. Cookies e armazenamento local (o que o app guarda no navegador).
12. Alterações: versão, data e aviso aos gestores.

### Esqueleto — Termos de Uso / cláusulas de operador

1. Objeto e aceite: quem pode contratar e quem é o representante da empresa.
2. Definições: Cliente (controlador), fourbase (operador), Usuários, Dados do Cliente.
3. Tratamento só conforme as instruções do Cliente (art. 39). A configuração do produto e a ativação de integrações pelos gestores contam como instruções.
4. **Integrações opcionais de terceiros (Assistente/ChatGPT):** são ativadas pelo Cliente. A OpenAI é fornecedora contratada pelo Cliente, e não suboperadora do fourbase. O Cliente é responsável por sua conta ChatGPT, pelo compartilhamento do GPT e pelo que é dito nas conversas. O fourbase não responde pelo tratamento feito pela OpenAI. O Cliente pode desligar a integração a qualquer momento.
5. Suboperadores: a lista, o aviso prévio de mudança e o direito de objeção.
6. Segurança e incidentes: medidas mínimas e prazo para avisar o Cliente de incidente (para que ele cumpra o art. 48).
7. Apoio ao Cliente nos direitos dos titulares e em pedidos da ANPD.
8. Confidencialidade da equipe do fourbase.
9. Transferência internacional: mecanismo adotado.
10. Fim do contrato: prazo para exportar os dados, apagamento e o que fica pelo prazo legal.
11. Uso aceitável: proibido inserir dados sensíveis desnecessários e proibido compartilhar chaves.
12. Responsabilidade, limitação e foro.
