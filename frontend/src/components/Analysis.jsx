import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'

// INSIGHTS по-долу са хардкоднати за портфейла на Sky Capital (org 1) →
// показват се само за org 1, иначе биха изтекли към чужди организации.
function isOrg1() {
  try { return (Number(JSON.parse(atob(localStorage.getItem('skyrent_token').split('.')[1])).organization_id) || 1) === 1 }
  catch { return true }
}

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

// Механизмът на изчислението, стъпка по стъпка — всяко число на екрана трябва
// да може да се проследи до суровите данни, иначе не му се вярва.
function CalcBreakdown({ c, p }) {
  const e = (n, d = 0) => fmt(n, d)
  const Row = ({ label, value, muted, bold, note }) => (
    <div className={`flex justify-between gap-4 py-1 ${bold ? 'font-bold border-t border-gray-300 mt-1 pt-1.5' : ''}`}>
      <span className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</span>
      <span className={`text-right whitespace-nowrap ${muted ? 'text-gray-500' : 'text-gray-800'}`}>
        {value}{note && <span className="text-xs text-gray-400 ml-1">{note}</span>}
      </span>
    </div>
  )
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-sm">
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase mb-1">1 · Приход</div>
        <Row label="Наем, както го плаща наемателят" value={`${e(c.rent_gross_monthly)} €/мес`} />
        <Row
          label={c.vat_divisor === 1 ? 'Без ДДС (освободен)' : 'Делено на 1.20 (с ДДС)'}
          value={`${e(c.rent_net_monthly)} €/мес`}
          muted
        />
        <Row label="× 12 месеца" value={`${e(c.rent_annual)} €/год`} muted />
        {c.opex_annual_direct > 0 && (
          <Row label="− преки разходи" value={`−${e(c.opex_annual_direct)} €`} muted />
        )}
        {c.opex_weight === 0 ? (
          <Row label="− дял от общите" value="0 €" muted
            note="прилежащ обект — не носи общи разходи" />
        ) : c.opex_annual_allocated > 0 && (
          <Row label="− дял от общите" value={`−${e(c.opex_annual_allocated)} €`} muted
            note="счетоводство, такси и поддръжка, по дял от наема" />
        )}
        {c.opex_annual_direct > 0 && c.opex_annual_allocated > 0 && (
          <Row label="Оперативни разходи" value={`−${e(c.opex_annual)} €`} muted />
        )}
        <Row label="NOI" value={`${e(c.noi_annual)} €/год`} bold />
      </div>

      <div>
        <div className="text-xs font-bold text-gray-500 uppercase mb-1">
          2 · {c.basis_kind === 'market' ? 'База за доходност' : 'Вложен капитал'}
        </div>
        {c.basis_kind === 'market' ? (
          <>
            {c.cost_basis_kind === 'market' ? (
              <Row label="Вложен капитал" value="0 €" muted note="наследен" />
            ) : (
              <>
                <Row label="Пълна цена" value={`${e(c.покупна)} €`} muted />
                <Row label="+ ремонт" value={`${e(c.ремонт)} €`} muted />
                <Row label="− дял от кредита" value={`−${e(c.allocated_debt)} €`} muted />
                <Row label="Собствен капитал" value={`${e(c.equity_invested)} €`} muted />
              </>
            )}
            <Row label="Пазарна стойност" value={`${e(c.asset_val)} €`} />
            <Row label="База за доходност" value={`${e(c.yield_basis)} €`} bold />
            <p className="text-xs text-gray-400 mt-1.5 leading-snug">
              {c.equity_negative
                ? 'Дългът надхвърля цената — в имота няма собствен капитал, затова се мери срещу пазарната стойност. Обикновено значи, че носи дял от кредит, обезпечен и с други имоти.'
                : 'Няма вложени пари, затова се мери срещу пазарната стойност — колко струва да го държиш, вместо да го продадеш и вложиш парите другаде.'}
            </p>
          </>
        ) : c.cost_basis_kind === 'equity' ? (
          <>
            <Row label="Собствено участие" value={`${e(c.покупна)} €`} />
            <Row label="+ ремонт" value={`${e(c.ремонт)} €`} />
            <Row label="Вложени средства" value={`${e(c.equity_invested)} €`} bold />
            {c.allocated_debt > 0 && (
              <Row label="Дял от кредита (справка)" value={`${e(c.allocated_debt)} €`} muted />
            )}
            <p className="text-xs text-gray-400 mt-1.5 leading-snug">
              Заведената сума е собственото участие — капаро, ремонт, брокер и
              такси. Дългът не се вади, защото вече не е вътре.
            </p>
          </>
        ) : (
          <>
            {c.cost_vat_recovered ? (
              <>
                <Row label="Покупна цена с ДДС" value={`${e(c.покупна_raw)} €`} muted />
                <Row label="− възстановено ДДС" value={`−${e(c.покупна_raw - c.покупна)} €`} muted />
                <Row label="Покупна цена нето" value={`${e(c.покупна)} €`} />
              </>
            ) : (
              <Row label="Покупна цена" value={`${e(c.покупна)} €`} />
            )}
            {c.reno_vat_recovered ? (
              <Row label="+ ремонт нето" value={`${e(c.ремонт)} €`}
                note={`от ${e(c.ремонт_raw)} с ДДС`} />
            ) : (
              <Row label="+ ремонт" value={`${e(c.ремонт)} €`} />
            )}
            {c.acquisition_costs > 0 && (
              <Row label="+ разходи по придобиване" value={`${e(c.acquisition_costs)} €`}
                note={c.acquisition_costs_estimated
                  ? 'МДТ, нотариус, вписване, брокер — изчислени по процент'
                  : 'МДТ, нотариус, вписване, брокер'} />
            )}
            <Row label="Цена на придобиване" value={`${e(c.cost_recorded)} €`} muted />
            <Row label="− дял от кредита" value={`−${e(c.allocated_debt)} €`} muted />
            <Row label="Вложени средства" value={`${e(c.equity_invested)} €`} bold />
            <p className="text-xs text-gray-400 mt-1.5 leading-snug">
              Заведената сума е пълната цена, затова поетият дълг се вади — от
              джоба са излезли само останалите пари.
            </p>
          </>
        )}
      </div>

      <div>
        <div className="text-xs font-bold text-gray-500 uppercase mb-1">3 · Възвръщаемост</div>
        <Row label="NOI" value={`${e(c.noi_annual)} €`} muted />
        <Row
          label="− вноска по кредита"
          value={`−${e(c.debt_service_annual)} €`}
          muted
          note={`лихва ${e(c.interest_12m)} + главница ${e(c.principal_12m)}`}
        />
        <Row label="Кеш поток" value={`${e(c.net_cash_flow)} €/год`} bold />
        <Row
          label="Кеш доходност"
          value={p.cash_yield_on_invested != null
            ? `${(p.cash_yield_on_invested * 100).toFixed(2)} %`
            : '—'}
          muted
          note={`${e(c.net_cash_flow)} ÷ ${e(c.equity_invested)}`}
        />
        <div className="mt-2 pt-1.5 border-t border-gray-300">
          <Row label="+ погасена главница" value={`${e(c.principal_12m)} €`} muted />
          <Row label="+ поскъпване" value={`${e(c.appreciation)} €`} muted />
          <Row label="Обща доходност" value={p.total_return != null
            ? `${(p.total_return * 100).toFixed(2)} %`
            : '—'} bold />
        </div>
      </div>
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
  const [pf, setPf] = useState(null)
  const [pfProps, setPfProps] = useState([])
  const [openCalc, setOpenCalc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/properties`).then(r => r.json()),
      apiFetch(`${API}/api/metrics`).then(r => r.json()),
      apiFetch(`${API}/api/loans`).then(r => r.json()).catch(() => []),
      apiFetch(`${API}/api/expenses/summary`).then(r => r.json()).catch(() => null),
      apiFetch(`${API}/api/metrics/portfolio`).then(r => r.json()).catch(() => null),
    ])
      .then(([p, m, l, es, pfm]) => {
        setProperties(p)
        setMetrics(m)
        setLoans(l)
        setExpenseSummary(es)
        setPf(pfm && pfm.portfolio ? pfm.portfolio : null)
        setPfProps(pfm && pfm.by_property ? pfm.by_property : [])
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
      const totalCost = (p['покупна'] || 0) + (p['ремонт'] || 0) + (p['ремонт_фактури'] || 0)
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
        : (p['покупна'] || 0) + (p['ремонт'] || 0) + (p['ремонт_фактури'] || 0)
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
    <div className="fin-surface">
      <header className="iv-mast mb-6">
        <div>
          <div className="iv-mast-eyebrow">Портфолио · разбор</div>
          <h2 className="iv-mast-title">Анализ</h2>
        </div>
      </header>

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

      {/* Възвръщаемост — вложени средства, обща доходност, лихвен стрес-тест.
          Данните идват от /api/metrics/portfolio (нетни наеми, без ДДС). */}
      {pf && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-700 mb-1">Възвръщаемост</h3>
          <p className="text-xs text-gray-500 mb-3">
            Всички суми са <strong>нетни</strong> — наемите на облагаемите имоти са разделени на 1.20.
            {pf.vat_liable_count > 0 && (
              <> Третирани като облагаеми: <strong>{pf.vat_liable_count}</strong> имота
              {pf.vat_exempt_count > 0 && <> · освободени (брой / физическо лице): <strong>{pf.vat_exempt_count}</strong></>}.
              {pf.rent_monthly_gross > 0 && (
                <> Брутно {fmt(pf.rent_monthly_gross)} € → нето {fmt(pf.rent_monthly)} €/мес.</>
              )}</>
            )}
          </p>

          {pf.coverage && pf.coverage.properties < pf.coverage.properties_active && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              ⚠️ Процентите по-долу са само за <strong>{pf.coverage.properties} от {pf.coverage.properties_active}</strong> активни
              имота ({pf.coverage.rent_share != null ? (pf.coverage.rent_share * 100).toFixed(0) : '—'}% от наема).
              Изключени: {pf.missing_cost_basis} без заведена покупна цена
              {pf.negative_equity_count > 0 && <>, {pf.negative_equity_count} с дълг над заведената цена</>}.
              Докато не се попълнят, портфейлната доходност не е меродавна.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-500 mb-1">Вложени средства</div>
              <div className="text-2xl font-bold text-gray-800">{fmt(pf.total_invested)} €</div>
              <div className="text-xs text-gray-500 mt-1">
                цена {fmt(pf.cost_total_all)} € − дял от кредитите
                {pf.invested_pre_construction > 0 && <> · на зелено {fmt(pf.invested_pre_construction)} €</>}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-500 mb-1">Кеш доходност</div>
              <div className="text-2xl font-bold text-gray-800">
                {pf.cash_yield_on_invested != null ? (pf.cash_yield_on_invested * 100).toFixed(2) : '—'}%
              </div>
              <div className="text-xs text-gray-500 mt-1">{fmt(pf.net_cash_flow_annual)} €/год в джоба</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-500 mb-1">Погасена главница</div>
              <div className="text-2xl font-bold text-gray-800">{fmt(pf.principal_paydown_12m)} €</div>
              <div className="text-xs text-gray-500 mt-1">не е разход — маха дълг</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-emerald-700 mb-1">ОБЩА ДОХОДНОСТ</div>
              <div className="text-2xl font-bold text-emerald-800">
                {pf.total_return != null ? (pf.total_return * 100).toFixed(2) : '—'}%
              </div>
              <div className="text-xs text-emerald-700 mt-1">{fmt(pf.total_return_annual)} €/год</div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-sm">
            <div className="font-semibold text-gray-700 mb-2">Как се получава общата доходност</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-700">
              <span>кеш поток <strong>{fmt(pf.net_cash_flow_annual)} €</strong></span>
              <span className="text-gray-400">+</span>
              <span>главница <strong>{fmt(pf.principal_paydown_12m)} €</strong></span>
              <span className="text-gray-400">+</span>
              <span>поскъпване <strong>{fmt(pf.appreciation_annual)} €</strong>
                <span className="text-gray-400"> ({(pf.appreciation_pct * 100).toFixed(1)}%)</span></span>
              <span className="text-gray-400">=</span>
              <span className="font-bold">{fmt(pf.total_return_annual)} €</span>
              <span className="text-gray-400">÷ вложени {fmt(pf.total_invested)} € =</span>
              <span className="font-bold text-emerald-700">
                {pf.total_return != null ? (pf.total_return * 100).toFixed(2) : '—'}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Поскъпването е допускане, не реализирана печалба. Смени го от Настройки → <code>appreciation_pct</code>;
              при 0 остават само кешът и главницата.
            </p>
          </div>

          {/* Лихвен стрес-тест */}
          {pf.rate_stress && pf.rate_stress.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="font-semibold text-gray-700 mb-1">
                Лихвен стрес-тест <span className="text-xs font-normal text-gray-500">
                  (всички кредити са с плаваща лихва · среднопретеглена {pf.weighted_rate}%)
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Всеки кредит е преоценен при по-висока лихва за същия остатъчен срок.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold">Лихва</th>
                      <th className="py-2 pr-4 font-semibold text-right">Обслужване/год</th>
                      <th className="py-2 pr-4 font-semibold text-right">Лихва/год</th>
                      <th className="py-2 pr-4 font-semibold text-right">DSCR</th>
                      <th className="py-2 font-semibold text-right">Кеш поток/год</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pf.rate_stress.map(s => {
                      const bad = s.dscr != null && s.dscr < 1
                      const warn = s.dscr != null && s.dscr >= 1 && s.dscr < 1.25
                      return (
                        <tr key={s.delta_bps} className={`border-b border-gray-100 ${s.delta_bps === 0 ? 'bg-blue-50' : ''}`}>
                          <td className="py-2 pr-4 font-medium">
                            {s.avg_rate}%
                            {s.delta_bps === 0
                              ? <span className="text-xs text-blue-600 ml-1">сега</span>
                              : <span className="text-xs text-gray-400 ml-1">+{s.delta_bps} бп</span>}
                          </td>
                          <td className="py-2 pr-4 text-right">{fmt(s.debt_service_annual)} €</td>
                          <td className="py-2 pr-4 text-right text-gray-500">{fmt(s.interest_annual)} €</td>
                          <td className={`py-2 pr-4 text-right font-bold ${
                            bad ? 'text-red-700' : warn ? 'text-orange-500' : 'text-green-700'
                          }`}>{s.dscr != null ? s.dscr.toFixed(2) : '—'}</td>
                          <td className={`py-2 text-right ${
                            s.net_cash_flow_annual < 0 ? 'text-red-700 font-bold' : ''
                          }`}>{fmt(s.net_cash_flow_annual)} €</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Доходност върху вложеното — по имот */}
          {pfProps.length > 0 && (() => {
            const BLOCKED = {
              no_basis: 'няма нито вложено, нито пазарна оценка',
              pre_construction: 'на зелено — наемът е планов',
              not_active: 'неактивен',
            }
            const ranked = pfProps
              .filter(p => p.cash_yield_on_invested != null)
              .sort((a, b) => b.cash_yield_on_invested - a.cash_yield_on_invested)
            const blocked = pfProps
              .filter(p => p.cash_yield_on_invested == null && (p.invested > 0 || p.rent_monthly > 0))
              .sort((a, b) => (b.invested || 0) - (a.invested || 0))
            const yieldColor = (y) => y >= 0.10 ? 'text-green-700'
              : y >= 0.07 ? 'text-green-600'
              : y >= 0.05 ? 'text-yellow-600'
              : y >= 0.03 ? 'text-orange-500'
              : y >= 0 ? 'text-red-500' : 'text-red-700'

            return (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
                <div className="font-semibold text-gray-700 mb-1">Доходност върху вложеното — по имот</div>
                <p className="text-xs text-gray-500 mb-3">
                  Кеш доходността е нетният поток след вноската, върху базата.
                  Общата добавя погасената главница и поскъпването. Кликни ред, за да видиш сметката.
                  {pf.inherited && pf.inherited.count > 0 && (
                    <> За наследените имоти базата е <strong>пазарната стойност</strong> — вложен капитал няма.</>
                  )}
                </p>
                {pf.inherited && pf.inherited.count > 0 && (
                  <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="font-semibold text-gray-700">
                      Наследени: {pf.inherited.count} имота
                    </span>
                    <span className="text-gray-600">пазарна стойност {fmt(pf.inherited.market_value)} €</span>
                    <span className="text-gray-600">кеш поток {fmt(pf.inherited.net_cash_flow)} €/год</span>
                    <span className="font-semibold text-gray-700">
                      {pf.inherited.market_value > 0
                        ? (pf.inherited.net_cash_flow / pf.inherited.market_value * 100).toFixed(2)
                        : '—'}% върху пазарната
                    </span>
                  </div>
                )}
                {pf.no_equity && pf.no_equity.count > 0 && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-amber-900">
                    <strong>{pf.no_equity.count} имота са с дълг над цената</strong> — носят дял
                    от кредит, обезпечен и с други имоти. Нямат собствен капитал, затова базата им
                    е пазарната стойност ({fmt(pf.no_equity.market_value)} €).
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-3 font-semibold">Имот</th>
                        <th className="py-2 pr-3 font-semibold text-right">База</th>
                        <th className="py-2 pr-3 font-semibold text-right">Наем нето/мес</th>
                        <th className="py-2 pr-3 font-semibold text-right">Кеш поток/год</th>
                        <th className="py-2 pr-3 font-semibold text-right">Кеш дох.</th>
                        <th className="py-2 font-semibold text-right">Обща дох.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map(p => (
                        <React.Fragment key={p.id}>
                          <tr
                            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                            onClick={() => setOpenCalc(openCalc === p.id ? null : p.id)}
                          >
                            <td className="py-2 pr-3">
                              <span className="text-gray-400 text-xs mr-1">
                                {openCalc === p.id ? '▾' : '▸'} #{p.id}
                              </span>
                              {p['адрес']}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {fmt(p.yield_basis)} €
                              {p.basis_kind === 'market' && (
                                <span
                                  className="ml-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 align-middle"
                                  title={p.calc?.equity_negative
                                    ? 'Дългът надхвърля цената — няма собствен капитал в имота'
                                    : 'Няма заведена цена — мери се срещу пазарната стойност'}
                                >
                                  {p.calc?.equity_negative ? 'дълг > цена' : 'пазарна'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right text-gray-600">{fmt(p.rent_monthly)} €</td>
                            <td className={`py-2 pr-3 text-right ${p.net_cash_flow < 0 ? 'text-red-600 font-semibold' : ''}`}>
                              {fmt(p.net_cash_flow)} €
                            </td>
                            <td className={`py-2 pr-3 text-right font-bold ${yieldColor(p.cash_yield_on_invested)}`}>
                              {(p.cash_yield_on_invested * 100).toFixed(2)}%
                              {p.calc?.equity_extracted && (
                                <span
                                  className="ml-1 text-[10px] font-normal text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-0.5 align-middle"
                                  title="Кредитът е изял почти целия вложен капитал. Процентът е върху остатъка и не е сравним с имот, в който парите още стоят."
                                >
                                  изтеглен
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right font-semibold text-emerald-700">
                              {p.total_return != null ? (p.total_return * 100).toFixed(2) + '%' : '—'}
                            </td>
                          </tr>
                          {openCalc === p.id && p.calc && (
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <td colSpan={6} className="py-3 px-4">
                                <CalcBreakdown c={p.calc} p={p} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {blocked.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 pt-3">
                    <div className="text-sm font-semibold text-gray-600 mb-2">
                      Без изчислима доходност — {blocked.length} имота
                    </div>
                    <div className="space-y-1">
                      {blocked.map(p => (
                        <div key={p.id} className="flex justify-between items-baseline text-xs text-gray-600 gap-3">
                          <span className="truncate">
                            <span className="text-gray-400 mr-1">#{p.id}</span>{p['адрес']}
                          </span>
                          <span className="flex-shrink-0 text-gray-400">
                            наем {fmt(p.rent_monthly)} € · {BLOCKED[p.yield_blocked] || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {pf.missing_cost_basis > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        ⚠️ {pf.missing_cost_basis} активни имота нямат заведена покупна цена
                        ({fmt(pf.missing_cost_basis_rent)} € годишен наем). Въведи я в Портфолио,
                        за да влязат в класацията и в общата доходност.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Recommendations — хардкоднати за Sky Capital, само за org 1 */}
      {isOrg1() && (
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
      )}
    </div>
  )
}
