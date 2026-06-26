import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

// Onboarding checklist за нов акаунт — води до първа стойност в 3 стъпки.
// Авто-отмята завършените; крие се при готово или „Скрий". Бутоните навигират
// до съответния таб през event-а skyrent:navigate (App.jsx го слуша).

// Метаданни за всяка възможна стъпка; backend-ът решава кои се показват
// (фирма vs физическо лице — без 'invoice' за физическо лице).
const STEP_META = {
  company:  { tab: 'settings',  icon: '🏢', title: 'Попълни фирмените данни', desc: 'Име и ЕИК — за да издаваш фактури и договори със своята фирма.' },
  profile:  { tab: 'settings',  icon: '👤', title: 'Попълни личните данни',   desc: 'Име и ЕГН — за договори и данъчната справка по чл.50.' },
  property: { tab: 'portfolio', icon: '🏠', title: 'Добави първия си имот',   desc: 'Адрес, наем, тип — основата на портфолиото ти.' },
  invoice:  { tab: 'invoices', icon: '🧾', title: 'Издай първа фактура',      desc: 'За имот с наемател — готова за секунди.' },
}

export default function Onboarding({ API = '', tab, onNavigate }) {
  const [data, setData] = useState(null)
  const [hidden, setHidden] = useState(false)

  const load = () => apiFetch(`${API}/api/onboarding`).then(r => r.json()).then(d => { if (d && d.steps) setData(d) }).catch(() => {})
  // презареди при смяна на таб (отмята завършените стъпки веднага)
  useEffect(() => { load() }, [tab])
  // и при връщане на фокус / явен refresh event
  useEffect(() => {
    const h = () => load()
    window.addEventListener('focus', h)
    window.addEventListener('skyrent:onboarding-refresh', h)
    return () => { window.removeEventListener('focus', h); window.removeEventListener('skyrent:onboarding-refresh', h) }
  }, [])

  if (!data || hidden || data.complete || data.dismissed) return null

  const keys = Object.keys(data.steps).filter(k => STEP_META[k])
  const done = keys.filter(k => data.steps[k]).length
  // Директна навигация (по-сигурно от event); event-ът остава fallback.
  const go = (t) => { if (onNavigate) onNavigate(t); else window.dispatchEvent(new CustomEvent('skyrent:navigate', { detail: t })) }
  const dismiss = () => { setHidden(true); apiFetch(`${API}/api/onboarding/dismiss`, { method: 'POST' }).catch(() => {}) }

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-800">👋 Първи стъпки</h3>
          <p className="text-sm text-gray-500">Завърши настройката, за да тръгне бизнесът ти в Skyrent.</p>
        </div>
        <div className="text-sm font-bold text-amber-700 shrink-0">{done}/{keys.length}</div>
      </div>
      <div className="space-y-2">
        {keys.map(key => {
          const s = STEP_META[key]
          const ok = data.steps[key]
          return (
            <div key={key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ok ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className={`w-7 h-7 rounded-full grid place-items-center text-sm flex-shrink-0 ${ok ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{ok ? '✓' : s.icon}</div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${ok ? 'text-green-800 line-through' : 'text-gray-800'}`}>{s.title}</div>
                {!ok && <div className="text-xs text-gray-500">{s.desc}</div>}
              </div>
              {!ok && <button onClick={() => go(s.tab)} className="shrink-0 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1.5">Започни →</button>}
            </div>
          )
        })}
      </div>
      <button onClick={dismiss} className="mt-3 text-xs text-gray-400 hover:text-gray-600">Скрий това</button>
    </div>
  )
}
