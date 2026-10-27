// Regras dos anexos de tarefa: qualquer tipo de arquivo, com tamanho limitado e sem
// formatos executáveis/scripts. Funções puras, testadas em tests/taskFiles.test.js.
// Os anexos continuam guardados como URLs públicas do Storage (lista de textos), então
// o nome original vai no ÚLTIMO trecho do caminho: tasks/<tarefa>/<único>/<nome>.

export const MAX_FILE_MB = 25

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']

// Arquivos que executam código ou viram páginas ao abrir: ficam de fora porque o bucket
// é público (qualquer um com o link abriria o arquivo a partir do domínio do Storage).
export const BLOCKED_EXTS = [
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'dll', 'lnk', 'reg', 'hta',
  'js', 'mjs', 'cjs', 'vbs', 'vbe', 'wsf', 'ps1', 'sh', 'jar', 'apk', 'app', 'dmg',
  'html', 'htm', 'xhtml', 'svg',
]

export const extOf = (name = '') => {
  const parts = String(name).split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

export const isImageName = (name) => IMAGE_EXTS.includes(extOf(name))

// Nome mostrado para um anexo salvo: último trecho da URL, já decodificado.
export function fileNameFromUrl(url = '') {
  const last = String(url).split('?')[0].split('/').pop() || ''
  try { return decodeURIComponent(last) } catch { return last }
}

// Mensagem em português se o arquivo não pode ser enviado, ou null se está ok.
export function validateFile(file) {
  const name = file?.name || 'arquivo'
  if (BLOCKED_EXTS.includes(extOf(name))) {
    return `“${name}”: este tipo de arquivo não é permitido por segurança.`
  }
  if (!file.size) return `“${name}” está vazio.`
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `“${name}” passa de ${MAX_FILE_MB} MB.`
  return null
}

// Nome seguro para a chave do Storage: sem acentos, espaços ou símbolos, mantendo a extensão.
export function safeFileName(rawName) {
  const name = String(rawName).split(/[\/]/).pop() || ''
  const dotExt = extOf(name)
  const ext = /^[A-Za-z0-9]{1,10}$/.test(dotExt) ? dotExt : ''
  const base = ext ? name.slice(0, name.length - ext.length - 1) : name
  const clean = (text) => text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
  const safeBase = clean(base).slice(0, 80) || 'arquivo'
  const safeExt = clean(ext).slice(0, 10)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

export const storagePathFor = (taskId, name, unique) =>
  `tasks/${taskId}/${unique}/${safeFileName(name)}`

// Que ícone usar para um anexo que não é imagem.
export function fileKind(name) {
  const ext = extOf(name)
  if (ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet'
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slides'
  return 'doc'
}

// Só endereços http(s) viram link ou imagem na tela ("javascript:" e "data:" nunca).
export const isHttpUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url)
