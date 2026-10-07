# Runbook de deploy — notificações + fechamento do RLS

Para quem for subir a branch `features/upgrade` em produção (Vercel + Supabase).

> **Não rode `supabase db push` antes do deploy.** O `db push` aplica todas as migrations pendentes em ordem de data, e a primeira é `20261002000000_lock_down_table_rls.sql`, que tira o acesso anon às tabelas. O código que está em produção hoje só conhece `SUPABASE_ANON_KEY`: depois dessa migration, toda consulta falha e o login para de funcionar até o código novo estar no ar com `SUPABASE_SERVICE_ROLE_KEY`.

## Passo a passo

### 1. Configurar as variáveis na Vercel (Production)

- [ ] `SUPABASE_SERVICE_ROLE_KEY` = chave `service_role` do projeto (Supabase, Project Settings, API). Secreta: nunca com prefixo `VITE_`.
- [ ] `APP_URL` = origem pública do app, sem barra no fim (ex.: `https://app.seudominio.com.br`). Sem ela os e-mails de aviso não são enviados (o sino funciona) e os convites usam o `Origin` da requisição.
- [ ] Opcional, para e-mail: `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `FOURBASE <avisos@seudominio.com.br>`). Sem domínio verificado no Resend, só entrega ao e-mail dono da conta.
- [ ] Manter `SUPABASE_URL` e `JWT_SECRET` como estão.

Se `SUPABASE_SERVICE_ROLE_KEY` ficar faltando, `api/_lib/supabase.js` cai na `SUPABASE_ANON_KEY` e só registra o aviso `SUPABASE_SERVICE_ROLE_KEY não definida` no log. Isso funciona enquanto o RLS está aberto e quebra tudo depois do passo 4. Confira o log da função depois do deploy: o aviso não pode aparecer.

### 2. Fazer o merge (isso dispara o deploy)

- [ ] Merge na `main` e esperar o deploy da Vercel ficar `Ready`.

Sem a tabela `fourbase_notifications` e sem a coluna `users.notify_email` (ainda não migradas), o código novo continua de pé:

- Criar/editar tarefa não é afetado: `emitTaskNotifications` captura qualquer erro e só o registra no log (`[notifications] falha ao gerar notificações`). Nenhum aviso ou e-mail é criado nesse período.
- O sino fica vazio: `GET /api/notifications` responde 500, a interface ignora o erro (sem toast) e mostra zero avisos.
- Não use o interruptor "Receber e-mails de notificação" em Meu Perfil antes do passo 4: ele grava `notify_email`, coluna que ainda não existe, e o salvamento falha.

### 3. Conferir que o login funciona

- [ ] Abrir o app em produção, entrar, abrir o Kanban e criar/mover uma tarefa.
- [ ] Log da função sem o aviso da chave `service_role`.

Se algo falhar aqui, ainda dá para voltar: o RLS continua aberto (a Vercel pode promover o deploy anterior sem risco).

### 4. Aplicar as duas migrations

- [ ] `supabase db push` (aplica `20261002000000_lock_down_table_rls.sql` e depois `20261003000000_notifications.sql`). Alternativa: rodar os dois arquivos, nessa ordem, no SQL Editor do Supabase.

### 5. Conferir de novo

- [ ] Login e Kanban continuam funcionando (a API agora só acessa o banco pela `service_role`).
- [ ] O sino abre sem erro; criar uma tarefa atribuída/mencionando outra pessoa gera o aviso.
- [ ] Opcional: com `RESEND_API_KEY`/`EMAIL_FROM`/`APP_URL`, o destinatário recebe o e-mail.

### 6. Caminho de volta (rollback)

Depois do passo 4, **voltar para um deploy anterior a esta branch (inclusive o Instant Rollback da Vercel) derruba o app**: o código antigo só lê `SUPABASE_ANON_KEY` (se ela faltar, ele cai no banco local mockado) e a chave anon não acessa mais as tabelas. Para o código antigo funcionar de novo, uma destas opções:

- **Redeploy do deploy antigo com a variável trocada:** mude `SUPABASE_ANON_KEY` para o valor da chave `service_role` e faça um novo deploy (variáveis valem a partir do próximo deploy; o Instant Rollback sozinho reaproveita as variáveis antigas e não resolve). Depois do rollback, volte o valor original da variável.
- **Reabrir as policies:** recriar as policies `for all using (true)` nas tabelas `fourbase_*`/`weflow_*` (isso reabre o acesso anon aos dados de todos os workspaces; só como emergência e por pouco tempo).

Reverter só o código novo (sem desfazer as migrations) é possível enquanto o RLS não foi fechado, isto é, antes do passo 4.

### 7. Avisar a equipe de desenvolvimento

- [ ] Quem tem `.env` local copiado do `.env.example` antigo (que trazia valores de produção descomentados) deve **remover `SUPABASE_URL`** (e as chaves) do `.env`. Sem `SUPABASE_URL`, o servidor usa o banco mockado em `data/db.json` e não grava em produção.
