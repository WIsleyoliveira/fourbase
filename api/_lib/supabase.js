import { createClient } from '@supabase/supabase-js'
import { createLocalClient } from '../localDb.js'

// Com SUPABASE_URL definido (produção), usa o Postgres real do Supabase. Sem
// ele (dev local), cai no banco mockado em data/db.json — ver api/localDb.js.
//
// A chave usada aqui deve ser a service_role: as tabelas fourbase_*/weflow_*
// têm RLS fechado para anon/authenticated (migration 20261002000000), então só
// o servidor lê e grava nelas. A autorização por usuário/workspace é feita
// aqui no Express via JWT próprio. A chave anon fica restrita ao Storage no
// navegador e NÃO deve dar acesso às tabelas.
//
// SUPABASE_ANON_KEY continua aceito como fallback só para a transição do
// deploy (antes da migration de RLS rodar); depois dela, sem a service_role a
// API não consegue mais ler o banco.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[fourbase] SUPABASE_SERVICE_ROLE_KEY não definida — usando a chave anon. ' +
    'Isso para de funcionar depois da migration que fecha o RLS.')
}
export const supabase = (process.env.SUPABASE_URL && supabaseKey)
  ? createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : createLocalClient()

