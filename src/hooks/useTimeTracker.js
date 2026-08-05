import { useState, useEffect, useRef, useCallback } from 'react'

// Chave de localStorage por tarefa — usada apenas para sobreviver a recargas
// de página enquanto o cronômetro está rodando (a base persistida vem do banco)
const lsKey = (taskId) => `fb_timer_${taskId}`

// Converte segundos totais para "HH:MM:SS" — usado enquanto o cronômetro está rodando
function toHMS(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
}

// Converte segundos para string amigável — usado quando o cronômetro está pausado
// Ex: 45 → "45s" | 90 → "1m 30s" | 5400 → "1h 30m" | 3600 → "1h"
function toFriendly(s) {
  if (s <= 0) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

// taskId: id da tarefa | initialSeconds: total já persistido no banco (logged_time_seconds)
// onPersist(totalSeconds): chamado ao pausar, para gravar o novo total acumulado
export function useTimeTracker(taskId, initialSeconds = 0, onPersist) {
  const key = lsKey(taskId)

  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
  })()
  const activeSession = stored?.isTracking ? stored : null

  const [isTracking, setIsTracking] = useState(!!activeSession)

  // Base da sessão atual (segundos já acumulados antes do play desta sessão)
  const baseRef = useRef(activeSession ? activeSession.base ?? initialSeconds : initialSeconds)
  const startRef = useRef(activeSession ? activeSession.start : null)

  const [seconds, setSeconds] = useState(() => {
    if (activeSession) {
      return (activeSession.base ?? initialSeconds) + Math.floor((Date.now() - activeSession.start) / 1000)
    }
    return initialSeconds
  })

  // Mantém o display em dia com o valor persistido quando o cronômetro está parado
  // (ex: tarefa recarregada, ou atualizada em outra aba)
  useEffect(() => {
    if (!isTracking) setSeconds(initialSeconds)
  }, [initialSeconds, isTracking])

  useEffect(() => {
    if (!isTracking) return
    const id = setInterval(() => {
      setSeconds(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isTracking])

  const start = useCallback(() => {
    const now = Date.now()
    baseRef.current = initialSeconds
    startRef.current = now
    setIsTracking(true)
    localStorage.setItem(key, JSON.stringify({ isTracking: true, base: initialSeconds, start: now }))
  }, [initialSeconds, key])

  const pause = useCallback(() => {
    const total = baseRef.current + Math.floor((Date.now() - startRef.current) / 1000)
    setIsTracking(false)
    setSeconds(total)
    localStorage.removeItem(key)
    onPersist?.(total)
  }, [key, onPersist])

  return {
    seconds,
    isTracking,
    toggle: isTracking ? pause : start,
    // String formatada: "HH:MM:SS" enquanto roda; "1h 30m" / "1m 30s" quando pausado
    display: isTracking ? toHMS(seconds) : toFriendly(seconds),
  }
}
