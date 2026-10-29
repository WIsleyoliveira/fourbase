# Guardian Position — Assistente (ChatGPT) levando agenda e clientes para a OpenAI

**Recomendação central:** Seguir a sequência **A agora → B antes de escalar**, tratando a ativação como uma **autorização do controlador (a empresa cliente, via gestor)** e não como "consentimento do titular": a tela "Assistente" precisa de um aviso curto, um registro de quem ligou e quando, um interruptor no nível do workspace e um botão de desligar visível. Antes do 2º cliente (externo), o fourbase precisa de termos/contrato que o definam como operador e de uma política de privacidade pública que mencione a integração com a OpenAI — esta última é também pré-requisito técnico para publicar o GPT do caminho B.

**Argumento-chave:**
Pela LGPD, a empresa cliente é a **controladora** dos dados das próprias tarefas e dos próprios clientes (art. 5º, VI) e o fourbase é **operador** (art. 5º, VII; art. 39 — trata "segundo as instruções do controlador"). Quando o gestor liga o Assistente, ele dá uma instrução do controlador para que o fourbase entregue dados a um terceiro (OpenAI) com quem *ele* tem contrato (a assinatura do ChatGPT). Essa instrução é legítima, mas só é defensável se for **informada e registrada**: o que sai (títulos, descrições, horários, nomes de clientes), para onde (OpenAI, servidores fora do Brasil — transferência internacional, art. 33 e Resolução CD/ANPD nº 19/2024), e que o fourbase **não consegue apagar** o que já entrou no histórico do ChatGPT. Hoje o código (`api/_lib/routes/assistant.js`) já está bem desenhado em minimização de escopo — só as tarefas do próprio dono (`assigned_to = req.user.id`), só `id`/`name` dos clientes, sem editar/apagar, desfazer 48 h, token só com hash — mas não há aviso, não há registro da autorização, não há controle do workspace (qualquer gestor pode, sozinho, mandar a lista inteira de clientes da empresa para o próprio ChatGPT) e o campo `description`, texto livre, pode carregar dado sensível (art. 11: saúde, por exemplo, em clínicas) ou CPF/telefone de pessoas físicas. Nada disso exige grande obra: são uma tela, uma coluna/tabela de registro e um parágrafo de política.

**Riscos se ignorado:**
- **Regulatório (Alto, para clientes externos):** operar para terceiros sem contrato/termo que defina papéis, sem listar suboperadores e sem informar transferência internacional expõe o fourbase como corresponsável (art. 42) por um vazamento ou uso indevido no lado da OpenAI. Para o uso interno da própria Fourbase o risco é Baixo.
- **Privacidade/PII (Médio-Alto):** descrições livres e nomes de clientes pessoa física vão para a OpenAI; em planos pessoais do ChatGPT (Plus) o conteúdo pode ser usado para treinar modelos se o usuário não desligar essa opção (verificar a configuração atual da OpenAI — incerto e muda). Cópias ficam no histórico de conversas e escapam de qualquer exclusão feita no fourbase. O gestor leigo pode ainda **colar o token na conversa** em vez do campo de autenticação, e aí o segredo fica no histórico do chat.
- **Auditoria/Accountability (Médio):** se um cliente ou a ANPD perguntar "quem autorizou o envio, quando, e o que foi lido?", hoje só existe `last_used_at` no token e `fourbase_assistant_batches` (que registra escritas, não leituras, nem qual token/conexão fez o lote).

**Dependências de outros domínios:**
- **Architect:** interruptor por workspace + tabela de registro de ativação; `token_id` em `fourbase_assistant_batches`; log enxuto de leituras (sem conteúdo); no B, servidor OAuth com escopos, revogação e expiração.
- **Advocate/Chronicler:** texto do aviso em linguagem simples, tela "Assistente" com status Conectado/Desligado, histórico de lotes e desfazer.
- **Skeptic:** threat model do token copiado/colado na conversa e de prompt injection via título/descrição de tarefa (dado vira instrução para o GPT).
- **Strategist:** quando cai o portão "2º cliente externo" e o portão "publicar GPT".

---

## Apêndice 1 — Matriz de aplicabilidade

