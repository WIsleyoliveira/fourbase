// Regras do aviso "O que há de novo": quem já viu qual versão e quando mostrar.
// Puro (o armazenamento é injetado), testado em tests/whatsNew.test.js.

const KEY_PREFIX = 'fb_whatsnew_'

// "1.10.0" > "1.9.0": compara número a número (não como texto).
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff) return diff < 0 ? -1 : 1
  }
  return 0
}

// Lê/grava a última versão vista por esta pessoa neste navegador. Falha em silêncio
// (navegação privada, armazenamento bloqueado): na pior das hipóteses o aviso reaparece.
export function readSeenVersion(userId, storage = globalThis.localStorage) {
  try { return storage.getItem(KEY_PREFIX + userId) } catch { return null }
}

export function markSeen(userId, version, storage = globalThis.localStorage) {
  try { storage.setItem(KEY_PREFIX + userId, version) } catch { /* ignora */ }
}

// Versões mais novas que a última vista, da mais nova para a mais antiga.
export function unseenReleases(releases, seenVersion) {
  if (!seenVersion) return releases.slice()
  return releases.filter((r) => compareVersions(r.version, seenVersion) > 0)
}

// Quem ainda não terminou o tutorial de boas-vindas não vê o aviso: ele já está
// conhecendo o produto e as novidades seriam ruído (a versão atual é marcada como vista).
export function shouldShowWhatsNew({ onboarded, seenVersion }, releases) {
  if (!onboarded) return false
  return unseenReleases(releases, seenVersion).length > 0
}
