# Assistente (ChatGPT) — etapa 1

O gestor planeja a agenda no ChatGPT e o ChatGPT cria as tarefas no Calendário do fourbase. O fourbase só expõe
**ver agenda**, **listar clientes** e **criar tarefas em lote**; a IA roda na assinatura do ChatGPT (custo extra ≈ zero).

## Como funciona
1. Em **Meu Perfil → Assistente (ChatGPT)** o gestor gera um token pessoal (`fbk_…`), mostrado **uma única vez**. No banco fica só o hash SHA‑256.
2. O ChatGPT (GPT personalizado com *Actions*) chama `/api/assistant/*` com `Authorization: Bearer <token>`.
3. Fluxo seguro: ver agenda → montar a lista → `prever` (valida e aponta conflitos/duplicatas, não cria nada) → o usuário confirma → `criarTarefas` → (se quiser) `desfazerLote`.

## Rotas (token)
| Rota | O que faz |
|---|---|
| `GET /api/assistant/openapi.json` | Contrato para importar no GPT (público, sem dados) |
| `GET /api/assistant/agenda?from&to` | Tarefas do dono do token (máx. 62 dias / 200 itens) |
| `GET /api/assistant/clients` | Clientes do workspace |
| `POST /api/assistant/tasks/preview` | Valida o lote; devolve erros, `conflicts`, `duplicates` |
| `POST /api/assistant/tasks` | Cria o lote (`batch_id` obrigatório, ≤ 30 tarefas, tudo ou nada) |
| `POST /api/assistant/batches/:batchId/undo` | Apaga o lote (até 48 h depois) |

Gestão dos tokens (login normal, só gestor): `POST|GET /api/assistant/tokens`, `DELETE /api/assistant/tokens/:id` (máx. 5 ativos).

## Segurança
- O token **só** funciona em `/api/assistant/*`; o JWT normal não abre as rotas de dados do assistente.
- Tudo é do dono do token: lê e cria só as **próprias** tarefas, no próprio workspace. Não há editar nem apagar tarefas existentes (só desfazer um lote criado pelo assistente).
- Tarefas criadas ganham a etiqueta **ChatGPT**, caem na primeira coluna (não "Concluído") e não geram avisos/e‑mails.
- `batch_id` torna a criação idempotente (reenvio não duplica). Limites: 30 tarefas/lote, 120 chamadas/min por token, 30 falhas/15 min por IP.
- Revogar o token corta o acesso na hora. Desativar o usuário também.

## Deploy (só com aprovação)
1. Merge do código (Vercel publica). Sem a tabela nova, só as rotas do assistente falham; o resto do app segue normal.
2. **Backup**, depois rodar `supabase/migrations/20261101000000_assistant_tokens.sql` no SQL Editor do Supabase.
3. Conferir que `APP_URL` está definido na Vercel (vira o `servers` do OpenAPI e os links das tarefas).
4. Evandro gera o token em Meu Perfil.

## Configurar no ChatGPT (precisa de plano com GPTs/Actions — confirmar com o Evandro)
1. *Explorar GPTs → Criar* → aba **Configurar** → **Actions → Criar nova ação**.
2. **Importar de URL**: `https://fourbase.vercel.app/api/assistant/openapi.json`.
3. **Autenticação**: *Chave de API* → *Bearer* → colar o token.
4. Instruções sugeridas para o GPT:
   - Antes de criar, consulte `verAgenda` do período e use `prever`.
   - Mostre a lista (título, data, hora, cliente) e peça confirmação; só então `criarTarefas`, com um `batch_id` novo e único.
   - Use o fuso de Brasília; nunca invente cliente — use `listarClientes`; informe conflitos de horário.
   - Se o usuário se arrepender, use `desfazerLote` com o mesmo `batch_id`.

## Checklist de teste
- [ ] Gerar token em Meu Perfil e copiar; recarregar a página (não aparece de novo).
- [ ] GPT: "o que tenho na semana?" lista as tarefas certas.
- [ ] Pedir 3 tarefas com cliente; ver prévia, confirmar; aparecem no Calendário com etiqueta ChatGPT.
- [ ] Repetir o mesmo pedido não duplica.
- [ ] Desfazer remove só aquelas 3.
- [ ] Revogar o token → GPT passa a receber 401.