| Norma | Aplica? | Obrigações-chave | Situação atual |
|---|---|---|---|
| LGPD (Lei 13.709/2018) | Sim | Papéis (art. 5º, 37–39), bases legais (art. 7º/11), transparência (art. 6º VI, art. 9º), transferência internacional (art. 33), segurança (art. 46), direitos do titular (art. 18), encarregado/canal (art. 41) | Gap (aviso, registro, contrato, política) |
| Res. CD/ANPD nº 2/2022 (agentes de pequeno porte) | Provável | Simplificações (registro simplificado, encarregado dispensado, mas **canal de comunicação obrigatório**) | Verificar enquadramento do fourbase |
| Res. CD/ANPD nº 19/2024 (transferência internacional) | Sim (OpenAI e, já hoje, Vercel/Supabase/Resend) | Mecanismo válido (cláusulas-padrão/contratuais ou outra hipótese do art. 33) e transparência | Unknown — verificar DPAs dos fornecedores |
| Marco Civil (Lei 12.965/2014) art. 15 | Parcial | Guarda de registros de acesso a aplicação por 6 meses (provedor de aplicação com fins econômicos) | Gap: não há log de acesso das rotas do assistente |
| Políticas da OpenAI para GPTs/Actions | Sim no B (e parcialmente no A) | Política de privacidade pública, perfil de construtor verificado, políticas de uso | Não existe política no repositório (busca em `src/`, `docs/`, `public/` sem resultado) |
| GDPR/CCPA/HIPAA/PCI | Não | Público brasileiro, sem saúde regulada nos EUA nem cartões | n/a |

## Apêndice 2 — Classificação dos dados expostos

Fonte: `taskView` e rota `/clients` em `api/_lib/routes/assistant.js`.

| Dado | Rota | Classe | Observação / controle |
|---|---|---|---|
| `title` da tarefa | agenda, tasks, preview | **Confidencial (negócio)**, às vezes pessoal | Pode conter nome de pessoa ("Ligar p/ Dona Maria") |
| `description` | agenda, tasks | **Confidencial, potencialmente sensível** (texto livre) | Maior risco: CPF, telefone, saúde. **Recomendado:** opção "enviar descrições" (desligada por padrão no B) ou corte a N caracteres |
| `due_date`/`due_time`/`*_end` | agenda | Interno; revela rotina do gestor | Pessoal do gestor (titular = o próprio usuário) |
| `priority`, `status` (rótulo da coluna), `tags` | agenda | Interno | Baixo |
| `client_id` + lista `clients` (`id`, `name`) | clients, agenda | **Pessoal quando o cliente é pessoa física**; confidencial (carteira comercial) | A rota devolve **todos** os clientes do workspace, não só os do gestor. Aceitável (o GPT precisa casar nomes), mas é o principal motivo para exigir autorização no nível do workspace |
| `id` das tarefas / `link` | tasks | Interno | Baixo |
| Token `fbk_…` | — | **Segredo** | Só hash no banco (ok). Risco é humano: colar na conversa |
| Não exposto (bom): e-mails, telefones de clientes, membros, menções, anexos, notas | — | — | Manter assim; qualquer ampliação de escopo exige nova autorização |

## Apêndice 3 — Papéis LGPD em A vs B

| Agente | Caminho A (token colado no GPT do usuário) | Caminho B (GPT "fourbase" publicado, OAuth) |
|---|---|---|
| **Empresa cliente (via gestor)** | **Controladora.** Decide enviar seus dados a um fornecedor que ela mesma contratou (OpenAI). | **Controladora** dos dados das tarefas/clientes. Ainda é quem decide conectar. |
| **fourbase** | **Operador.** Só disponibiliza a API e executa a instrução. Responsabilidade menor, mas deve informar e registrar. | **Operador** quanto aos dados, porém **autor e publicador** da ferramenta (instruções, nome, marca). Assume dever maior de transparência: política pública, descrição exata do que o GPT faz, cuidado com as instruções (minimização, não inventar cliente). Discutível se vira cocontrolador do fluxo — tratar como operador com contrato robusto e política clara. |
| **OpenAI** | Fornecedor contratado **pelo cliente** (termos do ChatGPT do usuário). Não é suboperador do fourbase. | Continua sendo fornecedor do usuário (a conversa roda na conta dele). O criador do GPT **não vê** as conversas (verificar na documentação atual). O fourbase **deve** listá-la na política como destinatária e informar a transferência internacional, mesmo sem contratá-la. |
| Titulares (clientes pessoa física, o próprio gestor) | Base legal do controlador: execução de contrato / legítimo interesse (art. 7º V e IX). **Não** é consentimento deles. | Igual. |

Consequência prática: o "aceite" na tela não é "consentimento LGPD" — é a **autorização/instrução do controlador** ao operador. O texto deve dizer isso de forma simples ("Você, como responsável pela empresa, autoriza…").

**Ponto a favor do B em compliance:** a tela de login OAuth mostra os escopos, não há segredo para copiar/colar, a revogação é natural e cada cliente não precisa montar Actions sozinho (menos erros de configuração que vazam token).

