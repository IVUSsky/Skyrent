import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const SEV = {
  high: { c: 'border-red-200 bg-red-50',   t: 'text-red-700',   l: '🔴' },
  med:  { c: 'border-amber-200 bg-amber-50', t: 'text-amber-700', l: '🟠' },
  low:  { c: 'border-gray-200 bg-gray-50',  t: 'text-gray-600',  l: '🟡' },
  info: { c: 'border-blue-200 bg-blue-50',  t: 'text-blue-700',  l: 'ⓘ' },
}
const CHECK_LABEL = {
  duplicate: 'Дубликати', rent_no_property: 'Наем без имот', uncategorized: 'Без категория',
  doubled_month: 'Удвоен месец', spike: 'Висока сума', deposit_mix: 'Наем+депозит',
  period_gap: 'Липсващ месец', rent_vs_record: 'Наем ≠ запис', active_no_rent: 'Активен без наем',
}

export default function Integrity({ API = '' }) {
  const [data, setData] = useState(null)
  const [showAcked, setShowAcked] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setBusy(true)
    apiFetch(`${API}/api/integrity${showAcked ? '?all=1' : ''}`)
      .then(r => r.json()).then(setData).finally(() => setBusy(false))
  }
  useEffect(load, [showAcked])

  const ack = (signature, status) =>
    apiFetch(`${API}/api/integrity/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, status }),
    }).then(load)

  const setChannel = (property_id, rent_channel) =>
    apiFetch(`${API}/api/properties/${property_id}/rent-channel`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rent_channel }),
    }).then(load)

  if (!data) return <div className="p-8 text-gray-400">Зарежда…</div>

  const groups = {}
  for (const f of data.findings) (groups[f.check] = groups[f.check] || []).push(f)
  const total = data.findings.length

  return (
    <div className="fin-surface p-6 max-w-5xl mx-auto">
      <div className="iv-mast mb-6">
        <div>
          <div className="iv-mast-eyebrow">Качество на данните</div>
          <h1 className="iv-mast-title">🩺 Интегритет</h1>
        </div>
        <label className="iv-mast-meta cursor-pointer">
          <input type="checkbox" checked={showAcked} onChange={e => setShowAcked(e.target.checked)} className="mr-1.5" />
          покажи приети
        </label>
      </div>

      <div className="flex gap-3 mb-7 flex-wrap items-center">
        {Object.entries(data.summary).map(([k, n]) => (
          <div key={k} className="kpi-card !p-3">
            <div className="kpi-label">{CHECK_LABEL[k] || k}</div>
            <div className="kpi-value !text-2xl">{n}</div>
          </div>
        ))}
        {!total && <div className="text-green-700 font-medium">✓ Няма активни проблеми</div>}
      </div>

      {Object.entries(groups).map(([check, items]) => (
        <section key={check} className="mb-6">
          <h2 className="iv-section-h">
            {CHECK_LABEL[check] || check} <span className="text-gray-400 text-sm font-normal">({items.length})</span>
          </h2>
          <div className="space-y-2">
            {items.map(f => (
              <div key={f.signature} className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${SEV[f.severity]?.c || ''}`}>
                <div className="min-w-0">
                  <div className={`font-medium ${SEV[f.severity]?.t || ''}`}>{SEV[f.severity]?.l} {f.title}</div>
                  <div className="text-sm text-gray-600">{f.detail}</div>
                  {f.tx_ids?.length ? <div className="text-xs text-gray-400 mt-0.5">tx: {f.tx_ids.join(', ')}</div> : null}
                  {f.fix?.type === 'rent_channel' && (
                    <div className="mt-1.5 text-xs">
                      Наемът се проследява:
                      <select
                        className="ml-1 border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-700"
                        defaultValue="this"
                        onChange={e => setChannel(f.fix.property_id, e.target.value)}>
                        <option value="this">тази сметка</option>
                        <option value="other">друга сметка</option>
                        <option value="cash">кеш</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => ack(f.signature, 'accepted')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">Приеми</button>
                  <button onClick={() => ack(f.signature, 'ignored')} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Игнорирай</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {busy && <div className="text-gray-400 text-sm">…</div>}
    </div>
  )
}
