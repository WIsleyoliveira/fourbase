import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

// Aviso temporário no canto da tela (.toast em styles.css). Fica num contexto
// para qualquer tela ou hook de dados avisar sucesso/erro sem receber callbacks
// por props. As funções são estáveis (seguras em deps de useCallback/useEffect).
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('')
  const timer = useRef(null)

  const showToast = useCallback((msg) => {
    // Um aviso novo reinicia o tempo — senão o timer do anterior o apagava cedo.
    clearTimeout(timer.current)
    setMessage(msg)
    timer.current = setTimeout(() => setMessage(''), 2500)
  }, [])

  const handleError = useCallback((err) => {
    console.error(err)
    showToast(`Erro: ${err.message}`)
  }, [showToast])

  const value = useMemo(() => ({ showToast, handleError }), [showToast, handleError])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && <div className="toast">{message}</div>}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
