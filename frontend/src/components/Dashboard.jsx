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

export default function Dashboard({ API }) {
  const [metrics, setMetrics] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [properties, setProperties] = useState([])
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/metrics`).then(r => r.json()),
      fetch(`${API}/api/import/monthly`).then(r => r.json()),
      fetch(`${API}/api/properties`).then(r => r.json()),
      fetch(`${API}/api/expenses/summary`).then(r => r.json()).catch(() => null),
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

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  const dscrColor = metrics.DSCR >= 1.25 ? 'green' : metrics.DSCR >= 1.0 ? 'yellow' : 'red'
  const ltvColor = metrics.LTV < 0.5 ? 'green' : metrics.LTV < 0.65 ? 'yellow' : 'red'

  // Real CF includes actual paid expense invoices
  const totalPaidExpenses = expenseSummary?.by_category?.reduce((s, c) => s + (c.paid_amount || 0), 0) || 0
  const realNetCf = (metrics.наем_мес || 0) - (metrics.total_вноска || 0) - totalPaidExpenses
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
      <h2 className="text-2xl font-bold mb-6" style={{ color: '#1a1a2e' }}>Dashboard</h2>

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
          value={`${fmt(realNetCf)} €`}
          sub={totalPaidExpenses > 0 ? `наем − вноска − ${fmt(totalPaidExpenses)} разх.` : 'наем − вноска'}
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
      {expenseSummary && (expenseSummary.by_category?.length > 0) && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-8">
          <h3 className="text-base font-bold text-gray-800 mb-4">💸 Разходи за месеца</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Общо фактури</div>
              <div className="text-xl font-bold text-red-700 mt-1">
                {fmt(expenseSummary.by_category.reduce((s, c) => s + (c.total_amount || 0), 0))} €
              </div>
              <div className="text-xs text-gray-500">{expenseSummary.by_category.reduce((s, c) => s + (c.count || 0), 0)} бр.</div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Платени</div>
              <div className="text-xl font-bold text-green-700 mt-1">
                {fmt(totalPaidExpenses)} €
              </div>
              <div className="text-xs text-gray-500">{expenseSummary.by_category.reduce((s, c) => s + (c.paid_count || 0), 0)} бр.</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Неплатени</div>
              <div className="text-xl font-bold text-yellow-700 mt-1">
                {fmt(expenseSummary.by_category.reduce((s, c) => s + ((c.total_amount || 0) - (c.paid_amount || 0)), 0))} €
              </div>
            </div>
            <div className={`border rounded-lg p-3 ${realNetCf >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Реален Нетен CF</div>
              <div className={`text-xl font-bold mt-1 ${realNetCf >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {fmt(realNetCf)} €
              </div>
              <div className="text-xs text-gray-500">наем − вноска − разходи</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {expenseSummary.by_category.map(cat => (
              <div key={cat.category || 'Друго'} className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500 truncate">{cat.category || 'Друго'}</div>
                <div className="text-sm font-bold text-gray-800">{fmt(cat.total_amount)} €</div>
                <div className="text-xs text-gray-400">{cat.count} бр.</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
