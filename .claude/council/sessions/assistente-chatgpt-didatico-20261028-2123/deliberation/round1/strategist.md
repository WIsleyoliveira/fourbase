# Strategist: posição (Rodada 1). Assistente (ChatGPT) didático

## Recomendação central
Fazer em sequência, A antes de B. Primeiro sai a **tela "Assistente" com token guiado** (passo a passo com botões de copiar, status "Conectado", histórico com desfazer) para o Evandro validar o valor em 1 a 2 semanas. **Em paralelo e já agora**, abrir as pendências externas de B (perfil de construtor verificado na OpenAI, página de política de privacidade). Só construir **OAuth + GPT publicado** depois que o Evandro provar que usa, e antes do 2º cliente.

## Argumento-chave
Hoje quase todo o backend já está pronto. Faltam a explicação e o retorno visual, e são justamente as três dores do Evandro: configurar, saber se funciona, usar no dia a dia. O que já existe:
- `api/_lib/routes/assistant.js` já grava `last_used_at` (linha 132) e devolve esse campo em `GET /api/assistant/tokens`. O status "Conectado · último uso há 3 min" sai quase de graça (S).
- `fourbase_assistant_batches` já guarda cada lote. O histórico precisa só de uma rota de leitura via JWT e de um "desfazer" via JWT, reaproveitando a lógica do undo (M).

Com isso a opção A deixa o Evandro sozinho em dias. A opção B é uma aposta estratégica XL: servidor OAuth (authorization code, telas de login e consentimento, emissão e renovação de token, revogação), GPT publicado, verificação de construtor e política de privacidade. Ela tem ainda um prazo externo (OpenAI) que não controlamos. Construir B antes de saber se o Evandro usa o recurso é gastar a maior parte do esforço numa hipótese sem validar.

Por outro lado, B não pode ser adiada para depois do 2º cliente. Com token, cada cliente monta o próprio GPT, e isso não escala ("Actions/Bearer" é a barreira de entrada). Num GPT compartilhado, a autenticação por chave usaria uma única chave para todos. Para vários clientes, OAuth é obrigatório.

O ponto de menor arrependimento: **o servidor OAuth serve tanto ao GPT com Actions quanto a um eventual app/conector MCP da OpenAI**. Investir em OAuth é seguro. A superfície (GPT ou MCP) é a parte incerta, e por isso ela se decide no fim. A tela "Assistente" da fase A também não se perde: em B ela vira "Abrir o GPT fourbase → Entrar". O status, o histórico e os exemplos continuam iguais.

## Riscos se ignorado
1. **Construir B primeiro.** Seriam 3 a 5 semanas de OAuth, mais a espera pela verificação da OpenAI, sem saber se o Evandro adota. Se o fluxo conversacional não pegar, isso vira código morto e caro de manter (é uma superfície de autenticação nova para auditar).
2. **Ficar só em A por tempo demais.** O 2º gestor tropeça em Actions/openapi/Bearer e trava, e o suporte vira manual (nós configurando o GPT de cada cliente). Isso queima a promessa de "configurar sozinho" e o boca a boca justamente na fase de expansão.
3. **Lançar sem retorno visual.** Sem "Conectado" e sem histórico, o usuário não confia que o GPT criou algo de verdade, nem que dá para desfazer. Adoção baixa, e a culpa cai no recurso, não na explicação.

## Dependências
- **Advocate:** roteiro do passo a passo em linguagem não técnica e teste de usabilidade com o Evandro (cronometrado). Ele valida o critério "< 15 min".
- **Architect:** rotas JWT `GET /api/assistant/batches` e `POST /api/assistant/batches/:id/undo` (sessão do gestor, filtro `user_id` + `workspace_id`). Também confirmar que o OAuth pode emitir os mesmos escopos `agenda:read/write` e reutilizar `assistantAuth`, para que B troque só o emissor do token.
- **Guardian/Skeptic:** texto de privacidade (o ChatGPT recebe dados de agenda e de clientes) e ameaças do OAuth (redirect_uri fixo da OpenAI, PKCE, refresh com revogação).
- **Scout/Oracle:** verificar o estado atual das Actions com OAuth e dos apps MCP no plano do Evandro antes de iniciar B. É um spike de 0,5 dia que decide a superfície.
- **Dono do produto:** iniciar já a verificação do perfil de construtor e definir a URL da política de privacidade. É prazo de calendário, não de engenharia.

---

## Apêndice A: MoSCoW e valor x esforço

Esforço: XS < 0,5 d · S 0,5 a 1 d · M 2 a 3 d · L ~1 sem · XL 2+ sem.

