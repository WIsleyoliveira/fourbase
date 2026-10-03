import { QueryClient } from '@tanstack/react-query'

// staleTime: o dado conta como fresco por 30 s — trocar de tela não refaz a
// busca à toa, mas voltar à aba ou ao foco depois disso revalida.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})
