import { supabase } from './supabase.js'

// Confirma que um id referenciado (cliente, membro, pasta…) pertence ao mesmo
// workspace antes de gravá-lo como chave estrangeira.
export const inWorkspace = async (table, id, workspaceId) => {
  if (!id) return true
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return Boolean(data)
}

// Filtra uma lista de ids de usuário pros que existem no workspace — usado
// pra "mencionados", um campo opcional e de baixo risco: em vez de rejeitar a
// tarefa inteira por causa de um id inválido, simplesmente ignora esse id.
export const validMemberIds = async (ids, workspaceId) => {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))]
  if (unique.length === 0) return []
  const { data } = await supabase
    .from('fourbase_users')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('id', unique)
  return (data || []).map((u) => u.id)
}

// Cor personalizada (escolhida no seletor de espectro do cadastro) — só aceita
// um hex válido; qualquer outra coisa vira null (cor automática por hash).
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const normalizeColor = (value) => (typeof value === 'string' && HEX_COLOR.test(value) ? value : null)

