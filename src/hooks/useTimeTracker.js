import { useState, useEffect, useRef, useCallback } from 'react'

// Chave de localStorage por tarefa para sobreviver a recargas de página
const lsKey = (taskId) => `fb_timer_${taskId}`

// Converte segundos totais para "HH:MM:SS" — usado enquanto o cronômetro está rodando
function toHMS(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
}

// Converte segundos para string amigável — usado quando o cronômetro está pausado
// Ex: 0 → "0h" | 3600 → "1h" | 5400 → "1h 30m" | 1800 → "30m"
function toFriendly(s) {
  if (s <= 0) return '0h'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function useTimeTracker(taskId) {
  const key = lsKey(taskId)

  // Lê estado persistido do localStorage uma única vez
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
  })()

  // Segundos acumulados antes da sessão de rastreamento atual
  const [base, setBase] = useState(stored?.base ?? 0)
  const [isTracking, setIsTracking] = useState(stored?.isTracking ?? false)

  // Valor exibido ao usuário — inicializa já calculando o tempo decorrido
  // caso o timer estivesse ativo quando a página foi fechada/recarregada
  const [seconds, setSeconds] = useState(() => {
    if (stored?.isTracking && stored?.start) {
      return (stored.base ?? 0) + Math.floor((Date.now() - stored.start) / 1000)
    }
    return stored?.base ?? 0
  })

  // Ref para timestamp de início da sessão atual (não causa re-render)
  const startRef = useRef(stored?.isTracking ? stored.start : null)
  // Ref para o id do interval ativo
  const intervalRef = useRef(null)
  // Ref para sempre ler o valor de `seconds` mais recente dentro de callbacks estáveis
  const secondsRef = useRef(seconds)

  useEffect(() => {
    secondsRef.current = seconds
  }, [seconds])

  // Reinicia/para o interval sempre que isTracking ou base mudam
  useEffect(() => {
    if (!isTracking) {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      // base + tempo decorrido desde que o play foi pressionado nesta sessão
      setSeconds(base + Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isTracking, base])

  // Persiste o estado no localStorage
  const persist = useCallback(
    (tracking, baseVal, startVal) => {
      localStorage.setItem(key, JSON.stringify({ isTracking: tracking, base: baseVal, start: startVal }))
    },
    [key],
  )

  const start = useCallback(() => {
    const now = Date.now()
    const current = secondsRef.current // leitura fresh sem dependência de closure
    startRef.current = now
    setBase(current) // o display atual vira a nova base desta sessão
    setIsTracking(true)
    persist(true, current, now)
  }, [persist])

  const pause = useCallback(() => {
    clearInterval(intervalRef.current)
    const current = secondsRef.current
    setBase(current)
    setIsTracking(false)
    persist(false, current, null)
  }, [persist])

  const reset = useCallback(() => {
    clearInterval(intervalRef.current)
    setSeconds(0)
    setBase(0)
    setIsTracking(false)
    localStorage.removeItem(key)
  }, [key])

  return {
    seconds,
    isTracking,
    toggle: isTracking ? pause : start,
    reset,
    // String formatada: "HH:MM:SS" enquanto roda; "1h 30m" quando pausado
    display: isTracking ? toHMS(seconds) : toFriendly(seconds),
  }
}