| # | Item | MoSCoW | Esforço | Valor | Quadrante | Fase |
|---|------|--------|---------|-------|-----------|------|
| 1 | Tela "Assistente" no menu (gestor; `VIEW_KEYS`/`GESTOR_ONLY_VIEWS`, `/assistente`), movendo `AssistantTokensPanel` para lá | Must | S | Alto | Quick Win | 1 |
| 2 | Passo a passo numerado com botões "Copiar" (URL do openapi, token, instruções do GPT) e prints por passo | Must | M | Alto | Quick Win | 1 |
| 3 | Status "Conectado · último uso há X" / "Aguardando a 1ª conversa" (usa `last_used_at`; polling enquanto a tela está aberta) | Must | S | Alto | Quick Win | 1 |
| 4 | "Testar conexão" no formato do produto: o passo final manda perguntar no GPT "o que tenho essa semana?" e a tela fica verde sozinha. Isso mede o caminho real (GPT → API). Um teste só do servidor não provaria nada | Must (junto com o 3) | XS | Alto | Quick Win | 1 |
| 5 | Histórico de lotes (data, nº de tarefas, títulos) com "Desfazer" (≤ 48 h) via JWT | Must | M | Alto | Quick Win/limite | 1 |
| 6 | Exemplos de frases prontas para o dia a dia (copiar e colar no ChatGPT) | Must | XS | Alto | Quick Win | 1 |
| 7 | Bloco "Precisa de ChatGPT pago (Plus/Team)" e "O que o ChatGPT pode e não pode fazer" (lê agenda e clientes; cria; não edita nem apaga) | Must | XS | Médio-Alto | Quick Win | 1 |
| 8 | Aviso de privacidade simples na tela (o que é enviado ao ChatGPT) e consentimento ao gerar o token | Should (Must na fase 2) | S | Médio | Fill-in | 1 (texto) / 2 (formal) |
| 9 | Anúncio em Novidades (`src/releaseNotes.js` com `cta` → `/assistente`) | Should | XS | Médio | Quick Win | 1, no deploy |
| 10 | Métricas de adoção mínimas (contadores derivados do que já existe: tokens criados, 1º `last_used_at`, lotes criados e desfeitos) | Should | S | Médio (decide a fase 2) | Fill-in | 1 |
| 11 | Vídeo/GIF de 60 s do setup | Could | S | Médio | Fill-in | 1.1 (só se o teste com o Evandro mostrar travas) |
| 12 | Servidor OAuth (authorize/token/refresh/revoke, tela "Entrar no fourbase" + consentimento, mesmos escopos) | Must para a fase 2 | XL | Alto (escala) | Strategic Bet | 2 |
| 13 | GPT "fourbase" publicado (link/loja) com instruções fixas e versionadas | Must para a fase 2 | M (+ espera externa) | Alto (escala) | Strategic Bet | 2 |
| 14 | Política de privacidade pública + perfil de construtor verificado | Must para a fase 2 (iniciar já) | S (eng.) / calendário | Alto (pré-requisito) | Bloqueador externo | Iniciar na fase 1 |
| 15 | App/conector MCP | Won't (por enquanto) | L–XL | Incerto | Avoid até haver dados | Futuro (o spike decide) |
| 16 | Editar/apagar tarefas pelo GPT, notificações dos lotes, funcionário usando o recurso | Won't | M–L | Baixo agora | Avoid | Futuro |

### Matriz valor x esforço
```
 Valor alto │ ESTRATÉGICAS              │ QUICK WINS
            │ 12 OAuth (XL)             │ 1 tela · 2 passo a passo+copiar
            │ 13 GPT publicado (M+esp.) │ 3 status · 4 teste via GPT
            │ 14 verificação/política   │ 6 frases · 7 requisitos/limites
            │                           │ 5 histórico+desfazer (M, no limite)
 ───────────┼───────────────────────────┼──────────────────────────────
 Valor      │ EVITAR                    │ FILL-INS
 médio/     │ 15 MCP (até o spike)      │ 8 privacidade (texto) · 9 Novidades
 baixo      │ 16 editar/apagar/notif.   │ 10 métricas · 11 vídeo/GIF
            └───────────────────────────┴──────────────────────────────
              Esforço alto                 Esforço baixo
```

## Apêndice B: fases

| Fase | Conteúdo | Esforço total | Marco | Ponto de decisão |
|------|----------|---------------|-------|------------------|
| **1: antes do Evandro usar** | 1, 2, 3, 4, 5, 6, 7, 8 (texto), 9, 10 + migration já planejada (`20261101000000_assistant_tokens.sql`) + início do item 14 | ~1,5 semana | Deploy + Evandro configura sozinho, sem ajuda, cronometrado | Atingiu os critérios abaixo? Se não, 1.1 corrige o passo em que travou (vídeo, prints) antes de qualquer B |
| **1.1: fast-follow** | 11 se necessário, ajustes de texto, frases novas vindas do uso real | 1 a 3 dias | 2 semanas de uso | O uso continua (lotes/semana)? Justifica B? |
| **2: antes do 2º cliente** | Spike superfície (Actions OAuth vs MCP, 0,5 d) → 12, 13, 8 formal; a tela muda para "Abrir GPT fourbase → Entrar"; token vira modo "avançado" (manter para quem já usa, sem remover) | 3 a 5 semanas + espera externa | 2º gestor conecta só com o link + "Entrar" | Avaliar MCP com dados de uso |
| **Futuro** | 15, 16 | n/a | n/a | Pedidos reais de clientes |

Regra de sequência: o item 14 (verificação/política) começa **na semana 1**, porque é o caminho crítico de calendário da fase 2. O item 12 só começa quando o ponto de decisão da fase 1 der "sim".

## Apêndice C: critérios de sucesso mensuráveis

**Fase 1 (Evandro):**
- Configura **sozinho em ≤ 15 min**, da abertura da tela "Assistente" até o status verde "Conectado", **com 0 pedidos de ajuda**.
- **1º lote criado em ≤ 24 h** após conectar.
- **≥ 3 lotes em 14 dias** (uso recorrente, não curiosidade), com **taxa de desfazer < 25 %**. Acima disso o GPT está errando a agenda, e o problema é de instruções/prévia, não de onboarding.
- 0 incidentes de tarefa criada em workspace ou dono errado.

**Gatilho para investir em B:** os três primeiros itens acima atendidos **e** ≥ 1 outro gestor/cliente com intenção concreta de usar nos próximos 3 meses.

**Fase 2 (2º cliente em diante):**
- Conexão em **≤ 3 min**, só com link + "Entrar no fourbase", sem colar nada.
- **≥ 60 %** dos gestores que abrem a tela "Assistente" chegam a "Conectado".
- **≥ 50 %** dos conectados criam ≥ 1 lote por semana no 1º mês.
