import TaskDetailModal from './TaskDetailModal.jsx'
import { useTaskActions } from '../hooks/useTasks.js'
import {
  useClients, useColumns, useMembers, useTagActions, useTags,
} from '../hooks/useWorkspaceData.js'

const EMPTY = []

// Nova tarefa a partir de qualquer tela (botão "Criar Tarefa" do Painel, "Enviar
// para o Kanban" das Notas): o mesmo modal completo de especificações do Calendário
// e do Kanban, em modo rascunho — status, responsável, cliente, prazo, horários,
// mencionados, etiquetas, descrição e anexos. `draft` pode trazer título/descrição.
export default function NewTaskModal({ draft = {}, currentUser, onClose }) {
  const members = useMembers().data ?? EMPTY
  const clients = useClients().data ?? EMPTY
  const columns = useColumns().data
  const tags = useTags().data ?? EMPTY
  const { createTag: onCreateTag } = useTagActions()
  const { createTask, updateTask, moveTask, deleteTask } = useTaskActions({ userId: currentUser.id })

  const task = {
    title: draft.title || '',
    description: draft.description || '',
    priority: 'Média',
    due_date: null,
    column_key: columns?.[0]?.key || 'todo',
    assigned_to: currentUser.id,
    client_id: null,
    tags: [],
    attachments: [],
    mentioned_users: [],
  }

  return (
    <TaskDetailModal
      task={task}
      members={members}
      clients={clients}
      currentUser={currentUser}
      columns={columns}
      tags={tags}
      onCreateTag={onCreateTag}
      onClose={onClose}
      onCreate={createTask}
      onUpdate={updateTask}
      onMove={moveTask}
      onDelete={deleteTask}
    />
  )
}
