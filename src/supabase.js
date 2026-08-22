import { createClient } from '@supabase/supabase-js'

// Fallback aponta para o projeto de produção (weflow-producao, sa-east-1).
// Chave publicável — não é segredo, é seguro expor no bundle do navegador.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://seaibmpzkdvhclveckgs.supabase.co'
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fZI5a3C22Bioib4y50TM5w_BWH7mPL1'

export const supabase = createClient(url, key)

export const MEDIA_BUCKET = 'fourbase-media'
export const CLIENT_MEDIA_BUCKET = 'fourbase-client-media'

// Bucket dedicado para anexos de notas. Criar um bucket novo no Supabase exige
// o dashboard/CLI (fora do alcance deste código) — por ora reaproveita o bucket
// de mídia de clientes, já provisionado, para não quebrar o upload. Assim que
// um bucket 'fourbase-note-files' existir de fato no projeto, é só apontar
// esta constante para ele.
export const NOTE_FILES_BUCKET = CLIENT_MEDIA_BUCKET

// Bucket das fotos de perfil. Mesma ressalva do NOTE_FILES_BUCKET: provisionar
// um bucket 'avatars' exige o dashboard/CLI do Supabase, então por ora os
// arquivos vão para o bucket já existente, sob o prefixo `avatars/`.
export const AVATARS_BUCKET = CLIENT_MEDIA_BUCKET

// extrai o caminho do objeto a partir da URL pública do bucket
export function storagePathFromUrl(publicUrl, bucket = MEDIA_BUCKET) {
  const marker = `/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(publicUrl.slice(idx + marker.length))
}
