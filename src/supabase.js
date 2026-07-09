import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://uokpmlzdwnilqaujohov.supabase.co'
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_B3FzeCCWZTVQbTvw8lcueA_7gLHY9bN'

export const supabase = createClient(url, key)

export const MEDIA_BUCKET = 'fourbase-media'

// extrai o caminho do objeto a partir da URL pública do bucket
export function storagePathFromUrl(publicUrl) {
  const marker = `/object/public/${MEDIA_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(publicUrl.slice(idx + marker.length))
}
