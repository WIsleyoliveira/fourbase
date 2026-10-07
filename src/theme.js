// Tema dia/noite. A escolha da pessoa fica em localStorage ('fb_theme'); sem escolha,
// vale o tema do sistema. O tema é aplicado no <html data-theme="..."> (as cores
// vêm de variáveis CSS em styles.css). Regra pura testada em tests/theme.test.js.

export const THEME_KEY = 'fb_theme'

export const resolveTheme = (stored, systemDark) =>
  stored === 'dark' || stored === 'light' ? stored : systemDark ? 'dark' : 'light'

export const nextTheme = (theme) => (theme === 'dark' ? 'light' : 'dark')

export function readTheme() {
  let stored = null
  try { stored = localStorage.getItem(THEME_KEY) } catch { /* armazenamento indisponível */ }
  const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return resolveTheme(stored, Boolean(systemDark))
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignora */ }
}
