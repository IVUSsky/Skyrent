import { apiFetch } from '../api'
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
    text: '8 гаража в комплекс Фонтани са WIP (статус 🔶) — при наемане ще добавят ~650 €/мес. към портфолиото.',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    icon: '✅',
    text: 'DSCR > 1.25 — портфолиото покрива всички кредитни вноски с над 25% буфер. Финансово устойчиво.',
    color: 'bg-green-50 border-green-200 text-green-800',
  },
  {
    icon: '🏗️',
    text: '2 апартамента и 2 паркоместа в Симеоново (❌ строи се) очакват завършване — потенциал за ~1270 €/мес.',
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  {
    icon: '📊',
    text: 'Диверсификация: имоти в София (Иширков, Младост, Фонтани, Стелар, Дружба) и Пазарджик намалява концентрационния риск.',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    icon: '💰',
    text: 'Пазарджик имотите (ап.А, ап.Б, Гараж, Илион) генерират ~1423 €/мес. при по-ниска покупна цена — висока доходност.',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
  },
]

export default function Analysis({ API }) {
  const [properties, setProperties] = useState([])
  const [loans, setLoans] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/properties`).then(r => r.json()),
      apiFetch(`${API}/api/metrics`).then(r => r.json()),
      apiFetch(`${API}/api/loans`).then(r => r.json()).catch(() => []),
      apiFetch(`${API}/api/expenses/summary`).then(r => r.json()).catch(() => null),
    ])
      .then(([p, m, l, es]) => {
        setProperties(p)
        setMetrics(m)
        setLoans(l)
        setExpenseSummary(es)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [API])

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  // Build property → loan share map (вноска и остатък разпределени пропорционално)
  const propLoanMap = {}
  loans.forEach(loan => {
    let imoti = []
    try { imoti = JSON.parse(loan['имоти'] || '[]') } catch {}
    if (!imoti.length) return
    const share = 1 / imoti.length
    imoti.forEach(pid => {
      if (!propLoanMap[pid]) propLoanMap[pid] = { вноска: 0, остатък: 0 }
      propLoanMap[pid].вноска += (loan['вноска'] || 0) * share
      propLoanMap[pid].остатък += (loan['остатък_calc'] || loan['остатък'] || 0) * share
    })
  })

  // Cash on Cash Return per property
  const cocTable = properties
    .filter(p => (p['покупна'] || 0) > 0 && (p['наем'] || 0) > 0)
    .map(p => {
      const totalCost = (p['покупна'] || 0) + (p['ремонт'] || 0)
      const loanShare = propLoanMap[p.id] || { вноска: 0, остатък: 0 }
      const cashInvested = Math.max(1, totalCost - loanShare.остатък)
      const annualRent = (p['наем'] || 0) * 12
      const annualMortgage = loanShare.вноска * 12
      const annualExpenses = annualRent * 0.10
      const annualCashFlow = annualRent - annualMortgage - annualExpenses
      const coc = annualCashFlow / cashInvested
      return { ...p, totalCost, cashInvested, annualRent, annualMortgage, annualCashFlow, coc }
    })
    .sort((a, b) => b.coc - a.coc)

  // Portfolio CoC
  const totalCashInvested = cocTable.filter(p => p['статус'] === '✅').reduce((s, p) => s + p.cashInvested, 0)
  const totalAnnualCashFlow = cocTable.filter(p => p['статус'] === '✅').reduce((s, p) => s + p.annualCashFlow, 0)
  const portfolioCoc = totalCashInvested > 0 ? totalAnnualCashFlow / totalCashInvested : null

  const getCocColor = (coc) => {
    if (coc >= 0.10) return 'text-green-700'
    if (coc >= 0.07) return 'text-green-600'
    if (coc >= 0.05) return 'text-yellow-600'
    if (coc >= 0.03) return 'text-orange-500'
    if (coc >= 0) return 'text-red-500'
    return 'text-red-700'
  }

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
                  <span className="font-medium">{fmt(rent)} € ({totalActiveRent > 0 ? ((rent / totalActiveRent) * 100).toFixed(1) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cash flow breakdown */}
      {expenseSummary && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-700 mb-3">Паричен поток (реален)</h3>
          {(() => {
            const annualRent     = metrics.наем_год || 0
            const realExpenses   = expenseSummary.by_category?.reduce((s, c) => s + (c.paid_amount || 0), 0) || 0
            const monthlyLoans   = loans.reduce((s, l) => s + (l['вноска'] || 0), 0)
            const annualLoans    = monthlyLoans * 12
            const netCashFlow    = annualRent - realExpenses - annualLoans
            const netMonthly     = (annualRent / 12) - (realExpenses / 12) - monthlyLoans
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">Годишен наем</div>
                    <div className="text-xl font-bold text-green-700">+{fmt(annualRent)} €</div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmt(annualRent/12)} €/мес</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">Разходи (фактури)</div>
                    <div className="text-xl font-bold text-red-600">-{fmt(realExpenses)} €</div>
                    <div className="text-xs text-gray-400 mt-0.5">-{fmt(realExpenses/12)} €/мес</div>
                  </div>
                  <div className="bg-white border border-orange-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">Кредитни вноски</div>
                    <div className="text-xl font-bold text-orange-700">-{fmt(annualLoans)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">-{fmt(monthlyLoans)}/мес · {loans.length} кредита</div>
                  </div>
                  <div className={`border rounded-xl p-4 ${netCashFlow >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">Нетен паричен поток</div>
                    <div className={`text-xl font-bold ${netCashFlow >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {netCashFlow >= 0 ? '+' : ''}{fmt(netCashFlow)} €
                    </div>
                    <div className={`text-xs mt-0.5 ${netMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netMonthly >= 0 ? '+' : ''}{fmt(netMonthly)} €/мес
                    </div>
                  </div>
                </div>
                {/* Flow bar */}
                {annualRent > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Структура на разходите (% от приход)</div>
                    <div className="flex h-6 rounded-full overflow-hidden text-xs font-bold">
                      <div className="bg-red-400 flex items-center justify-center text-white transition-all"
                        style={{ width: `${Math.min(100, (realExpenses/annualRent)*100).toFixed(1)}%` }}
                        title={`Разходи ${((realExpenses/annualRent)*100).toFixed(1)}%`}>
                        {(realExpenses/annualRent*100) > 5 ? `${((realExpenses/annualRent)*100).toFixed(0)}%` : ''}
                      </div>
                      <div className="bg-orange-400 flex items-center justify-center text-white transition-all"
                        style={{ width: `${Math.min(100, (annualLoans/annualRent)*100).toFixed(1)}%` }}
                        title={`Вноски ${((annualLoans/annualRent)*100).toFixed(1)}%`}>
                        {(annualLoans/annualRent*100) > 5 ? `${((annualLoans/annualRent)*100).toFixed(0)}%` : ''}
                      </div>
                      <div className={`flex-1 flex items-center justify-center text-white transition-all ${netCashFlow >= 0 ? 'bg-green-500' : 'bg-red-600'}`}>
                        {netCashFlow >= 0 ? `Нет ${((netCashFlow/annualRent)*100).toFixed(0)}%` : 'Дефицит'}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span><span className="inline-block w-3 h-3 rounded bg-red-400 mr-1"></span>Разходи</span>
                      <span><span className="inline-block w-3 h-3 rounded bg-orange-400 mr-1"></span>Вноски</span>
                      <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1"></span>Нет</span>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
          {expenseSummary.by_category?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Разбивка на разходи по категория (фактури)</div>
              <div className="space-y-2">
                {expenseSummary.by_category.sort((a, b) => (b.paid_amount || 0) - (a.paid_amount || 0)).map(cat => {
                  const total = expenseSummary.by_category.reduce((s, c) => s + (c.paid_amount || 0), 0)
                  const pct = total > 0 ? ((cat.paid_amount || 0) / total) * 100 : 0
                  return (
                    <div key={cat.category || 'Друго'}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-gray-700">{cat.category || 'Друго'}</span>
                        <span className="font-medium text-gray-800">{fmt(cat.paid_amount || 0)} € <span className="text-gray-400 text-xs">({cat.paid_count || 0} платени / {cat.count} общо)</span></span>
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
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{p['наем'] ? `${fmt(p['наем'])} €` : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(p.cost)} €</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.annualRent ? `${fmt(p.annualRent)} €` : '—'}</td>
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

      {/* Cash on Cash Return */}
      {cocTable.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-700 mb-1">Cash on Cash Return</h3>
          <p className="text-xs text-gray-400 mb-4">
            (Наем×12 − Вноска×12 − 10% разходи) / Вложен капитал (покупна + ремонт − текущ остатък по кредит)
          </p>

          {/* Portfolio summary */}
          {portfolioCoc != null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Портфолио CoC</div>
                <div className={`text-3xl font-bold ${getCocColor(portfolioCoc)}`}>
                  {(portfolioCoc * 100).toFixed(2)}%
                </div>
                <div className="text-xs text-gray-400 mt-1">само активни имоти (✅)</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Вложен капитал</div>
                <div className="text-2xl font-bold text-gray-800">{fmt(totalCashInvested)} €</div>
                <div className="text-xs text-gray-400 mt-1">покупна + ремонт − остатък кредити</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Годишен Cash Flow</div>
                <div className={`text-2xl font-bold ${totalAnnualCashFlow >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {totalAnnualCashFlow >= 0 ? '+' : ''}{fmt(totalAnnualCashFlow)} €
                </div>
                <div className="text-xs text-gray-400 mt-1">след кредити и ~10% разходи</div>
              </div>
            </div>
          )}

          {/* Per property table */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['#', 'Адрес', 'Наем/мес', 'Вноска/мес', 'Год. Cash Flow', 'Вложен капитал', 'CoC %'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cocTable.map((p, idx) => (
                    <tr key={p.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 ${p['статус'] !== '✅' ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 text-gray-400 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                        {p['адрес']}
                        {p['статус'] !== '✅' && <span className="ml-1 text-xs text-gray-400">({p['статус']})</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmt(p['наем'])} €</td>
                      <td className="px-3 py-2 text-right text-orange-600">
                        {p.annualMortgage > 0 ? `${fmt(p.annualMortgage / 12)} €` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${p.annualCashFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {p.annualCashFlow >= 0 ? '+' : ''}{fmt(p.annualCashFlow)} €
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(p.cashInvested)} €</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold text-base ${getCocColor(p.coc)}`}>
                          {(p.coc * 100).toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * Имоти без покупна цена или наем са изключени. Разходите са апроксимирани на 10% от наема — за точен резултат въведи реалните разходи.
          </p>
        </div>
      )}

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
