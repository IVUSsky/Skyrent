import React, { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const METALS = [
  { id: 'gold',     label: '🥇 Злато',    accent: '#f59e0b', accentBg: 'bg-amber-500',  bgSoft: 'bg-amber-50',  border: 'border-amber-200', textSoft: 'text-amber-700' },
  { id: 'silver',   label: '🥈 Сребро',   accent: '#9ca3af', accentBg: 'bg-gray-400',   bgSoft: 'bg-gray-100',  border: 'border-gray-300',  textSoft: 'text-gray-600' },
  { id: 'platinum', label: '⚪ Платина',  accent: '#0ea5e9', accentBg: 'bg-sky-500',    bgSoft: 'bg-sky-50',    border: 'border-sky-200',   textSoft: 'text-sky-700' },
]

export default function Investments({ API }) {
  const [metal, setMetal] = useState('gold')
  const metalConfig = METALS.find(m => m.id === metal)
  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">📈 Инвестиции</h2>
        <div className="flex gap-1">
          {METALS.map(t => (
            <button key={t.id} onClick={() => setMetal(t.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${metal === t.id ? `${t.accentBg} text-white border-transparent` : 'bg-white text-gray-600 border-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <MetalDashboard API={API} metal={metal} metalConfig={metalConfig} />
    </div>
  )
}

function fmtMoney(n, digits = 0) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('bg-BG', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('bg-BG') } catch { return s }
}

function MetalDashboard({ API, metal, metalConfig }) {
  const [price, setPrice] = useState(null)
  const [history, setHistory] = useState([])
  const [portfolio, setPortfolio] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [reports, setReports] = useState([])
  const [toast, setToast] = useState(null)
  const [view, setView] = useState('dashboard') // dashboard | transactions | alerts | reports
  const [showTxForm, setShowTxForm] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [editAlert, setEditAlert] = useState(null)
  const [openReport, setOpenReport] = useState(null)
  const [generating, setGenerating] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadAll = () => {
    apiFetch(`${API}/api/investments/${metal}/price`).then(r => r.json()).then(d => setPrice(d.error ? null : d)).catch(() => setPrice(null))
    apiFetch(`${API}/api/investments/${metal}/price-history?days=30`).then(r => r.json()).then(setHistory).catch(() => setHistory([]))
    apiFetch(`${API}/api/investments/${metal}/portfolio`).then(r => r.json()).then(setPortfolio).catch(() => setPortfolio(null))
    apiFetch(`${API}/api/investments/${metal}/transactions`).then(r => r.json()).then(setTransactions).catch(() => setTransactions([]))
    apiFetch(`${API}/api/investments/${metal}/alerts`).then(r => r.json()).then(setAlerts).catch(() => setAlerts([]))
    apiFetch(`${API}/api/investments/reports?metal=${metal}`).then(r => r.json()).then(setReports).catch(() => setReports([]))
  }
  useEffect(loadAll, [metal])

  const chartData = useMemo(() => history.map(h => ({
    дата: new Date(h.дата).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' }),
    цена: Number(h.цена_eur),
  })), [history])

  const generateReport = async (type, scope = 'metal') => {
    setGenerating(true)
    try {
      const r = await apiFetch(`${API}/api/investments/report`, {
        method: 'POST',
        body: JSON.stringify({ тип: type, метал: scope === 'all' ? 'all' : metal }),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); return }
      setOpenReport(d)
      loadAll()
      showToast('Доклада е генериран')
    } catch (e) { showToast(e.message, 'error') }
    finally { setGenerating(false) }
  }

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* View switcher */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ['dashboard',   '📊 Dashboard'],
          ['transactions', '💼 Сделки'],
          ['alerts',      '🚨 Аларми'],
          ['reports',     '📄 AI Доклади'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${view === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Top cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-xs text-amber-700 font-semibold uppercase">Текуща цена</div>
          <div className="text-xl font-bold text-amber-800 mt-0.5">€{fmtMoney(price?.цена_eur, 2)}/oz</div>
          {price?.промяна_24h !== undefined && price?.промяна_24h !== 0 && (
            <div className={`text-xs mt-0.5 ${price.промяна_24h >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {price.промяна_24h >= 0 ? '▲' : '▼'} {Math.abs(price.промяна_24h).toFixed(2)}% за 24ч
            </div>
          )}
          {!price && <div className="text-xs text-amber-700 mt-1">цена недостъпна</div>}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="text-xs text-blue-700 font-semibold uppercase">Притежавани</div>
          <div className="text-xl font-bold text-blue-800 mt-0.5">{fmtMoney(portfolio?.общо_oz, 3)} oz</div>
          {portfolio?.средна_цена > 0 && <div className="text-xs text-blue-600 mt-0.5">Ср. цена: €{fmtMoney(portfolio.средна_цена, 0)}/oz</div>}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="text-xs text-green-700 font-semibold uppercase">Текуща стойност</div>
          <div className="text-xl font-bold text-green-800 mt-0.5">€{fmtMoney(portfolio?.текуща_стойност, 0)}</div>
          {portfolio?.обща_инвестиция > 0 && <div className="text-xs text-green-700 mt-0.5">Инвестирано: €{fmtMoney(portfolio.обща_инвестиция, 0)}</div>}
        </div>
        <div className={`rounded-xl p-3 border ${(portfolio?.печалба_eur ?? 0) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-xs font-semibold uppercase ${(portfolio?.печалба_eur ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>Печалба</div>
          <div className={`text-xl font-bold mt-0.5 ${(portfolio?.печалба_eur ?? 0) >= 0 ? 'text-green-800' : 'text-red-800'}`}>
            {(portfolio?.печалба_eur ?? 0) >= 0 ? '+' : ''}€{fmtMoney(portfolio?.печалба_eur, 0)}
          </div>
          {portfolio?.печалба_pct !== null && portfolio?.печалба_pct !== undefined && (
            <div className={`text-xs mt-0.5 ${portfolio.печалба_pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {portfolio.печалба_pct >= 0 ? '▲' : '▼'} {Math.abs(portfolio.печалба_pct).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Dashboard chart */}
      {view === 'dashboard' && (
        <>
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{metalConfig?.label} — цена за последните 30 дни</h3>
              <span className="text-xs text-gray-400">EUR / oz</span>
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <XAxis dataKey="дата" tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => `€${v.toFixed(0)}`} />
                  <Tooltip formatter={v => `€${Number(v).toFixed(2)}`} />
                  {portfolio?.средна_цена > 0 && (
                    <ReferenceLine y={portfolio.средна_цена} stroke="#3b82f6" strokeDasharray="3 3"
                      label={{ value: `Ср. покупна €${portfolio.средна_цена.toFixed(0)}`, position: 'right', fontSize: 10, fill: '#3b82f6' }} />
                  )}
                  <Line type="monotone" dataKey="цена" stroke={metalConfig?.accent || '#f59e0b'} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-400 py-12 text-sm">
                Все още няма достатъчно исторически данни за {metalConfig?.label}. <br />
                <span className="text-xs">Cron-ът записва цената всеки час; първите точки ще се появят след ~1ч.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => generateReport('weekly')} disabled={generating}
              className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-left hover:bg-purple-100">
              <div className="font-semibold text-purple-800">🤖 Седмично за {metalConfig?.label}</div>
              <div className="text-xs text-purple-700 mt-1">Claude анализира само текущия метал.</div>
            </button>
            <button onClick={() => generateReport('monthly')} disabled={generating}
              className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left hover:bg-blue-100">
              <div className="font-semibold text-blue-800">📊 Месечно за {metalConfig?.label}</div>
              <div className="text-xs text-blue-700 mt-1">Пълно резюме + наеми/кредити.</div>
            </button>
            <button onClick={() => generateReport('monthly', 'all')} disabled={generating}
              className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left hover:bg-emerald-100">
              <div className="font-semibold text-emerald-800">⚖️ Цялостен месечен (3-те метала)</div>
              <div className="text-xs text-emerald-700 mt-1">Сравнение злато + сребро + платина.</div>
            </button>
          </div>
        </>
      )}

      {/* Transactions */}
      {view === 'transactions' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Сделки със злато ({transactions.length})</h3>
            <button onClick={() => { setEditTx(null); setShowTxForm(true) }}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded-lg">
              + Добави сделка
            </button>
          </div>
          {transactions.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Все още няма сделки</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Дата','Тип','Количество','Цена/oz','Общо','Доставчик','Продукт','Сертификат','Съхранение',''].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-amber-50/40">
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{fmtDate(t.дата)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.тип === 'покупка' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {t.тип}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-xs">{fmtMoney(t.количество, 3)} oz</td>
                      <td className="px-2 py-1.5 text-xs">€{fmtMoney(t.цена_eur, 2)}</td>
                      <td className="px-2 py-1.5 text-xs font-semibold">€{fmtMoney(t.обща_сума, 2)}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{t.доставчик || '—'}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{t.продукт || '—'}</td>
                      <td className="px-2 py-1.5 text-xs font-mono text-gray-500">{t.сертификат || '—'}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-500">{t.съхранение}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <button onClick={() => { setEditTx(t); setShowTxForm(true) }} className="text-xs px-2 py-1 text-blue-700 hover:bg-blue-50 rounded">✏️</button>
                        <button onClick={async () => {
                          if (!window.confirm(`Изтриване на сделка от ${fmtDate(t.дата)}?`)) return
                          await apiFetch(`${API}/api/investments/${metal}/transactions/${t.id}`, { method: 'DELETE' })
                          loadAll(); showToast('Изтрито')
                        }} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {view === 'alerts' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Аларми за цена ({alerts.length})</h3>
            <button onClick={() => { setEditAlert(null); setShowAlertForm(true) }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg">
              + Нова аларма
            </button>
          </div>
          {alerts.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Все още няма аларми. Задай прицелна цена и при достигането ще получиш email.</div>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border ${a.задействана ? 'bg-gray-50 border-gray-200 opacity-70' : a.активна ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-300'}`}>
                  <div className="text-2xl">{a.посока === 'под' ? '⬇️' : '⬆️'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">€{fmtMoney(a.цена_eur, 0)}/oz</div>
                    <div className="text-xs text-gray-500">
                      {a.посока === 'под' ? 'Уведоми когато падне' : 'Уведоми когато надхвърли'}
                      {a.количество_oz && ` · купи ${a.количество_oz} oz`}
                    </div>
                    {a.съобщение && <div className="text-xs text-gray-600 mt-0.5 italic">"{a.съобщение}"</div>}
                    {a.задействана_на && <div className="text-xs text-orange-600 mt-0.5">Задействана {fmtDate(a.задействана_на)}</div>}
                  </div>
                  <button onClick={() => { setEditAlert(a); setShowAlertForm(true) }} className="text-xs px-2 py-1 text-blue-700 hover:bg-blue-100 rounded">✏️</button>
                  <button onClick={async () => {
                    if (!window.confirm('Изтриване на алармата?')) return
                    await apiFetch(`${API}/api/investments/${metal}/alerts/${a.id}`, { method: 'DELETE' })
                    loadAll(); showToast('Изтрито')
                  }} className="text-xs px-2 py-1 text-red-600 hover:bg-red-100 rounded">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reports */}
      {view === 'reports' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">AI инвестиционни доклади ({reports.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => generateReport('weekly')} disabled={generating} className="text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
                {generating ? '...' : '🤖 Седмично'}
              </button>
              <button onClick={() => generateReport('monthly')} disabled={generating} className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {generating ? '...' : '📊 Месечно'}
              </button>
            </div>
          </div>
          {reports.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Все още няма доклади.</div>
          ) : (
            <div className="space-y-1">
              {reports.map(r => (
                <button key={r.id} onClick={async () => {
                  const f = await apiFetch(`${API}/api/investments/reports/${r.id}`).then(x => x.json())
                  setOpenReport(f)
                }}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                  <div className="text-xl">{r.тип === 'monthly' ? '📊' : r.тип === 'weekly' ? '📅' : '🚨'}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-800">
                      {r.тип === 'monthly' ? 'Месечен доклад' : r.тип === 'weekly' ? 'Седмично резюме' : 'Аларма'} · {r.месец}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('bg-BG')}</div>
                  </div>
                  <div className="text-xs text-blue-600">прегледай →</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showTxForm && <TxForm API={API} metal={metal} tx={editTx}
        onClose={() => { setShowTxForm(false); setEditTx(null) }}
        onSaved={() => { setShowTxForm(false); setEditTx(null); loadAll(); showToast('Запазено') }}
      />}
      {showAlertForm && <AlertForm API={API} metal={metal} alert={editAlert}
        onClose={() => { setShowAlertForm(false); setEditAlert(null) }}
        onSaved={() => { setShowAlertForm(false); setEditAlert(null); loadAll(); showToast('Запазено') }}
      />}
      {openReport && <ReportModal report={openReport} onClose={() => setOpenReport(null)} />}
    </div>
  )
}

function TxForm({ API, metal, tx, onClose, onSaved }) {
  const isNew = !tx
  const [f, setF] = useState({
    дата: tx?.дата || new Date().toISOString().slice(0,10),
    тип: tx?.тип || 'покупка',
    количество: tx?.количество || '',
    цена_eur: tx?.цена_eur || '',
    обща_сума: tx?.обща_сума || '',
    доставчик: tx?.доставчик || '',
    продукт: tx?.продукт || '',
    сертификат: tx?.сертификат || '',
    съхранение: tx?.съхранение || 'home',
    бележка: tx?.бележка || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  // Auto-compute total when qty/price changes
  useEffect(() => {
    const q = Number(f.количество), p = Number(f.цена_eur)
    if (q > 0 && p > 0) {
      setF(prev => ({ ...prev, обща_сума: (q * p).toFixed(2) }))
    }
  }, [f.количество, f.цена_eur])

  const save = async () => {
    if (!f.количество || !f.цена_eur) { setErr('Количество и цена са задължителни'); return }
    setSaving(true); setErr(null)
    try {
      const url = isNew ? `${API}/api/investments/${metal}/transactions` : `${API}/api/investments/${metal}/transactions/${tx.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(f) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Грешка'); setSaving(false); return }
      onSaved()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{isNew ? '+ Нова сделка със злато' : '✏️ Редактирай сделка'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата"><input type="date" value={f.дата} onChange={e => setF({...f, дата: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Тип">
              <select value={f.тип} onChange={e => setF({...f, тип: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="покупка">Покупка</option>
                <option value="продажба">Продажба</option>
              </select>
            </Field>
            <Field label="Количество (oz)"><input type="number" step="0.001" value={f.количество} onChange={e => setF({...f, количество: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Цена €/oz"><input type="number" step="0.01" value={f.цена_eur} onChange={e => setF({...f, цена_eur: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Обща сума € (auto)"><input type="number" step="0.01" value={f.обща_сума} onChange={e => setF({...f, обща_сума: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50" /></Field>
            <Field label="Съхранение">
              <select value={f.съхранение} onChange={e => setF({...f, съхранение: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="home">Вкъщи</option>
                <option value="bank_safe">Банков сейф</option>
                <option value="dealer">При дилъра</option>
              </select>
            </Field>
            <Field label="Доставчик"><input type="text" value={f.доставчик} onChange={e => setF({...f, доставчик: e.target.value})} placeholder="Tavex, iGold, Limar..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Сертификат №"><input type="text" value={f.сертификат} onChange={e => setF({...f, сертификат: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" /></Field>
          </div>
          <Field label="Продукт"><input type="text" value={f.продукт} onChange={e => setF({...f, продукт: e.target.value})} placeholder="1oz Виенска Филхармония, 100гр Valcambi..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
          <Field label="Бележка"><textarea rows={2} value={f.бележка} onChange={e => setF({...f, бележка: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y" /></Field>
          {err && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{err}</div>}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50">{saving ? '...' : 'Запази'}</button>
        </div>
      </div>
    </div>
  )
}

function AlertForm({ API, metal, alert, onClose, onSaved }) {
  const isNew = !alert
  const [f, setF] = useState({
    цена_eur: alert?.цена_eur || '',
    посока: alert?.посока || 'под',
    количество_oz: alert?.количество_oz || '',
    съобщение: alert?.съобщение || '',
    активна: alert?.активна ?? 1,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    if (!f.цена_eur) { setErr('Цената е задължителна'); return }
    setSaving(true)
    try {
      const url = isNew ? `${API}/api/investments/${metal}/alerts` : `${API}/api/investments/${metal}/alerts/${alert.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(f) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error); setSaving(false); return }
      onSaved()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{isNew ? '+ Нова аларма' : '✏️ Редактирай аларма'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Целева цена €/oz"><input type="number" step="0.01" value={f.цена_eur} onChange={e => setF({...f, цена_eur: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Посока">
              <select value={f.посока} onChange={e => setF({...f, посока: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="под">Цена падне ПОД</option>
                <option value="над">Цена надхвърли НАД</option>
              </select>
            </Field>
          </div>
          <Field label="Препоръчано количество (oz, по избор)">
            <input type="number" step="0.01" value={f.количество_oz} onChange={e => setF({...f, количество_oz: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </Field>
          <Field label="Бележка / съобщение в email">
            <textarea rows={2} value={f.съобщение} onChange={e => setF({...f, съобщение: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y" placeholder="напр. Купи 1 oz ако имам кеш" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.активна} onChange={e => setF({...f, активна: e.target.checked ? 1 : 0})} />
            Активна
          </label>
          {err && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{err}</div>}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">{saving ? '...' : 'Запази'}</button>
        </div>
      </div>
    </div>
  )
}

function ReportModal({ report, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">
            {report.тип === 'monthly' ? '📊 Месечен инвестиционен доклад' : report.тип === 'weekly' ? '📅 Седмично резюме' : '🚨 Аларма'} · {report.месец}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap">
            {report.съдържание}
          </article>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