## Apêndice 4 — O que a tela "Assistente" precisa dizer e obter

1. **Aviso curto antes de ligar** (ver texto-exemplo). Mostrado na primeira ativação e sempre acessível por um link "O que o ChatGPT vê".
2. **Ação afirmativa do gestor**: caixa **não** pré-marcada "Li e autorizo, em nome da empresa" + botão "Ligar Assistente". Registrar: `workspace_id`, `user_id`, data/hora, **versão do texto do aviso**, ação (ligou/desligou).
3. **Quem pode ativar:**
   - **Interruptor do workspace** ("Assistente permitido nesta empresa"): só gestor. Recomendação forte, obrigatório antes do 2º cliente externo: hoje qualquer gestor (`gestorOnly`) gera token e leva a lista inteira de clientes.
   - **Conexão pessoal**: só gestor, para si mesmo (como hoje). Funcionário: **não** nesta etapa; se vier depois, só com o interruptor do workspace ligado e sem a lista completa de clientes.
   - Se o interruptor do workspace for desligado, **todos os tokens/conexões do workspace param na hora** (checagem no `authenticate`).
4. **Desligar tão fácil quanto ligar:** botão "Desconectar o ChatGPT" na própria tela (revoga tokens/OAuth), com aviso de que o que já foi para o ChatGPT fica lá e deve ser apagado no próprio ChatGPT.
5. **Status:** Conectado / Desligado, último uso (já existe `last_used_at`), validade.
6. **Dicas de segurança em 3 linhas:** não cole o token na conversa, só no campo de autenticação; não coloque CPF, dados de saúde ou senhas nas descrições; no ChatGPT, desligue "melhorar o modelo para todos" se não quiser que suas conversas sejam usadas em treino (verificar nome atual da opção).

### Texto-exemplo do aviso (linguagem simples)

> **Antes de ligar o Assistente**
>
> Com o Assistente ligado, o **seu ChatGPT** passa a ver **as suas tarefas** (título, descrição, data e horário) e **a lista de nomes de clientes da empresa**, e pode **criar tarefas para você** — sempre mostrando a lista antes e marcando com a etiqueta "ChatGPT". Ele não edita nem apaga tarefas que já existem, e você pode desfazer um lote em até 48 horas.
>
> **O que você precisa saber:**
> - Essas informações vão para a **OpenAI** (empresa do ChatGPT), com servidores fora do Brasil, e seguem as regras da **sua** conta do ChatGPT.
> - O que entrar numa conversa fica no histórico do ChatGPT. **O fourbase não consegue apagar lá** — você apaga pelo próprio ChatGPT.
> - Evite colocar CPF, dados de saúde ou senhas nas descrições das tarefas.
> - Você pode desligar a qualquer momento aqui nesta tela; o acesso para na hora.
>
> ☐ Sou responsável por esta empresa no fourbase e autorizo o envio desses dados ao meu ChatGPT.
>
> [Ligar Assistente]   [Agora não]   ·   Saiba mais na Política de Privacidade

## Apêndice 5 — Exigências para publicar o GPT (caminho B)

- **Política de privacidade pública** em URL estável do domínio do fourbase (exigida pela OpenAI para GPT com Actions publicado — confirmar requisito atual). Conteúdo mínimo: quem é o fourbase (CNPJ, contato), quais dados a Action lê e grava (lista do Apêndice 2), finalidade, que a conversa roda na conta ChatGPT do usuário sob os termos da OpenAI, transferência internacional, retenção (Apêndice 7), direitos do art. 18 e como exercê-los, **canal do encarregado** (ou canal de comunicação, se agente de pequeno porte), suboperadores (Vercel, Supabase, Resend, e o papel da OpenAI).
- **Termos de uso** do fourbase (ou aditivo) dizendo que a integração é opcional, ativada pelo gestor, e que a OpenAI é fornecedora contratada pelo cliente.
- **Perfil de construtor verificado** (nome/domínio) — evita GPTs falsos imitando o fourbase; publicar como **"qualquer pessoa com o link"**, não na loja, até estabilizar.
- **OAuth com escopos explícitos** (`agenda:read`, `agenda:write`), tela de consentimento do próprio fourbase mostrando o resumo do aviso, tokens de acesso curtos, refresh revogável, revogação a partir da tela "Assistente". O interruptor do workspace também bloqueia o OAuth.
- **Instruções do GPT** revisadas como documento de compliance: pedir confirmação antes de criar, não inventar cliente, não pedir dados sensíveis, tratar texto de tarefas como dado e não como instrução (prompt injection).
- Revisar as **políticas de uso da OpenAI** e o nome/marca do GPT.

