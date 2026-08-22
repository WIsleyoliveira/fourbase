-- Buckets de mídia usados pelo frontend (src/supabase.js): uploads vão direto
-- do navegador para o Storage, sem passar pelo Express. A autenticação real é
-- o JWT próprio da aplicação (não Supabase Auth), então — no mesmo modelo já
-- usado nas tabelas fourbase_* — a política aqui é aberta e restrita só ao
-- bucket, não ao papel do requisitante.
insert into storage.buckets (id, name, public)
values
  ('fourbase-media', 'fourbase-media', true),
  ('fourbase-client-media', 'fourbase-client-media', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'fourbase_media_buckets_all'
  ) then
    create policy fourbase_media_buckets_all on storage.objects
      for all
      using (bucket_id in ('fourbase-media', 'fourbase-client-media'))
      with check (bucket_id in ('fourbase-media', 'fourbase-client-media'));
  end if;
end $$;
