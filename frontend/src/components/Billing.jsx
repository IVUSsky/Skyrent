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
  const [connect, setConnect] = useState(null)

  const load = () => apiFetch(`${API}/api/billing`).then(r => r.json()).then(setData).catch(() => {})
  const loadConnect = () => apiFetch(`${API}/api/billing/connect`).then(r => r.json()).then(setConnect).catch(() => {})
  useEffect(() => {
    load()
    loadConnect()
    // Връщане от Stripe onboarding → пре-дърпай актуалния статус
    const q = new URLSearchParams(window.location.search)
    if (q.get('connect')) {
      apiFetch(`${API}/api/billing/connect/refresh`, { method: 'POST' })
        .then(r => r.json()).then(() => loadConnect()).catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const connectOnboard = () => {
    setBusy('connect'); setErr(null)
    apiFetch(`${API}/api/billing/connect/onboard`, { method: 'POST' })
      .then(r => r.json()).then(d => {
        if (d.url) window.location.href = d.url
        else { setErr(d.error || 'Грешка'); setBusy(null) }
      }).catch(() => { setErr('Грешка при връзка'); setBusy(null) })
  }
  const connectDashboard = () => {
    setBusy('cdash')
    apiFetch(`${API}/api/billing/connect/dashboard`, { method: 'POST' })
      .then(r => r.json()).then(d => {
        if (d.url) window.open(d.url, '_blank')
        setBusy(null)
      }).catch(() => setBusy(null))
  }

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

      {/* ─── Stripe Connect: приемане на наеми директно в своята сметка ─────── */}
      {connect && !connect.platform && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="iv-mast-eyebrow mb-1">Приемане на наеми</div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">💳 Плащане с карта от наематели</h2>
          <p className="text-sm text-gray-500 mb-4">
            Свържи банковата си сметка и наемателите ще могат да плащат наема с карта, Apple Pay или Google Pay.
            Парите отиват <b>директно при теб</b> — Skyrent само води отчетността.
          </p>

          {!connect.connected ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-600 mb-4">
                Настройката отнема ~5 минути (банкова сметка + самоличност, през защитената форма на Stripe).
              </p>
              <button onClick={connectOnboard} disabled={busy !== null}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy === 'connect' ? 'Пренасочване…' : 'Свържи банкова сметка →'}
              </button>
            </div>
          ) : connect.charges_enabled ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-emerald-800 font-medium mb-1">✓ Активно — приемаш плащания с карта</div>
              <p className="text-sm text-emerald-700 mb-4">
                Наемателите виждат бутон „Плати" във фактурите си. Плащанията влизат директно в свързаната ти сметка.
                {!connect.payouts_enabled && ' (Изплащанията към банката се активират след потвърждение от Stripe.)'}
              </p>
              <button onClick={connectDashboard} disabled={busy !== null}
                className="text-sm text-emerald-700 underline hover:text-emerald-900">
                {busy === 'cdash' ? 'Отваряне…' : 'Отвори Stripe таблото (плащания, изплащания) →'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-amber-800 font-medium mb-1">⏳ Настройката не е завършена</div>
              <p className="text-sm text-amber-700 mb-4">
                Stripe изисква още данни, за да активира плащанията (обикновено документ за самоличност или банкова сметка).
              </p>
              <button onClick={connectOnboard} disabled={busy !== null}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60">
                {busy === 'connect' ? 'Пренасочване…' : 'Довърши настройката →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
