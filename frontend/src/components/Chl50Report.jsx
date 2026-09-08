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
                {/* Ink резюме — четирите числа наведнъж, данъкът е единственият
                    брас акцент. Замества стария зелен блок И решетката отдолу,
                    за да няма две резюмета на един екран. */}
                <div className="tx-ink">
                  <div className="tx-ink-grid">
                    <div>
                      <div className="tx-eyebrow">Наемен доход</div>
                      <div className="tx-val">{fmt0(data.gross)} €</div>
                    </div>
                    <div>
                      <div className="tx-eyebrow">Нормативни разходи 10 %</div>
                      <div className="tx-val">− {fmt0(data.deductible)} €</div>
                    </div>
                    <div>
                      <div className="tx-eyebrow">Данъчна основа</div>
                      <div className="tx-val">{fmt0(data.base)} €</div>
                    </div>
                    <div>
                      <div className="tx-eyebrow tx-eyebrow-accent">Дължим данък 10 %</div>
                      <div className="tx-val tx-val-accent">{fmt0(data.tax)} €</div>
                    </div>
                  </div>
                  <div className="tx-ink-note">
                    Облага се 90 % от наема — 10 % са признати разходи, данъкът е плосък 10 %.
                    По-малко, отколкото звучи.
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

                {/* Срокът е 30 април на СЛЕДВАЩАТА година спрямо отчетната */}
                {(() => {
                  const due  = new Date(`${Number(year) + 1}-04-30T23:59:59`)
                  const days = Math.ceil((due - Date.now()) / 86400000)
                  return (
                    <div className="tx-due">
                      Срок за деклариране: <b>30 април {Number(year) + 1}</b>
                      {days > 0
                        ? <> · остават <b>{days}</b> {days === 1 ? 'ден' : 'дни'}</>
                        : <> · срокът е минал</>}
                    </div>
                  )
                })()}

                {/* Точните стойности до стотинка — резюмето отгоре е закръглено */}
                <div className="tx-exact">
                  <span>Брутен наем <b>{fmt(data.gross)} €</b></span>
                  <span>Норм. разходи <b>− {fmt(data.deductible)} €</b></span>
                  <span>Основа <b>{fmt(data.base)} €</b></span>
                  <span>Данък <b>{fmt(data.tax)} €</b></span>
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


