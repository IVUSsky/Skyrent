import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const PLAN_META = {
  basic:  { icon: '🏠', desc: 'Основно управление — без автоматизация' },
  pro:    { icon: '📊', desc: 'Плащания, портал, авто-импорт' },
  agency: { icon: '🏢', desc: 'За агенции — мулти-собственик, white-label' },
}

export default function Billing({ API = '' }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => apiFetch(`${API}/api/billing`).then(r => r.json()).then(setData).catch(() => {})
  useEffect(() => { load() }, [])

  const checkout = (plan) => {
    setBusy(plan); setErr(null)
    apiFetch(`${API}/api/billing/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    }).then(r => r.json()).then(d => {
      if (d.url) window.location.href = d.url
      else { setErr(d.error || 'Грешка'); setBusy(null) }
    }).catch(() => { setErr('Грешка при връзка'); setBusy(null) })
  }

  const portal = () => {
    setBusy('portal')
    apiFetch(`${API}/api/billing/portal`, { method: 'POST' })
      .then(r => r.json()).then(d => {
        if (d.url) window.location.href = d.url
        else { setErr(d.error || 'Грешка'); setBusy(null) }
      }).catch(() => { setErr('Грешка при връзка'); setBusy(null) })
  }

  if (!data) return <div className="p-8 text-gray-400">Зарежда…</div>

  if (data.platform) return (
    <div className="fin-surface p-8 max-w-3xl mx-auto">
      <h1 className="iv-mast-title mb-3">💳 Абонамент</h1>
      <p className="text-gray-600">Платформен акаунт (Sky Capital) — без абонамент.</p>
    </div>
  )

  const expired = data.expired || data.suspended

  return (
    <div className="fin-surface p-6 max-w-4xl mx-auto">
      <div className="iv-mast mb-6">
        <div>
          <div className="iv-mast-eyebrow">Абонамент</div>
          <h1 className="iv-mast-title">💳 План и плащане</h1>
        </div>
      </div>

      {/* статус банер */}
      <div className={`rounded-xl border p-4 mb-7 ${expired ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50/50'}`}>
        {data.suspended ? (
          <div className="text-red-700 font-medium">⛔ Абонаментът е спрян. Избери план, за да продължиш.</div>
        ) : data.plan === 'trial' ? (
          <div className={expired ? 'text-red-700 font-medium' : 'text-amber-800'}>
            {expired ? '⏰ Пробният период изтече. Избери план, за да продължиш.' :
              `🎁 Пробен период: остават ${data.trial_days_left} дни (до ${data.trial_ends_at}).`}
          </div>
        ) : (
          <div className="text-green-700 font-medium">
            ✓ Активен план: <b>{data.plans[data.plan]?.label || data.plan}</b>
            {data.property_limit != null && ` · ${data.property_count}/${data.property_limit} имота`}
          </div>
        )}
      </div>

      {/* план карти */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {Object.entries(data.plans).map(([key, p]) => {
          const current = data.plan === key
          const isFree = !p.eur
          return (
            <div key={key} className={`kpi-card flex flex-col ${current ? 'ring-2 ring-amber-400' : ''}`}>
              <div className="kpi-label">{PLAN_META[key]?.icon} {p.label}</div>
              <div className="kpi-value">
                {isFree ? 'Безплатно' : <>{p.perUnit ? 'от ' : ''}{p.eur}€<span className="text-sm text-gray-400 font-normal"> /мес</span></>}
              </div>
              <div className="kpi-sub mb-3">
                {p.limit ? `до ${p.limit} имота` : 'неограничени имоти'} · {PLAN_META[key]?.desc}
              </div>
              <button
                onClick={() => checkout(key)}
                disabled={busy !== null || current || isFree}
                className={`mt-auto px-3 py-2 rounded-lg text-sm font-medium ${current || isFree
                  ? 'bg-gray-100 text-gray-400 cursor-default'
                  : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                {current ? 'Текущ план' : isFree ? 'Безплатен' : busy === key ? 'Пренасочване…' : 'Избери'}
              </button>
            </div>
          )
        })}
      </div>

      {data.has_subscription && (
        <button onClick={portal} disabled={busy !== null}
          className="text-sm text-gray-600 underline hover:text-gray-800">
          Управление на плащането (карта, фактури, отказ) →
        </button>
      )}
      {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
      <p className="text-xs text-gray-400 mt-6">Плащанията се обработват от Stripe. Цените са без ДДС.</p>
    </div>
  )
}
