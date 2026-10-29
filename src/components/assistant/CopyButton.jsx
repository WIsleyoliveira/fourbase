import { useState } from 'react'
import { IconCheckPlain, IconCopy } from '../../icons.jsx'

// Copia um texto para a área de transferência. O aviso "Copiado" é anunciado pelo leitor de tela
// (a região aria-live fica no componente pai: onCopied recebe a mensagem).
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function CopyButton({ text, label, copiedLabel = 'Copiado', onCopied, primary = false }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    const ok = await copyText(text)
    onCopied?.(ok ? `${copiedLabel}.` : 'Não consegui copiar. Selecione o texto e copie manualmente.')
    if (ok) {
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    }
  }
  return (
    <button type="button" className={`asst-btn${primary ? '' : ' ghost'}`} onClick={copy}>
      {done ? <IconCheckPlain size={15} /> : <IconCopy size={15} />}
      {done ? copiedLabel : label}
    </button>
  )
}
