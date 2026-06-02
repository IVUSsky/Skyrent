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
  const [balances, setBalances]   = useState(null)
  const [wealth, setWealth]       = useState(null)
  const [showBaseline, setShowBaseline] = useState(null)
  const [baselineForm, setBaselineForm] = useState({ opening: '', as_of: '' })
  const [showMovements, setShowMovements] = useState(null) // 'in' | 'out' | null
  const [movements, setMovements] = useState(null)
  const [showRemaining, setShowRemaining] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [rebuildResult, setRebuildResult] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [view, setView]         = useState('overview') // 'overview' | 'analysis'
  const [showAccounts, setShowAccounts] = useState(false)
  const [accounts, setAccounts] = useState(null)
  const [markIban, setMarkIban] = useState('')
  const [markScope, setMarkScope] = useState('personal')
  const [marking, setMarking]   = useState(false)
  const [markError, setMarkError] = useState(null)

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
      apiFetch(`${API}/api/personal/accounts/balances`).then(r => r.json()),
      apiFetch(`${API}/api/investments/wealth/summary`).then(r => r.json()).catch(() => null),
    ]).then(([s, i, t, b, bal, w]) => {
      setSummary(s); setIncome(i); setTimeline(t); setBreakdown(b); setBalances(bal); setWealth(w); setLoading(false)
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

  const openAccountsModal = () => {
    apiFetch(`${API}/api/personal/accounts`)
      .then(r => r.json())
      .then(d => { setAccounts(d); setShowAccounts(true) })
  }

  const openMovements = (direction) => {
    setShowMovements(direction)
    setMovements(null)
    const q = periodQuery()
    apiFetch(`${API}/api/personal/movements?direction=${direction}&${q}`)
      .then(r => r.json())
      .then(setMovements)
  }

  const openBaseline = (acc) => {
    setShowBaseline(acc)
    setBaselineForm({
      opening: acc.opening != null ? String(acc.opening) : '',
      as_of:   acc.opening_as_of || new Date().toISOString().slice(0, 10),
    })
  }

  const saveBaseline = () => {
    if (!showBaseline || !baselineForm.opening) return
    apiFetch(`${API}/api/personal/accounts/baseline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        iban: showBaseline.iban,
        opening: Number(baselineForm.opening),
        as_of: baselineForm.as_of,
      }),
    }).then(r => r.json()).then(() => {
      setShowBaseline(null)
      load()
    })
  }

  const markSession = (session_id, scope) => {
    setMarkError(null)
    setMarking(true)
    apiFetch(`${API}/api/personal/accounts/mark-and-rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, scope }),
    })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
        return data
      })
      .then(d => {
        setMarking(false)
        setRebuildResult({
          создадени_доходи: d.personal_income_created,
          Кт_намерени:      d.personal_income_created,
          синхронизирани_разходи: d.tx_updated,
          extra: `Сесия #${d.session_id} → ${d.scope_set}; ${d.tx_updated} tx-те обновени.`,
        })
        // Re-fetch accounts list to update scope counts
        apiFetch(`${API}/api/personal/accounts`).then(r => r.json()).then(setAccounts)
        load()
        setTimeout(() => setRebuildResult(null), 10000)
      })
      .catch(e => { setMarking(false); setMarkError(`Грешка: ${e.message}`) })
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
            <button onClick={openAccountsModal}
                    title="Маркирай сметка като лична или бизнес — ретроактивно за всички вече импортирани tx-те"
                    className="px-3 py-1.5 bg-pink-100 hover:bg-pink-200 text-pink-800 border border-pink-300 rounded text-sm font-medium">
              🏦 Сметки
            </button>
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

      {/* HERO: Нетно богатство */}
      {wealth && (
        <div className="rounded-2xl p-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #4338ca 100%)' }}>
          <div className="text-xs font-bold text-blue-200 uppercase mb-1">💎 Нетно богатство</div>
          <div className="text-4xl font-bold text-white mb-3">{fmt0(wealth.общо)} EUR</div>
          <div className="flex flex-wrap gap-3 text-sm">
            <WealthChip emoji="🏠" label="Имоти" value={wealth.имоти?.equity} color="bg-amber-400/20 text-amber-100"/>
            <WealthChip emoji="💳" label="Банки" value={balances?.общо_personal} color="bg-violet-400/20 text-violet-100"/>
            <WealthChip emoji="🏦" label="T212" value={wealth.t212?.обща_стойност} color="bg-blue-400/20 text-blue-100"/>
            <WealthChip emoji="💼" label="Bulgar" value={wealth.болгар?.текуща_стойност} color="bg-purple-400/20 text-purple-100"/>
            <WealthChip emoji="🥇" label="Злато" value={wealth.злато?.текуща_стойност} color="bg-yellow-400/20 text-yellow-100"/>
            <WealthChip emoji="🥈" label="Сребро" value={wealth.сребро?.текуща_стойност} color="bg-gray-400/20 text-gray-100"/>
          </div>
        </div>
      )}

      {/* 3 главни KPI: Влязох / Излязох / Останах */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button onClick={() => openMovements('in')}
                className="bg-white rounded-xl border-l-4 border-emerald-500 shadow-sm p-4 text-left hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
            <span>⬆️ Влязох ({s.период?.label || ''}) →</span>
            <span className="text-emerald-700">{(s.доход_по_тип || []).length} източника</span>
          </div>
          <div className="text-3xl font-bold text-emerald-700">+{fmt0(s.доход_общо)} EUR</div>
          {(s.доход_по_тип || []).slice(0, 3).map((r, i) => (
            <div key={i} className="text-xs text-gray-500 flex justify-between mt-0.5">
              <span>{INCOME_LABEL[r.тип] || r.тип}</span>
              <span className="font-medium text-emerald-700">{fmt0(r.total)}</span>
            </div>
          ))}
        </button>

        <button onClick={() => openMovements('out')}
                className="bg-white rounded-xl border-l-4 border-rose-500 shadow-sm p-4 text-left hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
            <span>⬇️ Излязох →</span>
            <span className="text-rose-700">лични + капитал</span>
          </div>
          <div className="text-3xl font-bold text-rose-700">−{fmt0(s.разходи_общо + (s.капитал_общо || 0))} EUR</div>
          <div className="text-xs text-gray-500 flex justify-between mt-0.5">
            <span>Лични разходи</span>
            <span className="font-medium text-rose-700">{fmt0(s.разходи_общо)}</span>
          </div>
          <div className="text-xs text-gray-500 flex justify-between mt-0.5">
            <span>Кредити/Капитал/Инв.</span>
            <span className="font-medium text-amber-700">{fmt0(s.капитал_общо || 0)}</span>
          </div>
        </button>

        <button onClick={() => setShowRemaining(true)}
                className="bg-white rounded-xl border-l-4 border-blue-500 shadow-sm p-4 text-left hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
            <span>💰 Останах →</span>
            <span className={sv.rate_pct !== null && sv.rate_pct >= sv.target_pct ? 'text-emerald-700' : 'text-amber-700'}>
              {sv.rate_pct !== null ? sv.rate_pct + '%' : '—'}
            </span>
          </div>
          <div className={`text-3xl font-bold ${(s.реално_свободно || 0) < 0 ? 'text-rose-700' : 'text-blue-700'}`}>
            {(s.реално_свободно || 0) >= 0 ? '+' : ''}{fmt0(s.реално_свободно || 0)} EUR
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Цел savings: <b>{sv.target_pct || 30}%</b> · Инвест. {fmt0(s.инвестирано_месец)} EUR
          </div>
          {sv.дисциплина && (
            <div className={`text-xs font-medium mt-0.5 ${(s.реално_свободно || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ● {sv.дисциплина}
            </div>
          )}
        </button>
      </div>

      {/* Account balances detail */}
      {(balances?.акаунти || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-xs space-y-1">
          <div className="font-bold text-gray-500 uppercase mb-1">Баланс по сметка:</div>
          {(balances.акаунти || []).map(a => (
            <div key={a.iban} className="flex items-center gap-2 flex-wrap">
              <span className={a.scope === 'personal' ? 'text-pink-700' : 'text-slate-700'}>
                {a.scope === 'personal' ? '👤' : '🏢'}
              </span>
              <code className="text-[10px] text-gray-500">{a.iban}</code>
              <b className={(a.balance || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                {a.balance != null ? fmt(a.balance) : '—'} {a.currency}
              </b>
              <span className="text-gray-400">
                @ {a.as_of} · {a.tx_count} tx
                {a.opening_source === 'manual' && ' · ръчно baseline'}
                {a.opening_source === 'pdf_opening' && ` · от opening на ${a.opening_as_of}`}
                {a.opening_source === 'pdf_closing_fallback' && ` · от closing на ${a.opening_as_of}`}
              </span>
              {a.needs_baseline && (
                <span className="text-amber-700 text-[10px]">⚠ няма базова стойност</span>
              )}
              <button onClick={() => openBaseline(a)}
                      className="ml-auto text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded">
                ✎ Корекция
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Baseline modal */}
      {showBaseline && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowBaseline(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-3">✎ Корекция на баланс</h3>
            <p className="text-sm text-gray-600 mb-3">
              Задай реалния баланс по сметката към определена дата. Системата ще
              използва това като опорна точка + ще добави всички tx-те след тази дата.
            </p>
            <div className="bg-gray-50 rounded p-2 text-xs mb-3">
              IBAN: <code>{showBaseline.iban}</code>
            </div>
            <Field label="Реален баланс (от твоето online banking)">
              <input type="number" step="0.01" value={baselineForm.opening}
                     onChange={e => setBaselineForm(f => ({ ...f, opening: e.target.value }))}
                     placeholder="напр. 43496.49"
                     className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus/>
            </Field>
            <Field label="Към края на коя дата">
              <input type="date" value={baselineForm.as_of}
                     onChange={e => setBaselineForm(f => ({ ...f, as_of: e.target.value }))}
                     className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
            </Field>
            <div className="text-xs text-gray-500 mt-2 space-y-1">
              <p><b>Важно:</b> Сумата представлява <b>баланса в края на избраната дата</b>.</p>
              <p>Tx-тeте СЛЕД тази дата ще се добавят/изваждат от баланса.</p>
              <p>Tx-те НА същата дата вече се считат за част от baseline-а — няма да се броят отново.</p>
              <p className="text-blue-700">💡 Пример: ако днес банката показва X EUR, въведи X и изберди <b>днешна дата</b>.</p>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowBaseline(null)}
                      className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
              <button onClick={saveBaseline}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">
                Запази
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Капитал / Кредити / Инвестиции */}
      {(s.капитал_по_категория || []).length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">🏦 Кредитни вноски / Капитал / Инвестиции</h3>
          <p className="text-xs text-gray-500 mb-2">
            Това НЕ са лични разходи — пари които излизат от сметката но отиват в активи (имоти, инвестиции, фирмата).
          </p>
          <table className="w-full text-sm">
            <tbody>
              {(s.капитал_по_категория || []).map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2 text-gray-700">{r.expense_category || '—'}</td>
                  <td className="py-2 text-right font-medium text-amber-700">−{fmt(r.total)} {r.currency}</td>
                  <td className="py-2 text-right text-gray-400 text-xs w-12">×{r.count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300">
              <tr>
                <td className="py-2 font-bold text-gray-800">Общо капитал/кредити</td>
                <td className="py-2 text-right font-bold text-amber-700">−{fmt(s.капитал_общо || 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Trend chart — line за по-лесно проследяване */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📊 Тренд (последните 12 месеца)</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
              <XAxis dataKey="месец" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip formatter={v => fmt(v)}/>
              <Legend/>
              <Line type="monotone" dataKey="доход" stroke="#10b981" strokeWidth={2} name="Доход" dot={{ r: 3 }}/>
              <Line type="monotone" dataKey="разход" stroke="#ef4444" strokeWidth={2} name="Разход" dot={{ r: 3 }}/>
              <Line type="monotone" dataKey="нетно" stroke="#3b82f6" strokeWidth={2.5} name="Спестено (нетно)" dot={{ r: 4 }}/>
            </LineChart>
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

      {/* Remaining modal — детайли при click на Останах */}
      {showRemaining && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowRemaining(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">💰 Останах ({s.период?.label || ''})</h3>
                <p className="text-xs text-gray-500 mt-1">Разбивка на изчислението + препоръка какво да направиш с парите</p>
              </div>
              <button onClick={() => setShowRemaining(false)}
                      className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            {/* Формула visualization */}
            <div className="bg-gradient-to-r from-emerald-50 via-rose-50 to-blue-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-500">⬆️ Влязох</div>
                  <div className="font-bold text-emerald-700 text-lg">+{fmt0(s.доход_общо)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">− Лични</div>
                  <div className="font-bold text-rose-700 text-lg">{fmt0(s.разходи_общо)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">− Капитал/Инв.</div>
                  <div className="font-bold text-amber-700 text-lg">{fmt0(s.капитал_общо || 0)}</div>
                </div>
                <div className="border-l-2 border-blue-300 pl-2">
                  <div className="text-xs text-gray-500">= Останах</div>
                  <div className={`font-bold text-lg ${(s.реално_свободно || 0) < 0 ? 'text-rose-700' : 'text-blue-700'}`}>
                    {fmt0(s.реално_свободно || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Savings rate progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-gray-700">Savings rate</span>
                <span className={sv.rate_pct >= sv.target_pct ? 'text-emerald-700' : 'text-amber-700'}>
                  {sv.rate_pct !== null ? sv.rate_pct + '%' : '—'} от доход
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 relative overflow-hidden">
                <div className={`h-3 rounded-full ${sv.rate_pct >= sv.target_pct ? 'bg-emerald-500' : 'bg-amber-500'}`}
                     style={{ width: `${Math.min(100, Math.max(0, sv.rate_pct || 0))}%` }}/>
                <div className="absolute top-0 h-3 border-r-2 border-gray-800"
                     style={{ left: `${sv.target_pct || 30}%` }} title={`Цел: ${sv.target_pct || 30}%`}/>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Цел: {sv.target_pct || 30}% (черна линия) · {sv.дисциплина || 'без оценка'}
              </div>
            </div>

            {/* Където отиде парите */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="border border-emerald-200 rounded-lg p-3">
                <h4 className="text-sm font-bold text-emerald-800 mb-2">⬆️ Откъде дойдоха</h4>
                {(s.доход_по_тип || []).length === 0 ? (
                  <p className="text-xs text-gray-400">няма доход</p>
                ) : (
                  <div className="space-y-1">
                    {(s.доход_по_тип || []).map((r, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{INCOME_LABEL[r.тип] || r.тип}</span>
                        <span className="font-medium text-emerald-700">+{fmt0(r.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-rose-200 rounded-lg p-3">
                <h4 className="text-sm font-bold text-rose-800 mb-2">⬇️ Къде отидоха</h4>
                {((s.разходи_по_категория || []).length + (s.капитал_по_категория || []).length) === 0 ? (
                  <p className="text-xs text-gray-400">няма разходи</p>
                ) : (
                  <div className="space-y-1">
                    {(s.разходи_по_категория || []).map((r, i) => (
                      <div key={`p${i}`} className="flex justify-between text-sm">
                        <span className="text-gray-700">{r.expense_category}</span>
                        <span className="font-medium text-rose-700">−{fmt0(r.total)}</span>
                      </div>
                    ))}
                    {(s.капитал_по_категория || []).map((r, i) => (
                      <div key={`c${i}`} className="flex justify-between text-sm">
                        <span className="text-gray-700">{r.expense_category} <span className="text-xs text-amber-600">(капитал)</span></span>
                        <span className="font-medium text-amber-700">−{fmt0(r.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Препоръка */}
            <RecommendationBox s={s} sv={sv}/>

            <div className="flex justify-end mt-5">
              <button onClick={() => setShowRemaining(false)}
                      className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Затвори</button>
            </div>
          </div>
        </div>
      )}

      {/* Movements modal — детайли при click на Влязох/Излязох */}
      {showMovements && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowMovements(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-4xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {showMovements === 'in' ? '⬆️ Всички входящи (Кт)' : '⬇️ Всички изходящи (Дт)'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Период: {movements?.период?.from} → {movements?.период?.to}
                  {movements && ` · ${movements.брой} tx · Общо ${fmt(movements.общо)} EUR`}
                </p>
              </div>
              <button onClick={() => setShowMovements(null)}
                      className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            {!movements ? (
              <p className="text-center text-gray-400 py-8">Зарежда...</p>
            ) : movements.брой === 0 ? (
              <p className="text-center text-gray-400 py-8">Няма движения за периода.</p>
            ) : (
              <div className="space-y-4">
                {(movements.групи || []).map(g => (
                  <div key={g.категория} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{g.категория}</span>
                        <span className="text-xs text-gray-500">{g.count} tx</span>
                      </div>
                      <span className={`font-bold ${showMovements === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {showMovements === 'in' ? '+' : '−'}{fmt(g.total)} EUR
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {g.items.map(t => (
                          <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-500 text-xs whitespace-nowrap">{t.дата}</td>
                            <td className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate" title={t.контрагент}>
                              {t.контрагент || '—'}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${showMovements === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {showMovements === 'in' ? '+' : '−'}{fmt(t.сума)} {t.currency}
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 text-xs max-w-[300px] truncate" title={t.основание}>
                              {t.основание}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accounts modal — маркирай сесии като personal/business + ретро */}
      {showAccounts && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAccounts(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-3xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-3">🏦 Маркирай импорт сесия</h3>
            <p className="text-sm text-gray-600 mb-3">
              Всеки импорт от банка = една сесия. Кликни <b>👤 Лична</b> или <b>🏢 Бизнес</b>
              за дадена сесия → ретроактивно update-ва всички транзакции от тази сесия +
              синхронизира expense_invoices/personal_income.
            </p>

            {accounts?.account_scope_map && Object.keys(accounts.account_scope_map).length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Известни IBAN-и</div>
                <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                  {Object.entries(accounts.account_scope_map).map(([iban, scope]) => (
                    <div key={iban} className="flex justify-between">
                      <code className="text-gray-700">{iban}</code>
                      <span className={scope === 'personal' ? 'text-pink-700 font-medium' : 'text-slate-700 font-medium'}>
                        {scope === 'personal' ? '👤 лична' : '🏢 бизнес'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">Импорт сесии (последните 50)</div>
              {!accounts?.sessions?.length ? (
                <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded">Няма сесии.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      <th className="text-left py-1.5">#</th>
                      <th className="text-left py-1.5">Файл</th>
                      <th className="text-left py-1.5">IBAN</th>
                      <th className="text-left py-1.5">Период</th>
                      <th className="text-right py-1.5">Tx</th>
                      <th className="text-center py-1.5">Scope</th>
                      <th className="text-right py-1.5">Маркирай</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.sessions.map(s => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 text-gray-400">{s.id}</td>
                        <td className="py-1.5 truncate max-w-[180px]" title={s.filename}>{s.filename}</td>
                        <td className="py-1.5 font-mono text-[10px]" title={s.account_iban}>
                          {s.account_iban ? s.account_iban.slice(0, 12) + '...' : '—'}
                        </td>
                        <td className="py-1.5 text-gray-500">{s.month_from}…{s.month_to}</td>
                        <td className="py-1.5 text-right">{s.tx_actual || s.tx_count}</td>
                        <td className="py-1.5 text-center">
                          {s.tx_personal > 0 && <span className="text-pink-600">👤{s.tx_personal} </span>}
                          {s.tx_business > 0 && <span className="text-slate-600">🏢{s.tx_business}</span>}
                        </td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => markSession(s.id, 'personal')} disabled={marking}
                                  className="px-2 py-1 bg-pink-100 hover:bg-pink-200 text-pink-800 rounded text-xs font-medium mr-1 disabled:opacity-50">
                            👤 Лична
                          </button>
                          <button onClick={() => markSession(s.id, 'business')} disabled={marking}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-medium disabled:opacity-50">
                            🏢 Бизнес
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {markError && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mb-3">
                {markError}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setShowAccounts(false)}
                      className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Затвори</button>
            </div>
          </div>
        </div>
      )}

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

function RecommendationBox({ s, sv }) {
  const free = s.реално_свободно || 0
  const targetSavings = (s.доход_общо || 0) * (sv.target_pct || 30) / 100
  const overSavings = free - targetSavings
  const invested = s.инвестирано_месец || 0
  if (free <= 0) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm">
        ⚠️ <b>Внимание:</b> Изхарчил си повече отколкото си спечелил тоя период. Прегледай големите разходи или увеличи дохода.
      </div>
    )
  }
  if (sv.rate_pct >= sv.target_pct) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm space-y-1">
        <div>🎯 <b>Над цел!</b> Savings rate {sv.rate_pct}% &gt; цел {sv.target_pct}%.</div>
        {overSavings > 0 && (
          <div>💡 От {fmt0(free)} EUR останали, можеш да заделиш {fmt0(overSavings)} EUR в инвестиции (вече инвестира {fmt0(invested)} EUR тоя период).</div>
        )}
        <div className="text-xs text-gray-500 pt-1">Идеи: Bulgar Capital, Trading 212, злато/сребро, допълнителна вноска по кредитите.</div>
      </div>
    )
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
      ⚠️ <b>Под цел.</b> Savings rate {sv.rate_pct}% &lt; цел {sv.target_pct}%. За да стигнеш целта, трябваше да харчиш с {fmt0(targetSavings - free)} EUR по-малко или да заделиш още.
    </div>
  )
}

function WealthChip({ emoji, label, value, color }) {
  if (!value && value !== 0) return null
  return (
    <div className={`px-3 py-1.5 rounded-lg ${color} backdrop-blur-sm`}>
      <div className="text-[10px] opacity-80">{emoji} {label}</div>
      <div className="font-bold">{fmt0(value)}</div>
    </div>
  )
}

function Kpi({ label, value, color = 'text-gray-700', suffix = ' EUR', extra, title }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" title={title}>
      <div className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
        {label}
        {title && <span className="text-gray-400 cursor-help" title={title}>ⓘ</span>}
      </div>
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
