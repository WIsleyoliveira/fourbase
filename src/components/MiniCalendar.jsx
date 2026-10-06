import { useEffect, useMemo, useState } from 'react'
import { IconArrowLeft, IconArrowRight } from '../icons.jsx'
import { monthGrid } from '../calendarFilters.js'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const toKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Mini-calendário de navegação: tem o seu próprio mês (dá para folhear sem mexer
// no calendário grande) e, ao clicar num dia, o calendário principal salta para ele.
// Acompanha o mês do calendário principal quando este muda.
export default function MiniCalendar({ month, selectedDate, today, busyDays, onPick }) {
  const [view, setView] = useState({ y: month.getFullYear(), m: month.getMonth() })
  useEffect(() => {
    setView({ y: month.getFullYear(), m: month.getMonth() })
  }, [month])

  const cells = useMemo(() => monthGrid(view.y, view.m), [view])
  const todayKey = toKey(today)
  const selectedKey = selectedDate ? toKey(selectedDate) : null
  const shift = (delta) => setView(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <div className="minical" aria-label="Mini-calendário">
      <div className="minical-head">
        <span className="minical-title">{MONTHS[view.m]} {view.y}</span>
        <div className="minical-nav">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} title="Mês anterior" aria-label="Mês anterior">
            <IconArrowLeft size={13} />
          </button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} title="Próximo mês" aria-label="Próximo mês">
            <IconArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="minical-grid" role="grid">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span key={i} className="minical-weekday" aria-hidden="true">{w}</span>
        ))}
        {cells.map(({ key, day, inMonth }) => {
          const [y, m, d] = key.split('-').map(Number)
          return (
            <button
              type="button"
              key={key}
              className={`minical-day${inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}${key === selectedKey ? ' selected' : ''}${busyDays.has(key) ? ' busy' : ''}`}
              onClick={() => onPick(new Date(y, m - 1, d))}
              aria-label={`${d} de ${MONTHS[m - 1]} de ${y}${busyDays.has(key) ? ', com tarefas' : ''}`}
              aria-current={key === todayKey ? 'date' : undefined}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
