import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAuth } from '../api.js'
import { useToast } from '../toast.jsx'
import { NOTE_KEYS, addNoteFirst, patchNote, removeNote, replaceNote } from '../noteCache.js'

// Id de quem está logado, lido da sessão — assim qualquer tela usa useNotes()
// sem precisar receber o usuário por props.
const sessionUserId = () => getAuth()?.user?.id ?? null

// Notas do usuário logado, da mais recente para a mais antiga.
export const useNotes = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: NOTE_KEYS.mine(userId),
    queryFn: api.getNotes,
    enabled: Boolean(userId),
  })
}

// Criar/salvar/excluir/vincular notas. Aviso por toast; nenhuma tela precisa
// receber callbacks por props. Excluir e (des)vincular pasta são otimistas.
export function useNoteActions() {
  const queryClient = useQueryClient()
  const { showToast, handleError } = useToast()
  const key = NOTE_KEYS.mine(sessionUserId())
  const edit = (fn) => queryClient.setQueryData(key, (old) => (Array.isArray(old) ? fn(old) : old))

  // Muda a lista na hora; se a API falhar, volta ao que era, avisa e revalida.
  const optimistic = async (change, request) => {
    await queryClient.cancelQueries({ queryKey: key })
    const snapshot = queryClient.getQueryData(key)
    edit(change)
    try {
      return await request()
    } catch (err) {
      queryClient.setQueryData(key, snapshot)
      handleError(err)
      queryClient.invalidateQueries({ queryKey: key })
      return undefined
    }
  }

  // Resposta do servidor é a versão final da nota; erro vira toast e `undefined`.
  const fromServer = async (request, apply) => {
    try {
      const note = await request()
      edit((list) => apply(list, note))
      return note
    } catch (err) {
      handleError(err)
      return undefined
    }
  }

  return {
    // Devolve a nota criada, ou null se falhou (o erro já foi avisado).
    createNote: async () =>
      (await fromServer(() => api.createNote('Nova nota', ''), addNoteFirst)) ?? null,

    // Nota já com título e conteúdo (HTML) — "nota rápida" do Painel. Devolve a nota ou null.
    addNote: async (title, content) => {
      const note = await fromServer(() => api.createNote(title, content), addNoteFirst)
      if (note) showToast('Nota criada.')
      return note ?? null
    },

    // Devolve true se salvou — quem chama só marca "sem alterações" nesse caso.
    saveNote: async (id, title, content) => {
      const note = await fromServer(() => api.updateNote(id, title, content), addNoteFirst)
      if (note) showToast('Nota salva.')
      return Boolean(note)
    },

    deleteNote: (id) => optimistic((l) => removeNote(l, id), () => api.deleteNote(id)),

    // folderId null desvincula. A nota muda de pasta na hora (some da árvore de
    // Documentações) e é trocada pela versão do servidor ao responder.
    linkNoteFolder: async (id, folderId) => {
      const note = await optimistic(
        (l) => patchNote(l, id, { folder_id: folderId }),
        () => api.updateNoteFolder(id, folderId),
      )
      if (note) edit((l) => replaceNote(l, note))
    },

    updateNoteAttachments: (id, attachments) =>
      fromServer(() => api.updateNoteAttachments(id, attachments), replaceNote),
  }
}
