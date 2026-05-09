import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const fmt = (n, decimals = 0) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('bg-BG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const fmtPct = (n) => n != null && !isNaN(n) ? `${(n * 100).toFixed(1)}%` : '—'

function KpiCard({ label, value, sub, color, icon }) {
  const colorMap = {
    blue:   'border-[#b2dce8] bg-[#e3f4f9]',
    green:  'border-green-200 bg-green-50',
    red:    'border-red-200 bg-red-50',
    yellow: 'border-amber-200 bg-amber-50',
    purple: 'border-[#b2dce8] bg-[#d6eef5]',
    gray:   'border-gray-200 bg-gray-50',
    orange: 'border-orange-200 bg-orange-50',
  }
  const textMap = {
    blue:   'text-[#0e3d52]',
    green:  'text-green-700',
    red:    'text-red-700',
    yellow: 'text-amber-700',
    purple: 'text-[#1a5f7a]',
    gray:   'text-gray-700',
    orange: 'text-orange-700',
  }
  return (
    <div className={`border rounded-xl p-4 ${colorMap[color] || colorMap.gray}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
          <div className={`text-2xl font-bold mt-1 ${textMap[color] || textMap.gray}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        </div>
        {icon && <span className="text-2xl opacity-70">{icon}</span>}
      </div>
    </div>
  )
}

const CHART_COLORS = ['#4AABCC','#1a1a2e','#2d8aab','#7ec8de','#1a5f7a','#a3dae8','#0e3d52','#5bbdd4','#c2ebf4','#2c7a97']

const LEGEND = [
  { term: 'P&L',      full: 'Profit & Loss',              bg: 'Приходи и разходи — финансово резюме за избран период' },
  { term: 'NOI',      full: 'Net Operating Income',        bg: 'Нетен оперативен доход = годишен наем × 90% (vacancy rate)' },
  { term: 'DSCR',     full: 'Debt Service Coverage Ratio', bg: 'Коефициент на покритие на дълга = NOI / годишни вноски. Над 1.25 = устойчив, 1.0–1.25 = приемлив, под 1.0 = риск' },
  { term: 'LTV',      full: 'Loan to Value',               bg: 'Отношение дълг/стойност на активите. Под 50% = нисък риск, 50–65% = умерен, над 65% = висок' },
  { term: 'Cap Rate', full: 'Capitalization Rate',         bg: 'Доходност на имотите = NOI / стойност на активите. Показва колко % годишна доходност генерира портфолиото' },
  { term: 'CF',       full: 'Cash Flow',                   bg: 'Паричен поток = приход от наеми − ипотечни вноски − разходи' },
  { term: 'Нетен CF', full: 'Net Cash Flow',               bg: 'Реален месечен паричен поток след всички плащания' },
  { term: 'Equity',   full: 'Собствен капитал',            bg: 'Стойност на активите минус общия дълг по кредитите' },
  { term: 'YTD',      full: 'Year to Date',                bg: 'От началото на годината до днес' },
  { term: 'Брутна печалба', full: 'Gross Profit',         bg: 'Приход от наеми минус оперативните разходи (ток, вода, такси и др.)' },
  { term: 'Нетна печалба',  full: 'Net Profit',           bg: 'Брутна печалба минус ипотека, ремонти и инвестиции (според избраните toggles)' },
  { term: 'Корп. данък',    full: 'Корпоративен данък',   bg: '10% върху положителната нетна печалба (ставката в България)' },
  { term: 'Ремонт Д', full: 'Ремонт Друго',               bg: 'Разходи за ремонт извън наемния бизнес (лични имоти или друго дружество) — включва се по избор' },
  { term: 'Вноска',   full: 'Ипотечна вноска',            bg: 'Месечна вноска по кредити/ипотеки към банките' },
  { term: 'НАП+ДДС',  full: 'НАП и ДДС плащания',        bg: 'Плащания към НАП — корпоративен данък, осигуровки, ДДС' },
]

function LegendModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-900 text-lg">📖 Легенда — съкращения и термини</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {LEGEND.map(({ term, full, bg }) => (
            <div key={term} className="px-6 py-3">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-bold text-blue-700 text-sm min-w-[90px]">{term}</span>
                <span className="text-xs text-gray-400 italic">{full}</span>
              </div>
              <div className="text-sm text-gray-600">{bg}</div>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t text-right">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Затвори</button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ API }) {
  const [metrics, setMetrics] = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [monthly, setMonthly] = useState([])
  const [properties, setProperties] = useState([])
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [plMonth, setPlMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [plExpenses, setPlExpenses] = useState(null)
  const [showOpEx, setShowOpEx] = useState(true)
  const [showMortgage, setShowMortgage] = useState(true)
  const [showRenov, setShowRenov] = useState(true)
  const [showRenovD, setShowRenovD] = useState(false)
  const [showInvest, setShowInvest] = useState(false)

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/metrics`).then(r => r.json()),
      apiFetch(`${API}/api/import/monthly`).then(r => r.json()),
      apiFetch(`${API}/api/properties`).then(r => r.json()),
      apiFetch(`${API}/api/expenses/summary`).then(r => r.json()).catch(() => null),
    ])
      .then(([m, mo, pr, es]) => {
        setMetrics(m)
        setMonthly(mo)
        setProperties(pr)
        setExpenseSummary(es)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!API) return
    const q = plMonth ? `?month=${plMonth}` : ''
    apiFetch(`${API}/api/expenses/summary${q}`)
      .then(r => r.json())
      .then(setPlExpenses)
      .catch(() => setPlExpenses(null))
  }, [API, plMonth])

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  const dscrColor = metrics.DSCR >= 1.25 ? 'green' : metrics.DSCR >= 1.0 ? 'yellow' : 'red'
  const ltvColor = metrics.LTV < 0.5 ? 'green' : metrics.LTV < 0.65 ? 'yellow' : 'red'

  // Bank expenses (current year total from monthly data)
  const curYear = new Date().getFullYear().toString()
  const curMonth = `${curYear}-${String(new Date().getMonth()+1).padStart(2,'0')}`

  // ── P&L calculations ──────────────────────────────────────
  const plRow = monthly.find(m => m.месец === plMonth)
  const plRetained = plRow?.задържан_депозит_total ?? 0
  const plIncome   = (plRow?.наем_total ?? metrics.наем_мес ?? 0) + plRetained
  const plMortgage = plRow?.вноска_total ?? metrics.total_вноска ?? 0
  const toEur = (eur, bgn) => (eur || 0) + (bgn || 0) / 1.95583
  const plOpEx   = plExpenses ? toEur(plExpenses.total_eur, plExpenses.total_bgn) : 0
  const plRenov  = plExpenses?.renov  ? toEur(plExpenses.renov.total_eur,  plExpenses.renov.total_bgn)  : 0
  const plRenovD = plExpenses?.renovD ? toEur(plExpenses.renovD.total_eur, plExpenses.renovD.total_bgn) : 0
  const plInvest = plExpenses?.invest ? toEur(plExpenses.invest.total_eur, plExpenses.invest.total_bgn) : 0

  const grossProfit = plIncome - (showOpEx ? plOpEx : 0)
  const netProfit   = grossProfit
    - (showMortgage ? plMortgage : 0)
    - (showRenov    ? plRenov    : 0)
    - (showRenovD   ? plRenovD   : 0)
    - (showInvest   ? plInvest   : 0)
  const tax      = Math.max(0, netProfit) * 0.10
  const afterTax = netProfit - tax
  const annualNet = netProfit * 12
  const annualTax = Math.max(0, annualNet) * 0.10
  const bankExpensesYTD = monthly.filter(m => m.месец?.startsWith(curYear)).reduce((s,m) => s + Math.abs(m.разход_total||0), 0)
  const bankExpensesCurMonth = Math.abs(monthly.find(m => m.месец === curMonth)?.разход_total || 0)

  // Cash invoices (manual, в брой) — from expenseSummary (only cash payment types remain after cleanup)
  const cashTotal = (expenseSummary?.total_eur || 0) + (expenseSummary?.total_bgn || 0) / 1.95583

  // Investments
  const investTotal = ((expenseSummary?.invest?.total_eur || 0)) + (expenseSummary?.invest?.total_bgn || 0) / 1.95583

  // Real CF: наем - вноска - bank expenses current month - cash expenses
  const realNetCf = (metrics.наем_мес || 0) - (metrics.total_вноска || 0) - bankExpensesCurMonth
  const cfColor = realNetCf >= 0 ? 'green' : 'red'

  // Group properties by район for chart
  const byRayon = {}
  properties.filter(p => p['статус'] === '✅').forEach(p => {
    const r = p['район'] || 'Други'
    byRayon[r] = (byRayon[r] || 0) + (p['наем'] || 0)
  })
  const rayonData = Object.entries(byRayon)
    .map(([name, rent]) => ({ name, rent }))
    .sort((a, b) => b.rent - a.rent)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>Dashboard</h2>
        <button onClick={() => setShowLegend(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors bg-white">
          <span className="font-bold text-base leading-none">?</span> Легенда
        </button>
      </div>
      {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Месечен наем"
          value={`${fmt(metrics.наем_мес)} €`}
          sub="активни имоти"
          color="blue"
          icon="💰"
        />
        <KpiCard
          label="Годишен наем"
          value={`${fmt(metrics.наем_год)} €`}
          sub={`NOI: ${fmt(metrics.NOI)} €`}
          color="blue"
          icon="📅"
        />
        <KpiCard
          label="Брой имоти"
          value={`${metrics.active_properties} / ${metrics.total_properties}`}
          sub="активни / общо"
          color="purple"
          icon="🏠"
        />
        <KpiCard
          label="Общ дълг"
          value={`${fmt(metrics.total_debt)} €`}
          sub="по всички кредити"
          color="red"
          icon="🏦"
        />
        <KpiCard
          label="Месечна вноска"
          value={`${fmt(metrics.total_вноска)} €`}
          sub="всички банки"
          color="orange"
          icon="📤"
        />
        <KpiCard
          label="NOI"
          value={`${fmt(metrics.NOI)} €`}
          sub="наем × 12 × 90%"
          color="green"
          icon="📊"
        />
        <KpiCard
          label="DSCR"
          value={metrics.DSCR != null ? metrics.DSCR.toFixed(2) : '—'}
          sub={metrics.DSCR >= 1.25 ? 'Устойчив' : metrics.DSCR >= 1.0 ? 'Приемлив' : 'Риск!'}
          color={dscrColor}
          icon="⚖️"
        />
        <KpiCard
          label="LTV"
          value={fmtPct(metrics.LTV)}
          sub={metrics.LTV < 0.5 ? 'Нисък риск' : metrics.LTV < 0.65 ? 'Умерен' : 'Висок!'}
          color={ltvColor}
          icon="📉"
        />
        <KpiCard
          label="Капитал"
          value={`${fmt(metrics.equity)} €`}
          sub="активи − дълг"
          color="green"
          icon="💎"
        />
        <KpiCard
          label="Cap Rate"
          value={fmtPct(metrics.cap_rate)}
          sub="NOI / asset base"
          color="blue"
          icon="📈"
        />
        <KpiCard
          label="Нетен CF"
          value={`${realNetCf >= 0 ? '+' : ''}${fmt(realNetCf)} €`}
          sub={`наем − вноска − ${fmt(bankExpensesCurMonth)} банк. разх.`}
          color={cfColor}
          icon="💵"
        />
        <KpiCard
          label="Активи"
          value={`${fmt(metrics.asset_base)} €`}
          sub="пазарна/счетоводна ст-ст"
          color="gray"
          icon="🏗️"
        />
      </div>

      {/* Expenses section */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-8">
          <h3 className="text-base font-bold text-gray-800 mb-4">💸 Разходи</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

            {/* Bank expenses */}
            <div className="border border-red-200 bg-red-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🏦</span>
                <span className="font-bold text-gray-700 text-sm">Банкови разходи</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Текущ месец</span>
                  <span className="font-bold text-red-700 text-lg">{fmt(bankExpensesCurMonth)} €</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">За {curYear}г. (общо)</span>
                  <span className="font-semibold text-red-600">{fmt(bankExpensesYTD)} €</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">от банкови транзакции</div>
              </div>
            </div>

            {/* Cash expenses */}
            <div className="border border-orange-200 bg-orange-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💵</span>
                <span className="font-bold text-gray-700 text-sm">Касови разходи</span>
              </div>
              {expenseSummary && (expenseSummary.total_bgn > 0 || expenseSummary.total_eur > 0) ? (
                <div className="space-y-1.5">
                  {expenseSummary.total_eur > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-gray-500">EUR</span>
                      <span className="font-bold text-orange-700 text-lg">{fmt(expenseSummary.total_eur)} €</span>
                    </div>
                  )}
                  {expenseSummary.total_bgn > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-gray-500">BGN</span>
                      <span className="font-semibold text-orange-600">{fmt(expenseSummary.total_bgn)} лв.</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400">{expenseSummary.count || 0} записа (в брой / касови)</div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">Няма касови разходи</div>
              )}
            </div>

            {/* Investments */}
            <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📈</span>
                <span className="font-bold text-gray-700 text-sm">Инвестиции</span>
              </div>
              {expenseSummary?.invest && (expenseSummary.invest.total_bgn > 0 || expenseSummary.invest.total_eur > 0) ? (
                <div className="space-y-1.5">
                  {expenseSummary.invest.total_eur > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-gray-500">EUR</span>
                      <span className="font-bold text-indigo-700 text-lg">{fmt(expenseSummary.invest.total_eur)} €</span>
                    </div>
                  )}
                  {expenseSummary.invest.total_bgn > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-gray-500">BGN</span>
                      <span className="font-semibold text-indigo-600">{fmt(expenseSummary.invest.total_bgn)} лв.</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400">{expenseSummary.invest.count || 0} инвестиции</div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">Няма записани инвестиции</div>
              )}
            </div>
          </div>

          {/* Net CF summary */}
          <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${realNetCf >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Нетен CF (текущ месец)</div>
              <div className="text-xs text-gray-400">наем − вноска − банк. разходи</div>
            </div>
            <div className={`text-2xl font-bold ${realNetCf >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {realNetCf >= 0 ? '+' : ''}{fmt(realNetCf)} €
            </div>
          </div>
        </div>
      )}

      {/* ── Финансово резюме / P&L ── */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-base font-bold text-gray-800">📊 Финансово резюме</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Месец:</label>
            <input type="month" value={plMonth} onChange={e => setPlMonth(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
            {plMonth && (
              <button onClick={() => setPlMonth('')} className="text-xs text-gray-400 hover:text-gray-600">× изчисти</button>
            )}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-2 flex-wrap mb-5">
          {[
            [showOpEx,    setShowOpEx,    'Оперативни',  'bg-red-100 text-red-700 border-red-200'],
            [showMortgage,setShowMortgage,'Ипотека',     'bg-orange-100 text-orange-700 border-orange-200'],
            [showRenov,   setShowRenov,   'Ремонт',      'bg-amber-100 text-amber-700 border-amber-200'],
            [showRenovD,  setShowRenovD,  'Ремонт Д',    'bg-yellow-100 text-yellow-700 border-yellow-200'],
            [showInvest,  setShowInvest,  'Инвестиции',  'bg-indigo-100 text-indigo-700 border-indigo-200'],
          ].map(([val, setter, label, activeClass]) => (
            <button key={label} onClick={() => setter(v => !v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${val ? activeClass : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
              {val ? '✓' : '○'} {label}
            </button>
          ))}
        </div>

        {/* P&L rows */}
        <div className="space-y-0 text-sm mb-5">
          <div className="flex justify-between items-center py-2.5 border-b border-gray-200">
            <span className="font-semibold text-gray-700">
              Приход от наеми
              {plRetained > 0 && <span className="ml-2 text-xs text-teal-600 font-normal">(вкл. {fmt(plRetained, 2)} € задържани депозити)</span>}
            </span>
            <span className="font-bold text-green-700 text-base">+{fmt(plIncome, 2)} €</span>
          </div>
          {showOpEx && (
            <div className="flex justify-between items-center py-2 text-red-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>
                Оперативни разходи
              </span>
              <span className="font-medium">−{fmt(plOpEx, 2)} €</span>
            </div>
          )}
          <div className={`flex justify-between items-center py-2.5 border-t border-b font-semibold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            <span>Брутна печалба</span>
            <span>{grossProfit >= 0 ? '+' : ''}{fmt(grossProfit, 2)} €</span>
          </div>
          {showMortgage && (
            <div className="flex justify-between items-center py-2 text-orange-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"/>
                Ипотечни вноски
              </span>
              <span className="font-medium">−{fmt(plMortgage, 2)} €</span>
            </div>
          )}
          {showRenov && (
            <div className="flex justify-between items-center py-2 text-amber-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>
                Разходи за ремонт
              </span>
              <span className="font-medium">−{fmt(plRenov, 2)} €</span>
            </div>
          )}
          {showRenovD && (
            <div className="flex justify-between items-center py-2 text-yellow-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/>
                Ремонт Д (извън бизнеса)
              </span>
              <span className="font-medium">−{fmt(plRenovD, 2)} €</span>
            </div>
          )}
          {showInvest && (
            <div className="flex justify-between items-center py-2 text-indigo-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"/>
                Инвестиции
              </span>
              <span className="font-medium">−{fmt(plInvest, 2)} €</span>
            </div>
          )}
          <div className={`flex justify-between items-center py-2.5 border-t font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            <span>Нетна печалба</span>
            <span className="text-lg">{netProfit >= 0 ? '+' : ''}{fmt(netProfit, 2)} €</span>
          </div>
          {netProfit > 0 && (
            <div className="flex justify-between items-center py-2 text-purple-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"/>
                Корпоративен данък (10%)
              </span>
              <span className="font-medium">−{fmt(tax, 2)} €</span>
            </div>
          )}
          {netProfit > 0 && (
            <div className="flex justify-between items-center py-2.5 border-t font-bold text-blue-700">
              <span>След данъци</span>
              <span className="text-lg">+{fmt(afterTax, 2)} €</span>
            </div>
          )}
        </div>

        {/* Annual projection */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Годишна проекция ({plMonth ? `${plMonth} × 12` : 'текущ месец × 12'})</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Нетна печалба</div>
              <div className={`font-bold text-lg ${annualNet >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {annualNet >= 0 ? '+' : ''}{fmt(annualNet)} €
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Корп. данък</div>
              <div className="font-bold text-lg text-purple-700">−{fmt(annualTax)} €</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">След данъци</div>
              <div className={`font-bold text-lg ${(annualNet - annualTax) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {(annualNet - annualTax) >= 0 ? '+' : ''}{fmt(annualNet - annualTax)} €
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Group breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {Object.entries(metrics.by_group || {}).map(([group, data]) => (
          <div key={group} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h4 className="font-bold text-gray-700 mb-3 border-b pb-2">{group}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Брой (активни)</span>
                <span className="font-medium">{data.active_count} / {data.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Месечен наем</span>
                <span className="font-semibold text-blue-700">{fmt(data.monthly_rent)} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Годишен наем</span>
                <span className="font-medium">{fmt(data.annual_rent)} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Стойност активи</span>
                <span className="font-medium">{fmt(data.asset_val)} €</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart - rent by район */}
      <div className="bg-white rounded-xl shadow p-5 border border-gray-100 mb-8">
        <h3 className="text-base font-bold text-gray-800 mb-4">Наем по район (€/мес)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rayonData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [`${fmt(v)} €`, 'Наем']}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="rent" radius={[4, 4, 0, 0]}>
              {rayonData.map((_, idx) => (
                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly cashflow table */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-base font-bold text-gray-800">Месечен кеш флоу (от импорт)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Месец', 'Наем', 'Вноска', 'Разходи', 'НАП+ДДС', 'Equity', 'Нетно'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map((row, i) => (
                  <tr key={row.месец} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 font-medium text-gray-800">{row.месец}</td>
                    <td className="px-4 py-2 text-green-700 font-medium">{fmt(row.наем_total)}</td>
                    <td className="px-4 py-2 text-orange-700">{fmt(row.вноска_total)}</td>
                    <td className="px-4 py-2 text-red-700">{fmt(row.разход_total)}</td>
                    <td className="px-4 py-2 text-purple-700">{fmt(row.нап_ддс_total)}</td>
                    <td className="px-4 py-2 text-blue-700">{fmt(row.equity_total)}</td>
                    <td className={`px-4 py-2 font-bold ${row.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmt(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {monthly.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">📂</div>
          <div>Няма импортирани транзакции. Използвайте таб <strong>Импорт</strong>, за да заредите банков отчет.</div>
        </div>
      )}
    </div>
  )
}
