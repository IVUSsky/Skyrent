import React, { useEffect, useState } from 'react'
import { apiFetch, authUrl } from '../api'

// Годишна справка за доходи от наем — за ГДД по чл. 50 ЗДДФЛ (Приложение 4).
// За физически лица наемодатели: показва числата + сваля PDF за счетоводителя.

const fmt = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Chl50Report({ API = '' }) {
  const nowY = new Date().getFullYear()
  const [year, setYear] = useState(String(nowY))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = (y) => {
    setLoading(true)
    apiFetch(`${API}/api/tax-report/chl50?year=${y}`).then(r => r.json())
      .then(d => { setData(d); setLoading(false) }).catch(() => { setData(null); setLoading(false) })
  }
  useEffect(() => { load(year) }, [year])

  const download = () => { window.open(authUrl(`${API}/api/tax-report/chl50.pdf?year=${year}`), '_blank') }

  const years = [nowY, nowY - 1, nowY - 2].map(String)

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-base font-bold text-gray-800">📑 Годишна справка за наем — данък по чл. 50 (Приложение 4)</h3>
        <select value={year} onChange={e => setYear(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {years.map(y => <option key={y} value={y}>{y} г.</option>)}
        </select>
      </div>
      <p className="text-sm text-gray-500 mb-4">За физически лица наемодатели. Изчислява данъка от наемния доход за годината и сваля справка за счетоводителя.</p>

      {loading ? <div className="text-gray-400 py-4 text-center text-sm">Изчисляване…</div>
        : !data || data.count === 0
          ? <div className="text-gray-400 py-4 text-center text-sm">Няма наемен доход за {year} г.</div>
          : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Box label="Брутен наем" val={`${fmt(data.gross)} €`} />
                <Box label="Норм. разходи (10%)" val={`− ${fmt(data.deductible)} €`} muted />
                <Box label="Облагаема основа" val={`${fmt(data.base)} €`} muted />
                <Box label="Дължим данък (10%)" val={`${fmt(data.tax)} €`} accent />
              </div>
              {data.has_estimates && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  ⚠️ За имоти без записани наемни фактури доходът е оценен като <b>наем × 12</b>. Сверете реалния доход (вакантни месеци, промени) преди подаване.
                </div>
              )}
              <button onClick={download}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                ⬇ Свали годишна справка (PDF)
              </button>

              {/* Тримесечни авансови вноски */}
              {Array.isArray(data.quarters) && data.quarters.some(q => q.advance > 0) && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-800 mb-1">Тримесечни авансови вноски (чл. 67)</h4>
                  <p className="text-xs text-gray-500 mb-3">Авансов данък за Q1–Q3 (за Q4 няма аванс — изравнява се с годишната декларация).</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {data.quarters.map(q => (
                      <div key={q.q} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Тримесечие {q.q} · срок {q.deadline}</div>
                        <div className="font-bold text-gray-800 text-lg mt-1">{fmt(q.advance)} €</div>
                        <div className="text-xs text-gray-400 mb-2">от доход {fmt(q.gross)} €</div>
                        <button onClick={() => window.open(authUrl(`${API}/api/tax-report/chl55.pdf?year=${year}&quarter=${q.q}`), '_blank')}
                          className="text-xs font-semibold text-blue-700 hover:underline">⬇ справка чл.55</button>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-3">
                    ℹ️ <b>Кой внася аванса:</b> ако наемателят е <b>фирма/предприятие</b> — тя удържа и внася аванса вместо теб (не подаваш чл.55 за тези доходи). Ако наемателят е <b>физическо лице</b> — ти сам внасяш и подаваш декларация по чл. 55.
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-3">
                Ориентировъчно, не е данъчен съвет. Облагаемият доход е след 10% нормативни разходи (чл. 31); данък 10% (чл. 48). Авансово внесеният данък се приспада. Проверете със счетоводител.
              </p>
            </>
          )}
    </div>
  )
}

function Box({ label, val, muted, accent }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${accent ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-bold ${accent ? 'text-blue-700 text-lg' : muted ? 'text-gray-600' : 'text-gray-800'}`}>{val}</div>
    </div>
  )
}
