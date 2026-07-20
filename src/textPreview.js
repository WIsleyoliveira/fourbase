// Extrai texto limpo de HTML (conteúdo de nota) e limita ao tamanho informado
export const getPreview = (content, maxLength = 60) => {
  if (!content) return ''
  const div = document.createElement('div')
  div.innerHTML = content
  const text = (div.innerText || div.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text
}
