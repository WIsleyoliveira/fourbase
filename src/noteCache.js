// Cache de notas no TanStack Query: uma lista por usuário (a API só devolve as
// notas de quem pediu). Quem precisa de notas — Notas, Painel, Documentações —
// lê esta mesma lista, então uma mudança aparece em todos sem sincronização manual.
//
// Funções puras testadas em tests/noteCache.test.js (sem React).

export const NOTE_KEYS = {
  all: ['notes'],
  mine: (userId) => ['notes', userId],
}

// A API ordena por updated_at desc; nota criada ou salva vai para o topo.
export const addNoteFirst = (list, note) => [note, ...list.filter((n) => n.id !== note.id)]

// Troca a nota pela versão do servidor, mantendo a posição na lista.
export const replaceNote = (list, note) => list.map((n) => (n.id === note.id ? note : n))

export const patchNote = (list, id, updates) =>
  list.map((n) => (n.id === id ? { ...n, ...updates } : n))

export const removeNote = (list, id) => list.filter((n) => n.id !== id)
