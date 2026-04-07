import React, { useState, useEffect } from 'react'

const fmt = (n, d = 0) => n != null && !isNaN(n)
  ? Number(n).toLocaleString('bg-BG', { minimumFractionDigits: d, maximumFractionDigits: d })
  : '—'

function GaugeMeter({ value, label, low, high, invert = false, unit = '' }) {
  // invert: for LTV, lower is better
  const pct = Math.min(100, Math.max(0, value * 100))
  let color, status
  if (!invert) {
    color = value >= high ? 'bg-green-500' : value >= low ? 'bg-yellow-400' : 'bg-red-500'
    status = value >= high ? 'Отличен' : value >= low ? 'Приемлив' : 'Риск!'
  } else {
    color = value <= low ? 'bg-green-500' : value <= high ? 'bg-yellow-400' : 'bg-red-500'
    status = value <= low ? 'Нисък риск' : value <= high ? 'Умерен' : 'Висок риск!'
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-semibold text-gray-600">{label}</span>
        <span className="text-xl font-bold text-gray-800">{(value * 100).toFixed(1)}{unit}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3 mb-1">
        <div className={`h-3 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-xs font-medium mt-1 ${
        color === 'bg-green-500' ? 'text-green-700' :
        color === 'bg-yellow-400' ? 'text-yellow-700' : 'text-red-700'
      }`}>{status}</div>
    </div>
  )
}