## Apêndice 6 — Registro e auditoria

- `fourbase_assistant_batches` **serve como trilha de escrita** (quem, quando, quais tarefas, se desfez). Completar com: **`token_id`** (ou `connection_id` no B) e, opcionalmente, `count`. Não guardar conteúdo das tarefas no log (o conteúdo está na própria tarefa; após desfazer, o log fica só com IDs — correto).
- **Novo registro de autorização** (ex.: `fourbase_assistant_consents` ou eventos numa tabela existente): workspace, usuário, ação (`workspace_enabled`, `workspace_disabled`, `connected`, `disconnected`, `token_revoked`), versão do aviso, data/hora. Imutável (só insert).
- **Log de leitura enxuto:** token/conexão, rota (`agenda`/`clients`), período consultado, nº de itens, IP, data/hora — **sem conteúdo**. Atende Marco Civil art. 15 e responde "o que o ChatGPT viu e quando".
- Mostrar ao gestor, na tela "Assistente", o **histórico de lotes** (já planejado) — a mesma trilha vira prova de transparência.
- Gestor do workspace deve conseguir ver **quais gestores** estão conectados (sem ver os tokens).

## Apêndice 7 — Retenção

| Dado | Retenção proposta | Justificativa |
|---|---|---|
| Tokens ativos | Validade padrão **365 dias** (hoje `expires_days` é opcional e o padrão é sem validade); avisar 15 dias antes na tela | Limita token esquecido; leigo não pode ser surpreendido |
| Tokens revogados/expirados (metadados, nunca o hash útil) | 12 meses, depois apagar | Trilha de quem teve acesso |
| `fourbase_assistant_batches` | 12 meses; depois apagar ou anonimizar | Desfazer só vale 48 h; trilha além disso é só auditoria |
| Log de leitura | 6 meses (mínimo do Marco Civil art. 15) | Obrigação legal; sem conteúdo |
| Registro de autorização | Enquanto o workspace existir + 5 anos | Prova da instrução do controlador (prazo prescricional) |
| Exclusão de workspace/usuário | Cascata para tokens, lotes, logs e autorizações (exceto o mínimo legal) | Art. 16 LGPD |
| Dados já enviados à OpenAI | **Fora do alcance do fourbase** — dizer isso no aviso e na política | Transparência |

## Apêndice 8 — Portões: antes do 2º cliente vs depois

**Obrigatório já (uso interno da Fourbase / Evandro):** Advisory na maior parte — o controlador é a própria empresa. Mesmo assim: aviso na tela + caixa de autorização registrada (custa pouco e vira o padrão), validade padrão do token, alerta "não cole o token na conversa".

**Obrigatório antes do 2º cliente (primeiro externo):**
1. Termos de uso/contrato definindo fourbase como **operador**, lista de suboperadores e cláusula da integração opcional com a OpenAI. (Mandatory)
2. **Política de privacidade pública** mencionando o Assistente, transferência internacional e canal de contato. (Mandatory)
3. **Interruptor do workspace** só para gestor + registro de autorização com versão do aviso. (Mandatory)
4. Aviso na tela "Assistente" + botão de desligar que revoga na hora. (Mandatory)
5. `token_id` em `fourbase_assistant_batches` e log de leitura sem conteúdo. (Strongly Recommended — vira Mandatory com 6 meses de operação para cumprir o Marco Civil)
6. Validade padrão de token e cascata na exclusão. (Strongly Recommended)

**Antes de publicar o GPT (B):** itens do Apêndice 5 completos — política pública, perfil verificado, OAuth com escopos e revogação, instruções revisadas. (Mandatory)

**Depois (iterar):**
- Opção "não enviar descrições" / corte de descrição. (Strongly Recommended no B)
- Registro simplificado de operações de tratamento (ROPA) incluindo o Assistente. (Advisory, Mandatory se não for agente de pequeno porte)
- Avaliar se o fourbase se enquadra como agente de pequeno porte (Res. 2/2022) e designar encarregado se não. (Advisory → Mandatory conforme enquadramento)
- Revisar DPAs/cláusulas de transferência de Vercel, Supabase, Resend (já é um gap do produto, independente do Assistente). (Strongly Recommended)
- Revisão anual do aviso e da política, com versão incrementada e novo aceite se o escopo de dados mudar. (Advisory)

**Incertezas marcadas:** requisitos exatos da OpenAI para publicação (política, verificação), opção de treino em planos pessoais e se o construtor do GPT vê conversas — confirmar na documentação vigente antes do B; enquadramento do fourbase como agente de pequeno porte; localização dos servidores de Vercel/Supabase usados.
