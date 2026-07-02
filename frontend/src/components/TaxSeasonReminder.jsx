import React, { useState } from 'react'

// Лек годишен подсещащ момент за декларацията — показва се САМО през сезона
// (яну–апр) за физически лица, затваряем. Никакво натякване: „виж / по-късно /
// скрий за тази година". Дисмисът се пази per година в localStorage.

export default function TaxSeasonReminder({ onGoToTax }) {
  const now = new Date()
  const month = now.getMonth()            // 0 = януари
  const declaredYear = now.getFullYear() - 1
  const key = `chl50_reminder_dismissed_${declaredYear}`
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1' } catch { return false } })
  const [later, setLater] = useState(false)

  if (month > 3) return null              // само яну–апр (сезона на декларацията)
  if (hidden || later) return null

  const dismissYear = () => { try { localStorage.setItem(key, '1') } catch {} ; setHidden(true) }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-emerald-900">
        📑 <b>Наближава декларацията</b> (срок 30 април). Справката ти за наемите за {declaredYear} е готова — без бързане.
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={onGoToTax} className="px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Виж я</button>
        <button onClick={() => setLater(true)} className="px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100 rounded-lg">По-късно</button>
        <button onClick={dismissYear} className="text-xs text-gray-400 hover:text-gray-600">скрий за тази година</button>
      </div>
    </div>
  )
}
