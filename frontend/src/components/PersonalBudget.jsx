// Личен бюджет — доходи (заплата / договор управление / дивиденти / лихва /
// друго), лични разходи, savings rate спрямо цел. Целта: дисциплина за
// инвестиране — колко свободна сума остава месечно и колко вече сте вложили.

import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line,
} from 'recharts'

// Палитра за категории (циклична)
const CAT_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#a855f7']

const API = import.meta.env.VITE_API_URL || ''
const INCOME_TYPES = ['заплата', 'управление', 'дивидент', 'лихва_болгар', 'sky_capital', 'друго']
const INCOME_LABEL = {
  заплата:       'Заплата',
  управление:    'Договор управление',
  дивидент:      'Дивидент',
  лихва_болгар:  'Лихва (Болгар Капитал)',
  sky_capital:   'Sky Capital',
  друго:         'Друго',
}

const fmt = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmt0 = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:0, maximumFractionDigits:0 })

export default function PersonalBudget() {
  const today = new Date().toISOString().slice(0, 7)
  // period: { type: 'month'|'months'|'custom', value }
  const [period, setPeriod]     = useState({ type: 'month', value: today })
  const [summary, setSummary]   = useState(null)
  const [income, setIncome]     = useState([])
  const [timeline, setTimeline] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [rebuildResult, setRebuildResult] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [view, setView]         = useState('overview') // 'overview' | 'analysis'

  // Period → query string
  const periodQuery = () => {
    if (period.type === 'month')  return `month=${period.value}`
    if (period.type === 'months') return `months=${period.value}`
    return `from=${period.value.from}&to=${period.value.to}`
  }
  // За GET income списък (винаги по месец) — ползваме последния месец от периода
  const incomeMonth = () => {
    if (period.type === 'month') return period.value
    if (period.type === 'months') return today
    return period.value.to.slice(0, 7)
  }
  const [form, setForm]         = useState({
    дата: new Date().toISOString().slice(0, 10),
    тип:  'заплата',
    сума: '',
    валута: 'EUR',
    източник: '',
    бележка: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    const q = periodQuery()
    Promise.all([
      apiFetch(`${API}/api/personal/summary?${q}`).then(r => r.json()),
      apiFetch(`${API}/api/personal/income?month=${incomeMonth()}`).then(r => r.json()),
      apiFetch(`${API}/api/personal/summary/timeline?months=12`).then(r => r.json()),
      apiFetch(`${API}/api/personal/expenses/breakdown?${q}`).then(r => r.json()),
    ]).then(([s, i, t, b]) => {
      setSummary(s); setIncome(i); setTimeline(t); setBreakdown(b); setLoading(false)
    }).catch(() => setLoading(false))
  }, [period])

  useEffect(() => {
    if (initialized) return
    apiFetch(`${API}/api/personal/last-month`)
      .then(r => r.json())
      .then(d => {
        if (d?.месец && d.месец !== today) setPeriod({ type: 'month', value: d.месец })
        setInitialized(true)
      })
      .catch(() => setInitialized(true))
  }, [initialized, today])

  useEffect(() => { if (initialized) load() }, [load, initialized])

  const doRebuild = () => {
    apiFetch(`${API}/api/personal/rebuild-from-tx`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        setRebuildResult(d)
        load()
        setTimeout(() => setRebuildResult(null), 8000)
      })
  }

  const submitIncome = () => {
    if (!form.дата || !form.сума) return
    apiFetch(`${API}/api/personal/income`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, сума: Number(form.сума) }),
    }).then(r => r.json()).then(() => {
      setShowAdd(false)
      setForm(f => ({ ...f, сума: '', източник: '', бележка: '' }))
      load()
    })
  }

  const removeIncome = (id) => {
    if (!confirm('Изтрий записа?')) return
    apiFetch(`${API}/api/personal/income/${id}`, { method: 'DELETE' })
      .then(() => load())
  }

  const s = summary || {}
  const sv = s.savings || {}
  const dispKt = sv.дисциплина === 'над цел' ? 'text-emerald-700' : sv.дисциплина === 'под цел' ? 'text-rose-700' : 'text-gray-500'

  return (
    <div className="space-y-4">
      {/* Header — view tabs + period selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1">
            <button onClick={() => setView('overview')}
                    className={`px-3 py-1.5 text-sm rounded font-medium ${view === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              📊 Преглед
            </button>
            <button onClick={() => setView('analysis')}
                    className={`px-3 py-1.5 text-sm rounded font-medium ${view === 'analysis' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              🔬 Анализ разходи
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={doRebuild}
                    title="Сканира bank transactions и създава липсващи personal_income"
                    className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded text-sm font-medium">
              ⟳ Преизчисли
            </button>
            <button onClick={() => setShowAdd(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">
              + Добави доход
            </button>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-end gap-3 flex-wrap pt-2 border-t border-gray-100">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Бърз период</div>
            <div className="flex gap-1 flex-wrap">
              {[
                { lbl: '1м',  type: 'months', value: 1 },
                { lbl: '3м',  type: 'months', value: 3 },
                { lbl: '6м',  type: 'months', value: 6 },
                { lbl: '12м', type: 'months', value: 12 },
                { lbl: '24м', type: 'months', value: 24 },
              ].map(p => (
                <button key={p.lbl}
                        onClick={() => setPeriod({ type: 'months', value: p.value })}
                        className={`px-2.5 py-1 rounded text-xs font-medium border ${
                          period.type === 'months' && period.value === p.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}>
                  {p.lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Месец</div>
            <input type="month"
                   value={period.type === 'month' ? period.value : ''}
                   onChange={e => setPeriod({ type: 'month', value: e.target.value })}
                   className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">От</div>
            <input type="date"
                   value={period.type === 'custom' ? period.value.from : ''}
                   onChange={e => setPeriod({ type: 'custom', value: { from: e.target.value, to: period.type === 'custom' ? period.value.to : new Date().toISOString().slice(0,10) }})}
                   className="border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">До</div>
            <input type="date"
                   value={period.type === 'custom' ? period.value.to : ''}
                   onChange={e => setPeriod({ type: 'custom', value: { from: period.type === 'custom' ? period.value.from : '2026-01-01', to: e.target.value }})}
                   className="border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </div>
          {summary?.период && (
            <div className="ml-auto text-xs text-gray-500">
              Период: <code className="bg-gray-50 px-1.5 py-0.5 rounded">{summary.период.from} → {summary.период.to}</code>
            </div>
          )}
        </div>
      </div>

      {rebuildResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-sm">
          ✓ Преизчисление готово — създадени {rebuildResult.создадени_доходи} нови доходи от {rebuildResult.Кт_намерени} Кт транзакции;
          синхронизирани {rebuildResult.синхронизирани_разходи} разходни записи.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label={`Доход (${s.период?.label || ''})`} value={s.доход_общо} color="text-emerald-700" suffix={` ${income[0]?.валута||'EUR'}`}/>
        <Kpi label="Лични разходи" value={s.разходи_общо} color="text-rose-700"/>
        <Kpi label="Свободно за инвестиране" value={s.нетен_cashflow} color="text-blue-700"
             extra={<span className="text-xs text-gray-400">savings rate: <b>{sv.rate_pct !== null ? sv.rate_pct + '%' : '—'}</b> (цел {sv.target_pct||30}%)</span>}/>
        <Kpi label="Вече инвестирано" value={s.инвестирано_месец} color="text-indigo-700"
             extra={sv.дисциплина && <span className={`text-xs font-medium ${dispKt}`}>● {sv.дисциплина}</span>}/>
      </div>

      {view === 'analysis' && <ExpenseAnalysis breakdown={breakdown}/>}

      {view === 'overview' && <>
      {/* Income & Expenses breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📈 Доходи по тип</h3>
          {(s.доход_по_тип || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма записани доходи за този месец.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(s.доход_по_тип || []).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 text-gray-700">{INCOME_LABEL[r.тип] || r.тип}</td>
                    <td className="py-2 text-right font-medium text-emerald-700">+{fmt(r.total)} {r.валута}</td>
                    <td className="py-2 text-right text-gray-400 text-xs w-12">×{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">💸 Лични разходи по категория</h3>
          {(s.разходи_по_категория || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма записани лични разходи.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(s.разходи_по_категория || []).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 text-gray-700">{r.expense_category || '—'}</td>
                    <td className="py-2 text-right font-medium text-rose-700">−{fmt(r.total)} {r.currency}</td>
                    <td className="py-2 text-right text-gray-400 text-xs w-12">×{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timeline chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📊 Последните 12 месеца</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
              <XAxis dataKey="месец" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip formatter={v => fmt(v)}/>
              <Legend/>
              <Bar dataKey="доход" fill="#10b981" name="Доход"/>
              <Bar dataKey="разход" fill="#ef4444" name="Разход"/>
              <Bar dataKey="нетно" fill="#3b82f6" name="Нетно"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Income list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📋 Доходи (последен месец от периода)</h3>
        {income.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма доходи. Добави първия или импортирай банка.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <tr>
                <th className="text-left py-2">Дата</th>
                <th className="text-left py-2">Тип</th>
                <th className="text-left py-2">Източник</th>
                <th className="text-right py-2">Сума</th>
                <th className="text-left py-2 pl-3">Бележка</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {income.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-600">{r.дата}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {INCOME_LABEL[r.тип] || r.тип}
                    </span>
                  </td>
                  <td className="py-2 text-gray-700 max-w-[200px] truncate" title={r.източник}>{r.източник}</td>
                  <td className="py-2 text-right font-medium text-emerald-700">+{fmt(r.сума)} {r.валута}</td>
                  <td className="py-2 pl-3 text-gray-500 text-xs max-w-[280px] truncate" title={r.бележка || r.tx_основание}>
                    {r.бележка || r.tx_основание}
                    {r.bank_tx_id && <span className="ml-1 text-blue-500" title="От банков импорт">⚡</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeIncome(r.id)}
                            className="text-gray-300 hover:text-rose-600 text-sm" title="Изтрий">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>}

      {/* Add income modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">+ Добави доход</h3>
            <div className="space-y-3">
              <Field label="Дата">
                <input type="date" value={form.дата} onChange={e => setForm(f => ({ ...f, дата: e.target.value }))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
              <Field label="Тип">
                <select value={form.тип} onChange={e => setForm(f => ({ ...f, тип: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {INCOME_TYPES.map(t => <option key={t} value={t}>{INCOME_LABEL[t]}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field label="Сума">
                    <input type="number" step="0.01" value={form.сума}
                           onChange={e => setForm(f => ({ ...f, сума: e.target.value }))}
                           className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus/>
                  </Field>
                </div>
                <Field label="Валута">
                  <select value={form.валута} onChange={e => setForm(f => ({ ...f, валута: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                    <option>EUR</option>
                    <option>BGN</option>
                  </select>
                </Field>
              </div>
              <Field label="Източник (фирма / банка)">
                <input type="text" value={form.източник} onChange={e => setForm(f => ({ ...f, източник: e.target.value }))}
                       placeholder="Infinita OOD, UniCredit, Bulgar Capital ..."
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
              <Field label="Бележка">
                <input type="text" value={form.бележка} onChange={e => setForm(f => ({ ...f, бележка: e.target.value }))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowAdd(false)}
                      className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
              <button onClick={submitIncome}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">
                Запази
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color = 'text-gray-700', suffix = ' EUR', extra }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-xs font-bold text-gray-500 uppercase mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{fmt0(value)}{suffix}</div>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
      {children}
    </div>
  )
}

function ExpenseAnalysis({ breakdown }) {
  if (!breakdown) return null
  const b = breakdown
  const byCat = (b.по_категория || []).map((r, i) => ({
    name: r.expense_category || 'друго',
    value: Number(r.total) || 0,
    count: r.count,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }))
  const byContractor = (b.по_контрагент || []).slice(0, 20)
  const total = b.общо || 1

  // Trend по месец+категория → pivot за stacked chart
  const monthsSet = new Set(), catSet = new Set()
  for (const r of (b.по_месец || [])) { monthsSet.add(r.месец); catSet.add(r.expense_category || 'друго') }
  const months = [...monthsSet].sort()
  const cats   = [...catSet]
  const trendData = months.map(m => {
    const row = { месец: m }
    for (const c of cats) {
      const found = (b.по_месец || []).find(r => r.месец === m && (r.expense_category || 'друго') === c)
      row[c] = found ? Number(found.total) : 0
    }
    return row
  })

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500">
        Общо разходи за периода: <b className="text-rose-700">{fmt(b.общо)} EUR</b> ·
        {(b.по_категория || []).length} категории ·
        {(b.по_контрагент || []).length} контрагенти
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pie по категория */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">🥧 Разпределение по категория</h3>
          {byCat.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     outerRadius={80} label={d => `${d.name}: ${((d.value/total)*100).toFixed(0)}%`}>
                  {byCat.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip formatter={v => fmt(v)}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Категории таблица със статистики */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📋 Статистики по категория</h3>
          {byCat.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th className="text-left py-2">Категория</th>
                  <th className="text-right py-2">Общо</th>
                  <th className="text-right py-2">×</th>
                  <th className="text-right py-2">Дял</th>
                </tr>
              </thead>
              <tbody>
                {(b.по_категория || []).map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}/>
                      {r.expense_category || '—'}
                    </td>
                    <td className="py-1.5 text-right font-medium text-rose-700">
                      {fmt(r.total)} {r.currency}
                    </td>
                    <td className="py-1.5 text-right text-xs text-gray-400">{r.count}</td>
                    <td className="py-1.5 text-right text-xs text-gray-500">
                      {((Number(r.total)/total)*100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Trend по месец stacked */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📈 Месечен trend по категория</h3>
        {trendData.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
              <XAxis dataKey="месец" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip formatter={v => fmt(v)}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              {cats.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Топ контрагенти */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">🏆 Топ контрагенти (къде харчиш най-много)</h3>
        {byContractor.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <tr>
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Контрагент</th>
                <th className="text-right py-2">Общо</th>
                <th className="text-right py-2">Брой</th>
                <th className="text-right py-2">Средно</th>
                <th className="text-right py-2">Дял</th>
              </tr>
            </thead>
            <tbody>
              {byContractor.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 text-gray-400">{i+1}.</td>
                  <td className="py-1.5 text-gray-700 max-w-[300px] truncate" title={r.supplier_name}>
                    {r.supplier_name}
                  </td>
                  <td className="py-1.5 text-right font-medium text-rose-700">
                    {fmt(r.total)} {r.currency}
                  </td>
                  <td className="py-1.5 text-right text-xs text-gray-500">{r.count}</td>
                  <td className="py-1.5 text-right text-xs text-gray-500">{fmt(r.total / r.count)}</td>
                  <td className="py-1.5 text-right text-xs text-gray-500">
                    {((Number(r.total)/total)*100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Топ 30 най-големи разходи */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">💸 Топ 30 най-големи единични разходи</h3>
        {(b.топ_30 || []).length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-200 sticky top-0 bg-white">
                <tr>
                  <th className="text-left py-2">Дата</th>
                  <th className="text-left py-2">Контрагент</th>
                  <th className="text-left py-2">Категория</th>
                  <th className="text-right py-2">Сума</th>
                  <th className="text-left py-2 pl-3">Бележка</th>
                </tr>
              </thead>
              <tbody>
                {(b.топ_30 || []).map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 text-gray-500 text-xs">{r.дата}</td>
                    <td className="py-1.5 text-gray-700 max-w-[200px] truncate" title={r.supplier_name}>{r.supplier_name}</td>
                    <td className="py-1.5"><span className="px-1.5 py-0.5 rounded text-xs bg-rose-50 text-rose-700 border border-rose-200">{r.expense_category}</span></td>
                    <td className="py-1.5 text-right font-bold text-rose-700">{fmt(r.amount)} {r.currency}</td>
                    <td className="py-1.5 pl-3 text-gray-500 text-xs max-w-[280px] truncate" title={r.reason}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
