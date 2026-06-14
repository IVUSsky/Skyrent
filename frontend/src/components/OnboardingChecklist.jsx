import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'

// Начален съветник за нови организации: показва ясни „следващи стъпки"
// вместо празно табло с метрики. Самоскрива се щом и трите стъпки са готови
// (или ако собственикът го затвори ръчно).
const go = (tab) => window.dispatchEvent(new CustomEvent('skyrent:navigate', { detail: tab }))

export default function OnboardingChecklist({ API = '' }) {
  const [state, setState] = useState(null)
  const [dismissed, setDismissed] = useState(localStorage.getItem('skyrent_onboarding_done') === '1')

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/properties`).then(r => r.json()).catch(() => []),
      apiFetch(`${API}/api/invoices`).then(r => r.json()).catch(() => []),
    ]).then(([props, invs]) => {
      const properties = Array.isArray(props) ? props : []
      const invoices = Array.isArray(invs) ? invs : []
      setState({
        hasProperty: properties.length > 0,
        hasTenant: properties.some(p => (p['наемател'] || '').trim() && !/^—|WIP|строи/i.test(p['наемател'])),
        hasInvoice: invoices.length > 0,
        propCount: properties.length,
      })
    })
  }, [API])

  if (!state || dismissed) return null
  const allDone = state.hasProperty && state.hasTenant && state.hasInvoice
  if (allDone) return null

  const steps = [
    { done: state.hasProperty, icon: '🏢', title: 'Добави първия си имот',
      desc: 'Адрес, наем и основни данни.', tab: 'portfolio', cta: 'Добави имот' },
    { done: state.hasTenant, icon: '👤', title: 'Добави наемател',
      desc: 'Свържи наемател с имота (или направи договор).', tab: 'tenants', cta: 'Към наематели' },
    { done: state.hasInvoice, icon: '🧾', title: 'Издай първата фактура',
      desc: 'Месечен наем към наемателя.', tab: 'invoices', cta: 'Към фактури' },
  ]
  const nextIdx = steps.findIndex(s => !s.done)
  const isFresh = state.propCount === 0

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {isFresh ? '👋 Добре дошъл! Започни оттук' : '✨ Довърши настройката'}
          </h2>
          <p className="text-sm text-gray-500">
            {isFresh ? 'Три кратки стъпки и системата е готова за работа.' : 'Остават ти няколко стъпки.'}
          </p>
        </div>
        <button onClick={() => { localStorage.setItem('skyrent_onboarding_done', '1'); setDismissed(true) }}
          className="text-xs text-gray-400 hover:text-gray-600 shrink-0">скрий</button>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => {
          const active = i === nextIdx
          return (
            <div key={i}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                s.done ? 'border-green-200 bg-green-50' : active ? 'border-blue-300 bg-white' : 'border-gray-200 bg-white/60 opacity-70'}`}>
              <div className={`text-xl ${s.done ? '' : 'grayscale'}`}>{s.done ? '✅' : s.icon}</div>
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${s.done ? 'text-green-700 line-through' : 'text-gray-800'}`}>{s.title}</div>
                {!s.done && <div className="text-xs text-gray-500">{s.desc}</div>}
              </div>
              {!s.done && active && (
                <button onClick={() => go(s.tab)}
                  className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                  {s.cta} →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
