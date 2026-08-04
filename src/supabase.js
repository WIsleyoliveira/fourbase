import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://uamjgaeawwkfdlrlpmfc.supabase.co'
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_RvGMiJo63JeC3euIiT9Iwg_dWSwuThZ'

export const supabase = createClient(url, key)

export const MEDIA_BUCKET = 'fourbase-media'
export const CLIENT_MEDIA_BUCKET = 'fourbase-client-media'

// extrai o caminho do objeto a partir da URL pública do bucket
export function storagePathFromUrl(publicUrl, bucket = MEDIA_BUCKET) {
  const marker = `/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(publicUrl.slice(idx + marker.length))
}