const INSIGHTS = [
  {
    icon: '🔶',
    text: '8 гаража в комплекс Фонтани са WIP (статус 🔶) — при наемане ще добавят ~650 лв./мес. към портфолиото.',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    icon: '✅',
    text: 'DSCR > 1.25 — портфолиото покрива всички кредитни вноски с над 25% буфер. Финансово устойчиво.',
    color: 'bg-green-50 border-green-200 text-green-800',
  },
  {
    icon: '🏗️',
    text: '2 апартамента и 2 паркоместа в Симеоново (❌ строи се) очакват завършване — потенциал за ~1270 лв./мес.',
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  {
    icon: '📊',
    text: 'Диверсификация: имоти в София (Иширков, Младост, Фонтани, Стелар, Дружба) и Пазарджик намалява концентрационния риск.',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    icon: '💰',
    text: 'Пазарджик имотите (ап.А, ап.Б, Гараж, Илион) генерират ~1423 лв./мес. при по-ниска покупна цена — висока доходност.',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
  },
]

export default function Analysis({ API }) {
  const [properties, setProperties] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/properties`).then(r => r.json()),
      fetch(`${API}/api/metrics`).then(r => r.json()),
      fetch(`${API}/api/expenses/summary`).then(r => r.json()).catch(() => null),
    ])
      .then(([p, m, es]) => {
        setProperties(p)
        setMetrics(m)
        setExpenseSummary(es)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  // League table: gross yield
  const leagueTable = properties
    .map(p => {
      const cost = p.market_val && p.market_val > 0
        ? p.market_val
        : (p['покупна'] || 0) + (p['ремонт'] || 0)
      const annualRent = (p['наем'] || 0) * 12
      const yield_ = cost > 0 ? annualRent / cost : null
      return { ...p, cost, annualRent, yield_ }
    })
    .filter(p => p.cost > 0)
    .sort((a, b) => (b.yield_ || 0) - (a.yield_ || 0))

  // Concentration risk: top 3 tenants by rent
  const tenantRents = {}
  properties.filter(p => p['статус'] === '✅' && p['наем'] > 0).forEach(p => {
    const t = p['наемател'] || 'Неизвестен'
    tenantRents[t] = (tenantRents[t] || 0) + (p['наем'] || 0)
  })
  const totalActiveRent = Object.values(tenantRents).reduce((s, v) => s + v, 0)
  const sortedTenants = Object.entries(tenantRents).sort((a, b) => b[1] - a[1])
  const top3Rent = sortedTenants.slice(0, 3).reduce((s, [, v]) => s + v, 0)
  const top3Pct = totalActiveRent > 0 ? top3Rent / totalActiveRent : 0

  const YIELD_COLORS = [
    'text-green-700', 'text-green-600', 'text-green-500',
    'text-yellow-600', 'text-yellow-500', 'text-orange-500', 'text-red-500'
  ]
  const getYieldColor = (y) => {
    if (!y) return 'text-gray-400'
    if (y >= 0.10) return YIELD_COLORS[0]
    if (y >= 0.08) return YIELD_COLORS[1]
    if (y >= 0.06) return YIELD_COLORS[2]
    if (y >= 0.05) return YIELD_COLORS[3]
    if (y >= 0.04) return YIELD_COLORS[4]
    if (y >= 0.03) return YIELD_COLORS[5]
    return YIELD_COLORS[6]
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Анализ на портфолио</h2>

      {/* Risk Indicators */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-700 mb-3">Показатели за риск</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.DSCR != null && (
            <GaugeMeter
              value={metrics.DSCR}
              label="DSCR (обслужване на дълга)"
              low={1.0}
              high={1.25}
              unit="x"
            />
          )}
          {metrics.LTV != null && (
            <GaugeMeter
              value={metrics.LTV}
              label="LTV (кредит / активи)"
              low={0.50}
              high={0.65}
              invert={true}
              unit="%"
            />
          )}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-600 mb-2">Концентрационен риск (Топ 3 наематели)</div>
            <div className="text-xl font-bold text-gray-800 mb-2">{(top3Pct * 100).toFixed(1)}% от наема</div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
              <div
                className={`h-3 rounded-full ${top3Pct <= 0.3 ? 'bg-green-500' : top3Pct <= 0.5 ? 'bg-yellow-400' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, top3Pct * 100)}%` }}
              />
            </div>
            <div className="space-y-1">
              {sortedTenants.slice(0, 3).map(([tenant, rent]) => (
                <div key={tenant} className="flex justify-between text-xs text-gray-600">
                  <span className="truncate max-w-[140px]">{tenant}</span>
                  <span className="font-medium">{fmt(rent)} лв. ({totalActiveRent > 0 ? ((rent / totalActiveRent) * 100).toFixed(1) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Real NOI from expense invoices */}
      {expenseSummary && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-700 mb-3">Реален NOI (от фактури)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-500 mb-1">Годишен наем</div>
              <div className="text-2xl font-bold text-blue-700">{fmt(metrics.наем_год)} лв.</div>
              <div className="text-xs text-gray-400 mt-0.5">само активни имоти × 12</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-500 mb-1">Реални разходи (платени)</div>
              <div className="text-2xl font-bold text-red-600">
                {fmt(expenseSummary.by_category?.reduce((s, c) => s + (c.paid_amount || 0), 0) || 0)} лв.
              </div>
              <div className="text-xs text-gray-400 mt-0.5">от expense_invoices (paid=1)</div>
            </div>
            <div className="bg-white border border-blue-200 rounded-xl p-4 bg-blue-50">
              <div className="text-sm font-semibold text-gray-500 mb-1">Реален NOI</div>
              {(() => {
                const realExpenses = expenseSummary.by_category?.reduce((s, c) => s + (c.paid_amount || 0), 0) || 0
                const realNOI = (metrics.наем_год || 0) - realExpenses
                const approxNOI = metrics.NOI || 0
                const diff = realNOI - approxNOI
                return (
                  <>
                    <div className="text-2xl font-bold text-blue-700">{fmt(realNOI)} лв.</div>
                    <div className={`text-xs mt-0.5 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)} спрямо 90% апрокс. ({fmt(approxNOI)} лв.)
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
          {expenseSummary.by_category?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Разбивка по категория</div>
              <div className="space-y-2">
                {expenseSummary.by_category.sort((a, b) => (b.paid_amount || 0) - (a.paid_amount || 0)).map(cat => {
                  const total = expenseSummary.by_category.reduce((s, c) => s + (c.paid_amount || 0), 0)
                  const pct = total > 0 ? ((cat.paid_amount || 0) / total) * 100 : 0
                  return (
                    <div key={cat.category || 'Друго'}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-gray-700">{cat.category || 'Друго'}</span>
                        <span className="font-medium text-gray-800">{fmt(cat.paid_amount || 0)} лв. <span className="text-gray-400 text-xs">({cat.paid_count || 0} платени / {cat.count} общо)</span></span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* League Table */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-700 mb-3">Класация по брутна доходност</h3>
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['#', 'Адрес', 'Тип', 'Наем/мес', 'Стойност', 'Год. наем', 'Брутна дох.'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leagueTable.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                    <td className="px-3 py-2 text-gray-400 text-xs font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{p['адрес']}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{p['тип']}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{p['наем'] ? `${fmt(p['наем'])} лв.` : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(p.cost)} лв.</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.annualRent ? `${fmt(p.annualRent)} лв.` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {p.yield_ != null ? (
                        <span className={`font-bold text-base ${getYieldColor(p.yield_)}`}>
                          {(p.yield_ * 100).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h3 className="text-lg font-bold text-gray-700 mb-3">Препоръки и наблюдения</h3>
        <div className="space-y-3">
          {INSIGHTS.map((ins, i) => (
            <div key={i} className={`border rounded-xl px-4 py-3 flex gap-3 items-start ${ins.color}`}>
              <span className="text-xl flex-shrink-0">{ins.icon}</span>
              <p className="text-sm leading-relaxed">{ins.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
