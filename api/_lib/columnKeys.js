// Colunas do quadro de um workspace. Com colunas editáveis, "todo" pode ter sido renomeada, movida
// ou excluída: uma tarefa nunca pode ficar numa coluna que não existe (sumiria do quadro).
import { supabase } from './supabase.js'

export async function workspaceColumnKeys(workspaceId) {
  const { data } = await supabase
    .from('fourbase_columns')
    .select('key')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  return (data || []).map((c) => c.key)
}

// Coluna válida para uma tarefa nova: a pedida, se existir; senão a primeira do quadro (sem contar
// "Concluído"). Sem colunas cadastradas (ambiente novo), aceita o que veio ou usa "todo".
export async function resolveColumnKey(workspaceId, requested) {
  const keys = await workspaceColumnKeys(workspaceId)
  if (!keys.length) return requested || 'todo'
  if (requested && keys.includes(requested)) return requested
  return keys.find((k) => k !== 'done') || keys[0]
}
