-- Fecha o acesso direto às tabelas da aplicação.
--
-- Até aqui todas as tabelas fourbase_*/weflow_* tinham RLS com política
-- `for all using (true)`. Como a chave anon vai no bundle do navegador
-- (src/supabase.js, para o upload no Storage), qualquer pessoa podia chamar o
-- PostgREST direto e ler/alterar dados de todos os workspaces — inclusive
-- fourbase_users.password_hash — sem passar pela autorização do Express.
--
-- Depois desta migration: RLS continua habilitado e NENHUMA política existe
-- nessas tabelas, então anon/authenticated não leem nem gravam nada. O backend
-- acessa com a service_role (que ignora RLS) — ver SUPABASE_SERVICE_ROLE_KEY
-- em api/index.js.
--
-- ORDEM DE DEPLOY: rode esta migration só DEPOIS que a API em produção estiver
-- usando SUPABASE_SERVICE_ROLE_KEY. Antes disso, a API (com a chave anon)
-- perderia o acesso ao banco.
--
-- Não mexe no Storage (storage.objects) — os buckets de mídia têm política
-- própria em 20260822000000_storage_buckets_and_policies.sql.

do $$
declare
  t text;
  p record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and (tablename like 'fourbase\_%' or tablename like 'weflow\_%')
  loop
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;
