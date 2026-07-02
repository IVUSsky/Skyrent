import React, { useEffect, useState } from 'react'
import { apiFetch, authUrl } from '../api'

// Доходи и данък — за физически лица наемодатели. Спокоен, необременяващ тон:
// демистифицира данъка, дава peace-of-mind, поверителност и обяснение по желание.
// Целта е леко да образова, не да притиска.

const fmt = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = (n) => Math.round(Number(n || 0)).toLocaleString('bg-BG')

export default function Chl50Report({ API = '' }) {
  const nowY = new Date().getFullYear()
  const [year, setYear] = useState(String(nowY))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const load = (y) => {
    setLoading(true)
    apiFetch(`${API}/api/tax-report/chl50?year=${y}`).then(r => r.json())
      .then(d => { setData(d); setLoading(false) }).catch(() => { setData(null); setLoading(false) })
  }
  useEffect(() => { load(year) }, [year])

  const download = () => { window.open(authUrl(`${API}/api/tax-report/chl50.pdf?year=${year}`), '_blank') }
  const years = [nowY, nowY - 1, nowY - 2].map(String)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h3 className="text-base font-bold text-gray-800">📑 Доходи и данък за {year}</h3>
          <select value={year} onChange={e => setYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {years.map(y => <option key={y} value={y}>{y} г.</option>)}
          </select>
        </div>
        <p className="text-sm text-gray-500 mb-4">Тук държим наемния ти доход подреден. Когато решиш да декларираш — всичко е готово за секунди.</p>

        {loading ? <div className="text-gray-400 py-6 text-center text-sm">Изчисляване…</div>
          : !data || data.count === 0
            ? <div className="text-gray-400 py-6 text-center text-sm">Няма записан наемен доход за {year} г. Щом има, тук ще се появи готова справка.</div>
            : (
              <>
                {/* Демистифициращото число — голямо, приятелско */}
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 mb-4">
                  <div className="text-sm text-gray-500">Данъкът ти за {year}</div>
                  <div className="text-3xl font-bold text-emerald-700 mt-0.5">~ {fmt0(data.tax)} €</div>
                  <div className="text-sm text-gray-600 mt-2">
                    От {fmt0(data.gross)} € наем. Облага се само 90% (10% са признати разходи), с плосък данък 10%. По-малко, отколкото звучи. 🙂
                  </div>
                </div>

                {/* Peace of mind + сваляне */}
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 mb-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-sm text-green-900">
                    ✅ <b>Справката ти е готова.</b> Свали я, когато си готов — за счетоводител или за декларацията сам.
                  </div>
                  <button onClick={download}
                    className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap">
                    ⬇ Свали справката (PDF)
                  </button>
                </div>

                {/* Числата (по избор за детайли) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Box label="Брутен наем" val={`${fmt(data.gross)} €`} />
                  <Box label="Норм. разходи (10%)" val={`− ${fmt(data.deductible)} €`} muted />
                  <Box label="Облагаема основа" val={`${fmt(data.base)} €`} muted />
                  <Box label="Дължим данък (10%)" val={`${fmt(data.tax)} €`} accent />
                </div>

                {data.has_estimates && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    ⚠️ За имоти без записани наемни фактури доходът е оценен като <b>наем × 12</b>. Свери реалния доход (вакантни месеци, промени) преди подаване.
                  </div>
                )}

                {/* Поверителност — маха усещането за наблюдение */}
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
                  🔒 Данните ти са само твои. Skyrent не ги споделя с никого — <b>ти решаваш</b> кога и дали да декларираш.
                </div>

                {/* Обяснение по желание — не изскача */}
                <button onClick={() => setShowHelp(s => !s)} className="text-xs font-medium text-emerald-700 hover:underline">
                  {showHelp ? '▲ Скрий' : '❔ Трябва ли изобщо да декларирам наема?'}
                </button>
                {showHelp && (
                  <div className="mt-2 text-sm text-gray-700 bg-emerald-50/50 border border-emerald-100 rounded-lg px-4 py-3 space-y-2">
                    <p>Да — веднъж годишно, до <b>30 април</b>, с декларация по чл. 50. Но е просто:</p>
                    <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                      <li>Облага се 90% от наема (10% признати разходи)</li>
                      <li>Плосък данък <b>10%</b></li>
                      <li>За наем 1000 лв/мес → ~1 080 лв за цялата година</li>
                    </ul>
                    <p className="text-gray-600"><b>Защо си струва (за теб):</b> спокойствие при спор с наемател · чист доход пред банка за кредит · без риск от глоби и лихви. Skyrent ти дава числата наготово.</p>
                  </div>
                )}

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
                            className="text-xs font-semibold text-emerald-700 hover:underline">⬇ справка чл.55</button>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 bg-emerald-50/50 border border-emerald-100 rounded-lg px-3 py-2 mt-3">
                      ℹ️ <b>Кой внася аванса:</b> ако наемателят е <b>фирма/предприятие</b> — тя удържа и внася аванса вместо теб (не подаваш чл.55 за тези доходи). Ако наемателят е <b>физическо лице</b> — ти сам внасяш и подаваш декларация по чл. 55.
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-3">
                  Ориентировъчно, не е данъчен съвет. Облагаемият доход е след 10% нормативни разходи (чл. 31); данък 10% (чл. 48). Авансово внесеният данък се приспада. За финалната декларация — провери със счетоводител.
                </p>
              </>
            )}
      </div>
    </div>
  )
}

function Box({ label, val, muted, accent }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-bold ${accent ? 'text-emerald-700 text-lg' : muted ? 'text-gray-600' : 'text-gray-800'}`}>{val}</div>
    </div>
  )
}
