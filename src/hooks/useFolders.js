import { useQuery } from '@tanstack/react-query'
import { api } from '../api.js'

// Pastas de documentos do workspace. staleTime 0: quem abre a tela revalida
// sempre (as pastas são criadas/removidas em Documentações e Notas, que ainda
// não escrevem neste cache).
export const useFolders = () =>
  useQuery({ queryKey: ['folders'], queryFn: api.getFolders, staleTime: 0 })
