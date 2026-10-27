// Contadores "a fazer / em andamento / concluídas" por POSIÇÃO no quadro (e não pelos nomes
// internos "todo"/"doing", que o gestor pode renomear, mover ou excluir):
//   a fazer      = a primeira coluna aberta (antes de "Concluído")
//   em andamento = as demais colunas abertas
//   concluídas   = "Concluído" (done)
import { supabase } from './supabase.js'

export function bucketer(columns) {
  const open = columns.filter((c) => c.key !== 'done').sort((a, b) => a.position - b.position)
  const first = open[0]?.key ?? 'todo'
  return (columnKey) => (columnKey === 'done' ? 'done' : columnKey === first ? 'todo' : 'doing')
}

export async function loadBucketer(workspaceId) {
  const { data, error } = await supabase
    .from('fourbase_columns')
    .select('key, position')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return bucketer(data || [])
}
