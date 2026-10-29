# Interview Summary: Assistente (ChatGPT) didático

## Core Intent
Fazer um gestor não técnico (Evandro) conectar e usar o ChatGPT para montar a agenda no fourbase **sozinho**, entendendo o que acontece — e que a solução sirva a outros gestores/clientes em poucos meses.

## Key Decisions Made
- Configuração autossuficiente (sem ajuda humana).
- Nova tela "Assistente" no menu (não só um painel em Meu Perfil).
- Feedback: status "Conectado" com último uso + histórico de lotes criados pelo GPT, com desfazer.
- Dores: configurar o GPT (Actions/openapi/Bearer/instruções), saber se funciona, como usar no dia a dia.

## Open Questions for Deliberation
- Token guiado (etapa 1 atual) vs GPT publicado pelo fourbase com login OAuth — ou sequência (token agora, OAuth depois)?
- Como guiar um passo a passo que acontece FORA do fourbase (dentro do ChatGPT) sem o usuário se perder?
- Que linguagem substitui "token", "revogar", "Actions", "Bearer"?
- Como mostrar "o que pedir" (exemplos de frases) e "o que ele pode/não pode fazer"?
- Privacidade: dados das tarefas indo para a OpenAI — como explicar/consentir para vários clientes?
- Riscos de um GPT público compartilhado (instruções do GPT, abuso, plano exigido).

## Perspective Relevance Scores
| Perspective | Score (0-5) | Rationale |
|---|---|---|
| Advocate | 5 | Núcleo: onboarding, linguagem, jornada fora do app |
| Architect | 5 | Token vs OAuth, tela nova, histórico de lotes, status |
| Strategist | 4 | Sequenciar MVP vs OAuth para vários clientes |
| Oracle | 4 | GPT publicado, instruções, como o GPT conduz o usuário |
| Skeptic | 4 | Segurança do OAuth/GPT público, abuso |
| Guardian | 4 | Dados indo à OpenAI, consentimento multi-cliente (LGPD) |
| Herald | 3 | Onboarding/adoção, mas pergunta é de escopo |
| Chronicler | 2 | Conteúdo de ajuda (coberto pelo Advocate) |
| Artisan | 2 | Visual da tela nova |
