import React, { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, Legend } from 'recharts'
import BulgarDashboard from './BulgarDashboard'

// Платината ще се добави по-късно (раздкоментирай реда).
const METALS = [
  { id: 'gold',     label: '🥇 Злато',    accent: '#f59e0b', accentBg: 'bg-amber-500',  bgSoft: 'bg-amber-50',  border: 'border-amber-200', textSoft: 'text-amber-700' },
  { id: 'silver',   label: '🥈 Сребро',   accent: '#9ca3af', accentBg: 'bg-gray-400',   bgSoft: 'bg-gray-100',  border: 'border-gray-300',  textSoft: 'text-gray-600' },
  // { id: 'platinum', label: '⚪ Платина',  accent: '#0ea5e9', accentBg: 'bg-sky-500',    bgSoft: 'bg-sky-50',    border: 'border-sky-200',   textSoft: 'text-sky-700' },
]

export default function Investments({ API }) {
  // 'gold' | 'silver' | 't212'
  const [asset, setAsset] = useState('gold')
  const metalConfig = METALS.find(m => m.id === asset)
  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">📈 Инвестиции</h2>
        <div className="flex gap-1 flex-wrap">
          {METALS.map(t => (
            <button key={t.id} onClick={() => setAsset(t.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${asset === t.id ? `${t.accentBg} text-white border-transparent` : 'bg-white text-gray-600 border-gray-300'}`}>
              {t.label}
            </button>
          ))}
          <button onClick={() => setAsset('t212')}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${asset === 't212' ? 'bg-blue-600 text-white border-transparent' : 'bg-white text-gray-600 border-gray-300'}`}>
            🏦 Trading 212
          </button>
          <button onClick={() => setAsset('bulgar')}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${asset === 'bulgar' ? 'bg-purple-600 text-white border-transparent' : 'bg-white text-gray-600 border-gray-300'}`}>
            💼 Bulgar Capital
          </button>
          <button onClick={() => setAsset('wealth')}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium ${asset === 'wealth' ? 'bg-emerald-600 text-white border-transparent' : 'bg-white text-gray-600 border-gray-300'}`}>
            💎 Нетно богатство
          </button>
        </div>
      </div>
      {asset === 't212'   ? <BrokerDashboard API={API} /> :
       asset === 'bulgar' ? <BulgarDashboard API={API} /> :
       asset === 'wealth' ? <WealthDashboard API={API} /> :
       <MetalDashboard API={API} metal={asset} metalConfig={metalConfig} />}
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
  const [view, setView] = useState('dashboard') // dashboard | transactions | alerts | reports | agent
  const [signals, setSignals] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [openSignal, setOpenSignal] = useState(null)
  const [showTxForm, setShowTxForm] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [editAlert, setEditAlert] = useState(null)
  const [openReport, setOpenReport] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [showImport, setShowImport] = useState(false)

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
    apiFetch(`${API}/api/investments/agent/signals?metal=${metal}&limit=30`).then(r => r.json()).then(setSignals).catch(() => setSignals([]))
  }
  useEffect(loadAll, [metal])

  const analyzeNow = async () => {
    setAnalyzing(true)
    try {
      const r = await apiFetch(`${API}/api/investments/agent/analyze`, {
        method: 'POST', body: JSON.stringify({ метал: metal }),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); setAnalyzing(false); return }
      setOpenSignal(d)
      loadAll()
      showToast('Анализът е завършен')
    } catch (e) { showToast(e.message, 'error') }
    finally { setAnalyzing(false) }
  }

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
          ['agent',       '🤖 AI Агент'],
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
              <div className="font-semibold text-emerald-800">⚖️ Цялостен месечен</div>
              <div className="text-xs text-emerald-700 mt-1">Сравнение злато + сребро.</div>
            </button>
          </div>
        </>
      )}

      {/* Transactions */}
      {view === 'transactions' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Сделки със {metalConfig?.label.split(' ')[1] || metal} ({transactions.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => setShowImport(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg">
                📥 Импорт от разходи
              </button>
              <button onClick={() => { setEditTx(null); setShowTxForm(true) }}
                className={`${metalConfig?.accentBg || 'bg-amber-500'} hover:opacity-90 text-white text-sm px-3 py-1.5 rounded-lg`}>
                + Добави сделка
              </button>
            </div>
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

      {/* AI Agent */}
      {view === 'agent' && (
        <div className="space-y-4">
          {/* Latest signal card */}
          {signals[0] && (
            <button onClick={async () => {
              const f = await apiFetch(`${API}/api/investments/agent/signals/${signals[0].id}`).then(x => x.json())
              setOpenSignal(f)
            }} className={`w-full text-left rounded-xl p-5 border-2 ${
              signals[0].сигнал === 'купи' ? 'bg-green-50 border-green-300' :
              signals[0].сигнал === 'продай' ? 'bg-red-50 border-red-300' :
              signals[0].сигнал === 'наблюдавай' ? 'bg-yellow-50 border-yellow-300' :
              'bg-gray-50 border-gray-200'
            } hover:shadow-md`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{signals[0].сигнал === 'купи' ? '🟢' : signals[0].сигнал === 'продай' ? '🔴' : signals[0].сигнал === 'наблюдавай' ? '🟡' : '⚪'}</span>
                  <div>
                    <div className="text-xl font-bold text-gray-800 uppercase">{signals[0].сигнал}</div>
                    <div className="text-xs text-gray-500">{new Date(signals[0].дата).toLocaleString('bg-BG')}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-700">{signals[0].уверенност}%</div>
                  <div className="text-xs text-gray-500">увереност</div>
                </div>
              </div>
              {signals[0].действие_препоръка && (
                <div className="bg-white/60 border border-gray-200 rounded-lg p-3 mt-3">
                  <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Действие</div>
                  <div className="text-sm text-gray-800">{signals[0].действие_препоръка}</div>
                </div>
              )}
              {signals[0].обоснование && (
                <p className="text-sm text-gray-600 mt-3 italic">"{signals[0].обоснование}"</p>
              )}
              <div className="text-xs text-blue-600 mt-3">прегледай детайли →</div>
            </button>
          )}

          {/* Manual analyze button */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">🤖 Анализ сега</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  AI чете последните новини за {metalConfig?.label} + цените + портфейла → генерира сигнал.
                </p>
              </div>
              <button onClick={analyzeNow} disabled={analyzing}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                {analyzing ? '...analyzing' : '⚡ Анализирай'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">История на сигналите ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">
                Все още няма анализи. Натисни <strong>⚡ Анализирай</strong> или изчакай ежедневния cron (09:30 Mon-Fri).
              </div>
            ) : (
              <div className="space-y-1">
                {signals.slice(1).map(s => (
                  <button key={s.id} onClick={async () => {
                    const f = await apiFetch(`${API}/api/investments/agent/signals/${s.id}`).then(x => x.json())
                    setOpenSignal(f)
                  }} className="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                    <span className="text-xl">{s.сигнал === 'купи' ? '🟢' : s.сигнал === 'продай' ? '🔴' : s.сигнал === 'наблюдавай' ? '🟡' : '⚪'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium uppercase">{s.сигнал}</span>
                        <span className="text-xs text-gray-500">{s.уверенност}%</span>
                        {s.email_sent ? <span className="text-xs text-green-600">✉️</span> : null}
                      </div>
                      <div className="text-xs text-gray-500">{new Date(s.дата).toLocaleString('bg-BG')} · €{s.цена_eur ? Number(s.цена_eur).toFixed(0) : 'n/a'}/oz</div>
                    </div>
                    <div className="text-xs text-blue-600">→</div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
      {showImport && <ImportFromExpenses API={API} metal={metal} metalConfig={metalConfig}
        onClose={() => setShowImport(false)}
        onImported={(n) => { showToast(`Импортирани ${n} сделки`); loadAll() }}
      />}
      {openReport && <ReportModal report={openReport} onClose={() => setOpenReport(null)} />}
      {openSignal && <SignalModal signal={openSignal} onClose={() => setOpenSignal(null)} />}
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

function SignalModal({ signal, onClose }) {
  const news = (() => {
    try { return JSON.parse(signal.новини_json || '{}').news || [] } catch { return [] }
  })()
  const keywords = (() => {
    try { return JSON.parse(signal.новини_json || '{}').keywords || [] } catch { return [] }
  })()
  const icon = { 'купи': '🟢', 'продай': '🔴', 'задръж': '⚪', 'наблюдавай': '🟡' }[signal.сигнал] || '📊'
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{icon}</span>
            <div>
              <h3 className="font-bold text-gray-900 text-lg uppercase">{signal.сигнал} {signal.метал === 'gold' ? 'злато' : 'сребро'}</h3>
              <div className="text-xs text-gray-500">{new Date(signal.дата).toLocaleString('bg-BG')} · €{signal.цена_eur ? Number(signal.цена_eur).toFixed(2) : 'n/a'}/oz · {signal.уверенност}% увереност</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {signal.действие_препоръка && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-green-700 uppercase mb-1">⚡ Действие</div>
              <div className="text-sm text-green-900 font-semibold">{signal.действие_препоръка}</div>
            </div>
          )}
          {signal.обоснование && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">📝 Обоснование</div>
              <p className="text-sm text-gray-800">{signal.обоснование}</p>
            </div>
          )}
          {keywords.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">🔑 Ключови фактори</div>
              <ul className="text-sm text-gray-800 space-y-1">
                {keywords.map((k, i) => <li key={i}>• {k}</li>)}
              </ul>
            </div>
          )}
          {news.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">📰 Анализирани новини ({news.length})</div>
              <div className="space-y-2">
                {news.map((n, i) => (
                  <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                    className="block bg-gray-50 hover:bg-blue-50 rounded-lg p-3 border border-gray-200">
                    <div className="text-xs text-blue-600 font-semibold">{n.source}</div>
                    <div className="text-sm font-medium text-gray-800 mt-0.5">{n.title}</div>
                    {n.description && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{n.description.slice(0, 200)}</div>}
                    {n.pubDate && <div className="text-xs text-gray-400 mt-1">{n.pubDate}</div>}
                  </a>
                ))}
              </div>
            </div>
          )}
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

function ImportFromExpenses({ API, metal, metalConfig, onClose, onImported }) {
  const [candidates, setCandidates] = useState(null)
  const [importing, setImporting] = useState(null) // expense id being processed
  const [qtys, setQtys] = useState({}) // { [expense_id]: 'oz string' }
  const [products, setProducts] = useState({})
  const [err, setErr] = useState(null)
  const [imported, setImported] = useState(0)

  useEffect(() => {
    apiFetch(`${API}/api/investments/${metal}/expense-candidates`)
      .then(r => r.json())
      .then(d => setCandidates(Array.isArray(d) ? d : []))
      .catch(() => setCandidates([]))
  }, [metal])

  const importOne = async (expense) => {
    const qty = Number(qtys[expense.id])
    if (!qty || qty <= 0) { setErr(`Въведи количество (oz) за разход #${expense.id}`); return }
    setImporting(expense.id); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/investments/${metal}/import-from-expense`, {
        method: 'POST',
        body: JSON.stringify({
          expense_id: expense.id,
          количество: qty,
          продукт: products[expense.id] || '',
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Грешка'); setImporting(null); return }
      setCandidates(prev => prev.filter(c => c.id !== expense.id))
      setImported(n => n + 1)
      setImporting(null)
    } catch (e) { setErr(e.message); setImporting(null) }
  }

  const matched = candidates?.filter(c => c._metal_match) || []
  const other   = candidates?.filter(c => !c._metal_match) || []

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">📥 Импорт от разходи → {metalConfig?.label}</h3>
            <p className="text-sm text-gray-500">Само разходи с категория "инвестиция" или "благородни метали". Зеленото означава, че описанието съдържа ключова дума за {metalConfig?.label}.</p>
          </div>
          <button onClick={() => onClose(imported)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {candidates === null ? (
            <div className="text-center text-gray-400 py-12">Зареждане...</div>
          ) : candidates.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-2">📭</div>
              <div>Няма неимпортирани разходи в категория "инвестиция" / "благородни метали".</div>
            </div>
          ) : (
            <div className="space-y-2">
              {matched.length > 0 && <div className="text-xs font-semibold text-green-700 mb-1">🎯 С ключова дума за {metalConfig?.label} ({matched.length})</div>}
              {matched.map(e => <Row key={e.id} expense={e} matched={true} qtys={qtys} setQtys={setQtys} products={products} setProducts={setProducts} importOne={importOne} importing={importing} metalConfig={metalConfig} />)}

              {other.length > 0 && <div className="text-xs font-semibold text-gray-500 mt-4 mb-1">Други (без явно съвпадение)</div>}
              {other.map(e => <Row key={e.id} expense={e} matched={false} qtys={qtys} setQtys={setQtys} products={products} setProducts={setProducts} importOne={importOne} importing={importing} metalConfig={metalConfig} />)}
            </div>
          )}
          {err && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{err}</div>}
        </div>

        <div className="px-6 py-4 border-t flex justify-between items-center">
          <div className="text-xs text-gray-500">
            {imported > 0 && <span className="text-green-700 font-semibold">✓ Импортирани {imported}</span>}
          </div>
          <button onClick={() => { if (imported > 0) onImported(imported); onClose() }}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            Затвори
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ expense, matched, qtys, setQtys, products, setProducts, importOne, importing, metalConfig }) {
  const date = expense.invoice_date || expense.месец || expense.created_at
  const qty = Number(qtys[expense.id]) || 0
  const total = Number(expense.amount) || 0
  const unit = qty > 0 ? total / qty : 0
  return (
    <div className={`grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg border ${matched ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="md:col-span-5">
        <div className="font-medium text-gray-800 truncate">{expense.supplier_name || '— без доставчик'}</div>
        <div className="text-xs text-gray-500 truncate">{expense.reason || '—'}</div>
        <div className="text-xs text-gray-400">
          {date ? new Date(date).toLocaleDateString('bg-BG') : '—'} · Категория: {expense.expense_category} · #{expense.id}
        </div>
      </div>

      <div className="md:col-span-2 text-right">
        <div className="text-xs text-gray-500">Сума</div>
        <div className="font-semibold text-gray-800">€{total.toFixed(2)}</div>
      </div>

      <div className="md:col-span-3">
        <input type="number" step="0.001" min="0.001" value={qtys[expense.id] || ''}
          onChange={e => setQtys(p => ({ ...p, [expense.id]: e.target.value }))}
          placeholder="oz"
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
        <input type="text" value={products[expense.id] || ''}
          onChange={e => setProducts(p => ({ ...p, [expense.id]: e.target.value }))}
          placeholder="Продукт (опционално)"
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-1" />
        {qty > 0 && (
          <div className="text-xs text-gray-500 mt-0.5">→ €{unit.toFixed(2)}/oz</div>
        )}
      </div>

      <div className="md:col-span-2 flex items-start justify-end">
        <button onClick={() => importOne(expense)}
          disabled={importing === expense.id || !qty}
          className={`${metalConfig?.accentBg || 'bg-amber-500'} hover:opacity-90 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg`}>
          {importing === expense.id ? '...' : '✓ Импортирай'}
        </button>
      </div>
    </div>
  )
}

// ── Trading 212 broker dashboard ─────────────────────────────────────────
function BrokerDashboard({ API }) {
  const [account, setAccount] = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [orders, setOrders] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [snapping, setSnapping] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const loadAll = async () => {
    setLoading(true); setError(null)
    try {
      const [accR, pfR, ordR, histR] = await Promise.all([
        apiFetch(`${API}/api/investments/broker/t212/account`),
        apiFetch(`${API}/api/investments/broker/t212/portfolio`),
        apiFetch(`${API}/api/investments/broker/t212/orders`),
        apiFetch(`${API}/api/investments/broker/t212/history?days=90`),
      ])
      const [acc, pf, ord, hist] = await Promise.all([accR.json(), pfR.json(), ordR.json(), histR.json()])
      if (!accR.ok) throw new Error(acc.error || 'account')
      if (!pfR.ok)  throw new Error(pf.error  || 'portfolio')
      if (!ordR.ok) throw new Error(ord.error || 'orders')
      setAccount(acc); setPortfolio(pf); setOrders(ord)
      setHistory(Array.isArray(hist) ? hist : [])
      setRefreshedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadAll() }, [])

  const snapshotNow = async () => {
    setSnapping(true)
    try {
      const r = await apiFetch(`${API}/api/investments/broker/t212/snapshot`, { method: 'POST' })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'snapshot') }
      await loadAll()
    } catch (e) { setError(e.message) }
    finally { setSnapping(false) }
  }

  const chartData = history.map(h => ({
    дата: new Date(h.дата).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' }),
    // T212 cash.total е NAV-ът (cash + positions at market) → не добавяме печалбата отделно
    стойност: Number(h.кеш_общо || 0),
    инвестирано: Number(h.инвестирано || 0),
  }))

  if (loading && !account) {
    return <div className="text-center py-12 text-gray-400">⏳ Зареждам Trading 212…</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="font-semibold text-red-800 mb-1">⚠️ Грешка от Trading 212</div>
        <div className="text-sm text-red-700">{error}</div>
        <button onClick={loadAll} className="mt-3 bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg">
          Опитай отново
        </button>
      </div>
    )
  }

  const cur = account?.валута || 'EUR'
  const totalWealth = (account?.кеш_общо || 0) + (portfolio?.общо?.печалба || 0) // total = cash incl. blocked + unrealized profit (invested вече е в кеш-блокиран)
  const profit = portfolio?.общо?.печалба || 0
  const profitPct = portfolio?.общо?.печалба_pct || 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-xs text-gray-500">
          {account?.акаунт_id && <>Акаунт #{account.акаунт_id} · {cur}</>}
          {refreshedAt && <> · обновено {refreshedAt.toLocaleTimeString('bg-BG')}</>}
        </div>
        <div className="flex gap-2">
          <button onClick={snapshotNow} disabled={snapping || loading}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
            {snapping ? '⏳' : '📸'} Snapshot
          </button>
          <button onClick={loadAll} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
            {loading ? '⏳' : '🔄'} Обнови
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="text-xs text-blue-700 font-semibold uppercase">Общо в T212</div>
          <div className="text-xl font-bold text-blue-800 mt-0.5">{cur} {fmtMoney(account?.кеш_общо, 2)}</div>
          <div className="text-xs text-blue-600 mt-0.5">{portfolio?.брой_позиции || 0} позиции</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-600 font-semibold uppercase">Кеш</div>
          <div className="text-xl font-bold text-gray-800 mt-0.5">{cur} {fmtMoney(account?.кеш_свободен, 2)}</div>
          {(account?.блокиран || 0) > 0 && (
            <div className="text-xs text-orange-600 mt-0.5">Блокиран: {cur} {fmtMoney(account.блокиран, 2)}</div>
          )}
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="text-xs text-purple-700 font-semibold uppercase">Инвестирано</div>
          <div className="text-xl font-bold text-purple-800 mt-0.5">{cur} {fmtMoney(portfolio?.общо?.инвестирано, 2)}</div>
          <div className="text-xs text-purple-600 mt-0.5">Стойност: {cur} {fmtMoney(portfolio?.общо?.текуща_стойност, 2)}</div>
        </div>
        <div className={`rounded-xl p-3 border ${profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-xs font-semibold uppercase ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>Печалба</div>
          <div className={`text-xl font-bold mt-0.5 ${profit >= 0 ? 'text-green-800' : 'text-red-800'}`}>
            {profit >= 0 ? '+' : ''}{cur} {fmtMoney(profit, 2)}
          </div>
          {profitPct !== 0 && (
            <div className={`text-xs mt-0.5 ${profitPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {profitPct >= 0 ? '▲' : '▼'} {Math.abs(profitPct).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Historical chart */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">📈 Стойност на портфейла (последни 90 дни)</h3>
          <span className="text-xs text-gray-400">{cur}</span>
        </div>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <XAxis dataKey="дата" tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => `${cur} ${v.toFixed(0)}`} />
              <Tooltip formatter={v => `${cur} ${Number(v).toFixed(2)}`} />
              <Line type="monotone" dataKey="стойност" name="Обща стойност" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="инвестирано" name="Инвестирано" stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-gray-400 py-12 text-sm">
            Все още няма достатъчно snapshots за chart.<br/>
            <span className="text-xs">Cron-ът записва snapshot в 18:30 (Пн-Пт). Натисни 📸 Snapshot за ad-hoc запис.</span>
          </div>
        )}
      </div>

      {/* Pending orders */}
      {orders?.брой > 0 && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">⏳ Чакащи поръчки ({orders.брой})</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Инструмент','ISIN','Страна','Тип','Статус','Стойност','Подадена'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.поръчки.map(o => (
                  <tr key={o.id} className="hover:bg-blue-50/40">
                    <td className="px-2 py-1.5 text-xs font-medium">{o.име}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-gray-500">{o.isin || '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.страна === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.страна}</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{o.тип}</td>
                    <td className="px-2 py-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{o.статус}</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs font-semibold">{cur} {fmtMoney(o.стойност, 2)}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-500">{fmtDate(o.създадена)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Positions */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 Позиции ({portfolio?.брой_позиции || 0})</h3>
        {(!portfolio?.позиции || portfolio.позиции.length === 0) ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            Все още няма открити позиции в Trading 212.
            {orders?.брой > 0 && <div className="mt-1 text-xs">Имаш {orders.брой} чакаща(и) поръчка(и) — ще се появят тук след изпълнение.</div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Тикер','Количество','Ср. цена','Текуща','Инвестирано','Стойност','Печалба','%'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {portfolio.позиции.map(p => (
                  <tr key={p.тикер} className="hover:bg-blue-50/40">
                    <td className="px-2 py-1.5 text-xs font-mono">{p.тикер}{p.в_pie && <span className="ml-1 text-purple-600">🥧</span>}</td>
                    <td className="px-2 py-1.5 text-xs">{fmtMoney(p.количество, 4)}</td>
                    <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(p.средна_цена, 2)}</td>
                    <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(p.текуща_цена, 2)}</td>
                    <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(p.инвестирано, 2)}</td>
                    <td className="px-2 py-1.5 text-xs font-semibold">{cur} {fmtMoney(p.текуща_стойност, 2)}</td>
                    <td className={`px-2 py-1.5 text-xs font-semibold ${p.печалба >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {p.печалба >= 0 ? '+' : ''}{cur} {fmtMoney(p.печалба, 2)}
                    </td>
                    <td className={`px-2 py-1.5 text-xs ${p.печалба_pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {p.печалба_pct >= 0 ? '▲' : '▼'} {Math.abs(p.печалба_pct).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-400 text-center">
        Данните се кешират ~30s–1min на T212-страна за да не удрят rate limit-а.
      </div>
    </div>
  )
}

// ── Net Worth dashboard ──────────────────────────────────────────────────
const WEALTH_COLORS = {
  имоти_equity: '#10b981',  // emerald
  злато:        '#f59e0b',  // amber
  сребро:       '#9ca3af',  // gray
  t212:         '#2563eb',  // blue
}
const WEALTH_LABELS = {
  имоти_equity: '🏠 Имоти (equity)',
  злато:        '🥇 Злато',
  сребро:       '🥈 Сребро',
  t212:         '🏦 Trading 212',
}

function WealthDashboard({ API }) {
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [monthly, setMonthly] = useState([])
  const [goals, setGoals] = useState([])
  const [view, setView] = useState('overview') // overview | compare | goals | monthly
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [snapping, setSnapping] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const [compareDate, setCompareDate] = useState('')
  const [comparePoint, setComparePoint] = useState(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editGoal, setEditGoal] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [sR, hR, mR, gR] = await Promise.all([
        apiFetch(`${API}/api/investments/wealth/summary`),
        apiFetch(`${API}/api/investments/wealth/history?days=365`),
        apiFetch(`${API}/api/investments/wealth/monthly?months=24`),
        apiFetch(`${API}/api/investments/wealth/goals`),
      ])
      const [d, h, m, g] = await Promise.all([sR.json(), hR.json(), mR.json(), gR.json()])
      if (!sR.ok) throw new Error(d.error || 'грешка')
      setData(d)
      setHistory(Array.isArray(h) ? h : [])
      setMonthly(Array.isArray(m) ? m : [])
      setGoals(Array.isArray(g) ? g : [])
      setRefreshedAt(new Date())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const snapshotNow = async () => {
    setSnapping(true)
    try {
      const r = await apiFetch(`${API}/api/investments/wealth/snapshot`, { method: 'POST' })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'snapshot') }
      await load()
    } catch (e) { setError(e.message) }
    finally { setSnapping(false) }
  }

  const loadCompare = async (date) => {
    setCompareDate(date)
    if (!date) { setComparePoint(null); return }
    try {
      const r = await apiFetch(`${API}/api/investments/wealth/at?date=${date}`)
      const d = await r.json()
      setComparePoint(r.ok ? d : { error: d.error })
    } catch (e) { setComparePoint({ error: e.message }) }
  }

  if (loading && !data) return <div className="text-center py-12 text-gray-400">⏳ Изчислявам нетното богатство…</div>
  if (error)            return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">⚠️ {error}</div>
  if (!data)            return null

  const cur = data.валута || 'EUR'
  const a = data.разпределение || {}
  // Pie data — само секции с положителна стойност
  const slices = Object.entries({
    имоти_equity: data.имоти?.equity || 0,
    злато:        data.злато?.текуща_стойност || 0,
    сребро:       data.сребро?.текуща_стойност || 0,
    t212:         data.t212?.обща_стойност || 0,
  }).filter(([_, v]) => v > 0).map(([k, v]) => ({ name: WEALTH_LABELS[k], value: v, key: k }))

  // Cards
  const cards = [
    { key: 'имоти_equity', title: '🏠 Имоти (equity)', value: data.имоти?.equity, subtitle: `${data.имоти?.брой || 0} имота · asset ${cur} ${fmtMoney(data.имоти?.asset_value, 0)} − дълг ${cur} ${fmtMoney(data.имоти?.debt, 0)}` },
    { key: 'злато',        title: '🥇 Злато',           value: data.злато?.текуща_стойност || 0, subtitle: `${fmtMoney(data.злато?.общо_oz, 3)} oz · ${cur} ${fmtMoney(data.злато?.обща_инвестиция, 0)} инвестирано` },
    { key: 'сребро',       title: '🥈 Сребро',          value: data.сребро?.текуща_стойност || 0, subtitle: `${fmtMoney(data.сребро?.общо_oz, 3)} oz · ${cur} ${fmtMoney(data.сребро?.обща_инвестиция, 0)} инвестирано` },
    { key: 't212',         title: '🏦 Trading 212',     value: data.t212?.обща_стойност || 0, subtitle: `${data.t212?.брой_позиции || 0} позиции · ${cur} ${fmtMoney(data.t212?.инвестирано, 0)} инвестирано${data.t212?.източник === 'snapshot' ? ' (от snapshot)' : ''}` },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-xs text-gray-500">
          {refreshedAt && <>Обновено {refreshedAt.toLocaleTimeString('bg-BG')}</>}
          {history.length > 0 && <> · {history.length} snapshot(s)</>}
        </div>
        <div className="flex gap-2">
          <button onClick={snapshotNow} disabled={snapping || loading}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
            {snapping ? '⏳' : '📸'} Snapshot
          </button>
          <button onClick={load} disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
            {loading ? '⏳' : '🔄'} Преизчисли
          </button>
        </div>
      </div>

      {/* Hero — total wealth */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-6 mb-5 text-white">
        <div className="text-sm uppercase font-semibold opacity-90">Общо нетно богатство</div>
        <div className="text-4xl font-bold mt-1">{cur} {fmtMoney(data.общо, 0)}</div>
        <div className="text-xs opacity-80 mt-2">
          Equity в имоти + злато + сребро + Trading 212 (NAV)
        </div>
        {history.length > 1 && (() => {
          const first = history[0]
          const delta = data.общо - (first.общо || 0)
          const pct = first.общо > 0 ? (delta / first.общо) * 100 : 0
          const days = Math.max(1, Math.ceil((Date.now() - new Date(first.дата).getTime()) / 86400000))
          return (
            <div className="text-xs opacity-90 mt-1">
              {delta >= 0 ? '▲' : '▼'} {cur} {fmtMoney(Math.abs(delta), 0)} ({delta >= 0 ? '+' : ''}{pct.toFixed(2)}%) за последните {days} дни
            </div>
          )
        })()}
      </div>

      {/* Historical chart */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">📈 Нетно богатство във времето</h3>
          <span className="text-xs text-gray-400">{cur}</span>
        </div>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history.map(h => ({
              дата: new Date(h.дата).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' }),
              Общо: Number(h.общо || 0),
              Имоти: Number(h.имоти_equity || 0),
              T212: Number(h.t212 || 0),
              Метали: Number((h.злато || 0) + (h.сребро || 0)),
            }))}>
              <XAxis dataKey="дата" tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `${cur} ${fmtMoney(v, 0)}`} />
              <Legend />
              <Line type="monotone" dataKey="Общо"   stroke="#059669" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Имоти"  stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="T212"   stroke="#2563eb" strokeWidth={1} dot={false} />
              <Line type="monotone" dataKey="Метали" stroke="#f59e0b" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-gray-400 py-12 text-sm">
            Все още няма достатъчно snapshots за chart ({history.length}/2 минимум).<br/>
            <span className="text-xs">Cron-ът записва snapshot в 19:00 всеки ден. Натисни 📸 Snapshot за ad-hoc запис.</span>
          </div>
        )}
      </div>

      {/* Pie + cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Разпределение по asset class</h3>
          {slices.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {slices.map(s => <Cell key={s.key} fill={WEALTH_COLORS[s.key]} />)}
                </Pie>
                <Tooltip formatter={v => `${cur} ${fmtMoney(v, 0)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-400 py-12 text-sm">Няма данни за визуализация</div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Дял от общото (%)</h3>
          <div className="space-y-3">
            {Object.entries(a).map(([k, pct]) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{WEALTH_LABELS[k]}</span>
                  <span className="text-gray-500">{pct.toFixed(2)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: WEALTH_COLORS[k] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Asset class cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {cards.map(c => (
          <div key={c.key} className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-700">{c.title}</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: WEALTH_COLORS[c.key] }}></span>
            </div>
            <div className="text-2xl font-bold text-gray-800">{cur} {fmtMoney(c.value, 0)}</div>
            <div className="text-xs text-gray-500 mt-1">{c.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Sub-view switcher */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ['compare', '⏪ Сравни с минала дата'],
          ['goals',   '🎯 Цели'],
          ['monthly', '📅 Месечен отчет'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setView(view === id ? 'overview' : id)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${view === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Compare with past date */}
      {view === 'compare' && (() => {
        const comp = comparePoint && !comparePoint.error ? comparePoint : null
        const delta = comp ? data.общо - (comp.общо || 0) : 0
        const pct = comp && comp.общо > 0 ? (delta / comp.общо) * 100 : 0
        const days = comp ? Math.max(1, Math.ceil((Date.now() - new Date(comp.дата).getTime()) / 86400000)) : 0
        return (
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label className="text-sm font-semibold text-gray-700">Сравни с дата:</label>
              <input type="date" value={compareDate}
                max={new Date().toISOString().slice(0,10)}
                onChange={e => loadCompare(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            {comparePoint?.error && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                ⚠️ {comparePoint.error}
              </div>
            )}
            {comp && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="text-xs text-gray-500 uppercase font-semibold">На {fmtDate(comp.дата)}</div>
                  <div className="text-2xl font-bold text-gray-800 mt-1">{cur} {fmtMoney(comp.общо, 0)}</div>
                  <div className="text-xs text-gray-500 mt-1">{comp.имоти_брой} имота · преди {days} дни</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-xs text-emerald-700 uppercase font-semibold">Сега</div>
                  <div className="text-2xl font-bold text-emerald-800 mt-1">{cur} {fmtMoney(data.общо, 0)}</div>
                </div>
                <div className={`rounded-xl p-3 border ${delta >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-xs uppercase font-semibold ${delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>Промяна</div>
                  <div className={`text-2xl font-bold mt-1 ${delta >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                    {delta >= 0 ? '+' : ''}{cur} {fmtMoney(delta, 0)}
                  </div>
                  <div className={`text-xs mt-1 ${pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}% ≈ {cur} {fmtMoney(delta / (days / 30.44), 0)}/мес
                  </div>
                </div>
              </div>
            )}
            {comp && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Принос по asset class</h4>
                <div className="space-y-2">
                  {[
                    ['🏠 Имоти equity', comp.имоти_equity || 0, data.имоти?.equity || 0],
                    ['🥇 Злато',        comp.злато || 0,        data.злато?.текуща_стойност || 0],
                    ['🥈 Сребро',       comp.сребро || 0,       data.сребро?.текуща_стойност || 0],
                    ['🏦 Trading 212',  comp.t212 || 0,         data.t212?.обща_стойност || 0],
                  ].map(([name, then, now]) => {
                    const d = now - then
                    return (
                      <div key={name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{name}</span>
                        <span className="text-gray-500">{cur} {fmtMoney(then, 0)} → {cur} {fmtMoney(now, 0)}</span>
                        <span className={`font-semibold ${d >= 0 ? 'text-green-700' : 'text-red-700'}`}>{d >= 0 ? '+' : ''}{cur} {fmtMoney(d, 0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Goals */}
      {view === 'goals' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">🎯 Цели за нетно богатство</h3>
            <button onClick={() => { setEditGoal(null); setShowGoalForm(true) }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1.5 rounded-lg">
              + Нова цел
            </button>
          </div>
          {goals.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              Все още няма зададени цели. Натисни "+ Нова цел" за първата.
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div>
                      <div className="font-semibold text-gray-800">{g.име}</div>
                      <div className="text-xs text-gray-500">{cur} {fmtMoney(g.цел_сума, 0)} до {fmtDate(g.цел_дата)}</div>
                      {g.бележка && <div className="text-xs text-gray-600 italic mt-0.5">"{g.бележка}"</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditGoal(g); setShowGoalForm(true) }} className="text-xs px-2 py-1 text-blue-700 hover:bg-blue-50 rounded">✏️</button>
                      <button onClick={async () => {
                        if (!window.confirm(`Изтриване на целта "${g.име}"?`)) return
                        await apiFetch(`${API}/api/investments/wealth/goals/${g.id}`, { method: 'DELETE' })
                        load()
                      }} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">🗑️</button>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full transition-all ${g.прогрес_pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, g.прогрес_pct)}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 mt-2">
                    <span><strong>{g.прогрес_pct.toFixed(1)}%</strong> от целта</span>
                    <span>·</span>
                    <span>{cur} {fmtMoney(g.текущо, 0)} / {cur} {fmtMoney(g.цел_сума, 0)}</span>
                    {g.оставащо > 0 && <><span>·</span><span>Остават {cur} {fmtMoney(g.оставащо, 0)} за {g.дни_до_цел} дни</span></>}
                    {g.нужно_месечно > 0 && <><span>·</span><span className="font-medium">≈ {cur} {fmtMoney(g.нужно_месечно, 0)}/мес</span></>}
                    {g.прогнозна_дата && <><span>·</span><span className={new Date(g.прогнозна_дата) <= new Date(g.цел_дата) ? 'text-green-700' : 'text-orange-700'}>📅 при сегашен темп: {fmtDate(g.прогнозна_дата)}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {goals.length > 0 && history.length < 7 && (
            <div className="mt-3 text-xs text-gray-500 italic">
              ℹ️ Прогнозите за дата и нужна месечна спестявания изискват поне 7 snapshots в историята за смислен темп. Сега имаме {history.length}.
            </div>
          )}
        </div>
      )}

      {/* Monthly table */}
      {view === 'monthly' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">📅 Месечен отчет (последни {monthly.length} мес.)</h3>
          {monthly.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Все още няма достатъчно snapshots.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Месец','Общо','Имоти equity','Злато','Сребро','T212','Промяна','%'].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...monthly].reverse().map(m => (
                    <tr key={m.месец} className="hover:bg-emerald-50/40">
                      <td className="px-2 py-1.5 text-xs font-mono">{m.месец}</td>
                      <td className="px-2 py-1.5 text-xs font-semibold">{cur} {fmtMoney(m.общо, 0)}</td>
                      <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(m.имоти_equity, 0)}</td>
                      <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(m.злато, 0)}</td>
                      <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(m.сребро, 0)}</td>
                      <td className="px-2 py-1.5 text-xs">{cur} {fmtMoney(m.t212, 0)}</td>
                      <td className={`px-2 py-1.5 text-xs font-semibold ${(m.промяна || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {m.промяна === null ? '—' : `${m.промяна >= 0 ? '+' : ''}${cur} ${fmtMoney(m.промяна, 0)}`}
                      </td>
                      <td className={`px-2 py-1.5 text-xs ${(m.промяна_pct || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {m.промяна_pct === null ? '—' : `${m.промяна_pct >= 0 ? '▲' : '▼'} ${Math.abs(m.промяна_pct).toFixed(2)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showGoalForm && (
        <GoalForm API={API} initial={editGoal} cur={cur}
          onClose={() => { setShowGoalForm(false); setEditGoal(null) }}
          onSaved={() => { setShowGoalForm(false); setEditGoal(null); load() }} />
      )}

      {data.t212?.live_error && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
          ⚠️ Trading 212 live API недостъпен — ползвам последния snapshot ({fmtDate(data.t212.snapshot_date)}). Грешка: {data.t212.live_error}
        </div>
      )}
    </div>
  )
}

function GoalForm({ API, initial, cur, onClose, onSaved }) {
  const [name, setName] = useState(initial?.име || '')
  const [amount, setAmount] = useState(initial?.цел_сума || '')
  const [date, setDate] = useState(initial?.цел_дата || '')
  const [note, setNote] = useState(initial?.бележка || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    if (!name || !amount || !date) { setErr('Попълни име, сума и дата'); return }
    setSaving(true); setErr(null)
    try {
      const body = JSON.stringify({ име: name, цел_сума: Number(amount), цел_дата: date, бележка: note })
      const url = initial ? `${API}/api/investments/wealth/goals/${initial.id}` : `${API}/api/investments/wealth/goals`
      const r = await apiFetch(url, { method: initial ? 'PUT' : 'POST', body })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'грешка') }
      onSaved()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-4">{initial ? '✏️ Редакция на цел' : '🎯 Нова цел'}</h3>
        {err && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 mb-3">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase">Име *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="напр. €1 милион до 2030"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase">Целева сума ({cur}) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase">Целева дата *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().slice(0,10)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase">Бележка</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="опционално"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Откажи</button>
          <button onClick={save} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
            {saving ? '⏳' : (initial ? 'Запази' : 'Създай')}
          </button>
        </div>
      </div>
    </div>
  )
}
