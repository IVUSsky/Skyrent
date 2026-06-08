import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts'
import { apiFetch } from '../api'

const fmt = (n, d = 0) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('bg-BG', { minimumFractionDigits: d, maximumFractionDigits: d })
}
const fmtEur = (n) => n == null || isNaN(n) ? '—' : `€${fmt(n)}`
const fmtPct = (n, d = 1) => n == null || isNaN(n) ? '—' : `${(n * 100).toFixed(d)}%`

const STAGE_LABELS = {
  active: 'Активен',
  listing: 'Обявен',
  furnishing: 'Обзавежда се',
  renovating: 'В ремонт',
  pre_construction: 'Pre-construction',
  reserved: 'Запазен',
  for_sale: 'За продажба',
  inactive: 'Неактивен',
}

const STAGE_COLORS = {
  active: '#22c55e',
  listing: '#3b82f6',
  furnishing: '#f59e0b',
  renovating: '#a855f7',
  pre_construction: '#06b6d4',
  reserved: '#94a3b8',
  for_sale: '#ec4899',
  inactive: '#94a3b8',
}

const BANK_COLORS = { 'Пощенска': '#22c55e', 'УниКредит': '#f59e0b', 'Прокредит': '#ef4444' }

// Речник на метриките — hover за дефиниция
const METRIC_HINTS = {
  'Asset base':         'Сума на market_val на всички имоти. Текущата пазарна стойност на портфолиото.',
  'Asset':              'Market value на имота (или покупна+ремонт ако market_val липсва).',
  'Total debt':         'Сума на актуалните остатъци по всички ипотеки в EUR.',
  'Real equity':        'Equity − Off-plan obligations. Реален капитал след бъдещи плащания.',
  'Equity':             'Asset base − Total debt. Какво "ти остава" ако веднага продадеш всичко и платиш дълга.',
  'Real LTV':           'Real Loan-to-Value = (debt + off-plan obligations) / asset_base. Включва бъдещи задължения.',
  'LTV':                'Loan-to-Value = дълг / стойност на актива. Под 50% = нисък риск, 50-65% умерен, над 65% висок.',
  'Rent годишен':       'Сума на договорените месечни наеми × 12. Теоретичен годишен приход (без opex и vacancy).',
  'Rent contracted':    'Договорен годишен наем.',
  'NOI':                'Net Operating Income = годишен наем − оперативни разходи. НЕ включва ипотечни вноски. Standard real-estate метрика.',
  'NOI годишен':        'Net Operating Income = годишен наем − оперативни разходи. НЕ включва ипотечни вноски.',
  'Cap Rate':           'Capitalization Rate = NOI / market_value × 100%. Колко % годишен доход носи имотът спрямо текущата му пазарна стойност. Стандарт за сравнение между имоти.',
  'Cap':                'Cap Rate на market value = NOI / текуща стойност. За сравнение с други имоти на пазара.',
  'Cap cost':           'Cap Rate на покупна цена = NOI / (покупна + ремонт). Реалната възвращаемост на парите които си вложил.',
  'DSCR':               'Debt Service Coverage Ratio = NOI / годишни вноски. Над 1.25 = устойчиво, под 1.0 = опасност от просрочие. Банките искат >1.25 за нов кредит.',
  'Net CF':             'Net Cash Flow = NOI − дълг service. Реалните пари в джоба след всички плащания.',
  'Net CF годишен':     'Net Cash Flow годишен = NOI − годишни вноски по ипотека. Какво остава реално в портфейла.',
  'Net Cash Flow':      'Net Cash Flow = NOI − ипотечни вноски. Реалните пари след всички разходи.',
  'Cash-on-Cash':       'CoC = Net Cash Flow / equity. Възвращаемост спрямо личния капитал. Сравни с алтернативи (ETF, депозити).',
  'CoC':                'Cash-on-Cash = Net CF / equity. Възвращаемост на твоя капитал. Под 2% = слабо, над 5% = много добро.',
  'Top 5 share':        'Концентрация: процент от общия наем идващ от top 5 имотите. Под 40% = добре диверсифицирано.',
  'Имоти':              'Брой имоти в портфолиото — активни / общо.',
  'Off-plan':           'Off-plan obligations = бъдещи плащания към developers при доставка на pre-construction имоти.',
  'Off-plan obligations': 'Бъдещи плащания към developers при доставка на pre-construction имоти (напр. Симеоново 12 — 448K EUR до 2027).',
  'Opex':               'Operating Expenses = ток, вода, такси, поддръжка, счетоводство, ддс. БЕЗ ипотека, инвестиции, ремонт.',
  'Opex годишен':       'Операт. разходи годишно. БЕЗ ипотечни вноски, инвестиции, мащабни ремонти.',
  'Opex ratio':         'Opex / Rent. Типично BG residential 10-25%. Под 10% може да означава скрити разходи или tenant-pays-utilities модел.',
  'Principal':          'Principal = частта от вноската която намалява главницата на дълга.',
  'Principal погасен':  'Сума на главниците погасени за следващите 12 месеца. Това е "savings" не разход.',
  'Lihva':              'Lihva = частта от вноската която е чист разход (interest expense). Не намалява дълга.',
  'Lihva 12m':          'Сума на lihva-та платена за 12 месеца напред.',
  'Дълг след 12м':      'Прогнозен остатък по всички ипотеки след 12 месеца плащания.',
  '% Principal':        'Дял на principal от месечната вноска. 50%+ = здраво. Под 40% = lihva-heavy (refi candidate).',
  'Service/год':        'Годишна вноска по кредита (principal + lihva).',
  'Стадий':             'Lifecycle stage: active (носи наем), listing (обявен), furnishing (обзавежда се), renovating (ремонт), pre_construction (поетапно плащане), inactive.',
  'Princ 12m':          'Principal погасен за 12 месеца. Това е "savings" — не е разход.',
  'rent_received_12m':  'Реално получени наеми по банковата сметка за последните 12 месеца. Разлика спрямо contracted показва наеми получени в кеш или Stripe.',
}

function InfoTooltip({ text, children }) {
  if (!text) return children
  return (
    <span className="inline-flex items-center gap-1 group relative">
      {children}
      <span className="cursor-help text-gray-400 hover:text-gray-600 text-[10px] leading-none border border-current rounded-full w-3.5 h-3.5 inline-flex items-center justify-center">?</span>
      <span className="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg shadow-xl w-72 z-50 pointer-events-none transition-opacity duration-150">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900"></span>
      </span>
    </span>
  )
}

function HintLabel({ children }) {
  const text = typeof children === 'string' ? METRIC_HINTS[children] : null
  return <InfoTooltip text={text}>{children}</InfoTooltip>
}

function KpiCard({ label, value, sub, color = 'gray', icon }) {
  const map = {
    blue:   { border: 'border-[#b2dce8]', bg: 'bg-[#e3f4f9]', text: 'text-[#0e3d52]' },
    green:  { border: 'border-green-200',  bg: 'bg-green-50',  text: 'text-green-700' },
    red:    { border: 'border-red-200',    bg: 'bg-red-50',    text: 'text-red-700' },
    yellow: { border: 'border-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-700' },
    purple: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700' },
    gray:   { border: 'border-gray-200',   bg: 'bg-gray-50',   text: 'text-gray-700' },
    orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700' },
  }
  const c = map[color] || map.gray
  return (
    <div className={`border rounded-xl p-4 ${c.border} ${c.bg} overflow-visible`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <HintLabel>{label}</HintLabel>
          </div>
          <div className={`text-2xl font-bold mt-1 ${c.text}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        {icon && <span className="text-2xl opacity-70">{icon}</span>}
      </div>
    </div>
  )
}

function SortHeader({ field, label, sortField, sortDir, onSort, align = 'left' }) {
  const active = sortField === field
  const arrow = active ? (sortDir === 'desc' ? '↓' : '↑') : ''
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-3 py-2 text-${align} cursor-pointer hover:bg-gray-100 select-none text-xs font-semibold uppercase tracking-wider text-gray-600`}
    >
      <HintLabel>{label}</HintLabel> {arrow}
    </th>
  )
}

function LeverageAnalysis({ byProperty, loanSchedules }) {
  // Без дълг
  const unleveraged = byProperty.filter(p => p.allocated_debt === 0)
  const unlevAsset = unleveraged.reduce((s, p) => s + (p.asset_val || 0), 0)
  const unlevRent = unleveraged.reduce((s, p) => s + (p.rent_annual || 0), 0)
  const unlevOpex = unleveraged.reduce((s, p) => s + (p.opex_annual_total || 0), 0)
  const unlevNoi = unleveraged.reduce((s, p) => s + (p.noi_annual || 0), 0)
  const unlevNetCf = unleveraged.reduce((s, p) => s + (p.net_cash_flow || 0), 0)
  const unlevActive = unleveraged.filter(p => p.active).length

  // С дълг
  const leveraged = byProperty.filter(p => p.allocated_debt > 0)
  const levAsset = leveraged.reduce((s, p) => s + (p.asset_val || 0), 0)
  const levDebt = leveraged.reduce((s, p) => s + (p.allocated_debt || 0), 0)
  const levDebtSvc = leveraged.reduce((s, p) => s + (p.allocated_debt_service || 0), 0)
  const levRent = leveraged.reduce((s, p) => s + (p.rent_annual || 0), 0)
  const levOpex = leveraged.reduce((s, p) => s + (p.opex_annual_total || 0), 0)
  const levNoi = leveraged.reduce((s, p) => s + (p.noi_annual || 0), 0)
  const levNetCf = leveraged.reduce((s, p) => s + (p.net_cash_flow || 0), 0)

  const totalNetCf = unlevNetCf + levNetCf

  // Per-loan group breakdown
  const loanGroups = loanSchedules.map(s => {
    const ids = s.property_ids || []
    const props = byProperty.filter(p => ids.includes(p.id))
    const asset = props.reduce((a, p) => a + (p.asset_val || 0), 0)
    const rent = props.reduce((a, p) => a + (p.rent_annual || 0), 0)
    const opex = props.reduce((a, p) => a + (p.opex_annual_total || 0), 0)
    const noi = rent - opex
    const debtSvc = s.principal_12m_eur + s.interest_12m_eur
    const netCf = noi - debtSvc
    return {
      name: `${s.банка} ${s.договор}`,
      shortName: (s.договор || '').slice(0, 18),
      bank: s.банка,
      properties: props.length,
      asset,
      debt: s.balance_now_eur,
      debt_svc: Math.round(debtSvc),
      rent,
      noi: Math.round(noi),
      net_cf: Math.round(netCf),
    }
  }).sort((a, b) => b.net_cf - a.net_cf)

  // Cash flow attribution pie data
  const cfPieData = [
    { name: 'Без дълг', value: Math.max(0, Math.round(unlevNetCf)), color: '#22c55e' },
    { name: 'С дълг (positive)', value: Math.max(0, Math.round(levNetCf)), color: '#f59e0b' },
  ].filter(d => d.value > 0)

  // Bar chart per loan group
  const barData = [
    { name: 'Без дълг', net_cf: Math.round(unlevNetCf), color: '#22c55e' },
    ...loanGroups.map(g => ({
      name: g.shortName,
      net_cf: g.net_cf,
      color: g.net_cf >= 0 ? (g.bank === 'Пощенска' ? '#0e7490' : g.bank === 'УниКредит' ? '#7c3aed' : '#f97316') : '#dc2626'
    }))
  ]

  // Debt vs CF metrics
  const yearsToRepay = totalNetCf > 0 ? levDebt / totalNetCf : Infinity
  const debtSvcVsCf = totalNetCf > 0 ? levDebtSvc / totalNetCf : Infinity

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">⚖️ Левередж анализ — кеш флоу по групи</h3>

      {/* Group summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border-2 border-green-300 bg-green-50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-bold text-green-800">🆓 БЕЗ ДЪЛГ</h4>
            <span className="text-2xl font-bold text-green-700">{unleveraged.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">Активни:</div><div className="text-right font-semibold">{unlevActive}</div>
            <div className="text-gray-600">Asset:</div><div className="text-right font-semibold">{fmtEur(unlevAsset)}</div>
            <div className="text-gray-600">Наем годишен:</div><div className="text-right">{fmtEur(unlevRent)}</div>
            <div className="text-gray-600">Opex годишен:</div><div className="text-right text-orange-700">−{fmtEur(unlevOpex)}</div>
            <div className="text-gray-600 font-medium">NOI годишен:</div><div className="text-right font-medium">{fmtEur(unlevNoi)}</div>
            <div className="text-gray-700 font-bold border-t pt-2">Net CF годишен:</div>
            <div className="text-right text-green-700 font-bold text-lg border-t pt-2">{fmtEur(unlevNetCf)}</div>
            <div className="text-gray-600">Net CF месечен:</div><div className="text-right text-green-700 font-semibold">{fmtEur(unlevNetCf / 12)}</div>
            <div className="text-gray-600">CF / Asset:</div><div className="text-right">{fmtPct(unlevNetCf / unlevAsset, 2)}</div>
          </div>
        </div>

        <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-bold text-amber-800">🏦 С ДЪЛГ</h4>
            <span className="text-2xl font-bold text-amber-700">{leveraged.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">Asset:</div><div className="text-right font-semibold">{fmtEur(levAsset)}</div>
            <div className="text-gray-600">Общ дълг:</div><div className="text-right text-red-700 font-semibold">{fmtEur(levDebt)}</div>
            <div className="text-gray-600">LTV:</div><div className="text-right">{fmtPct(levDebt / levAsset)}</div>
            <div className="text-gray-600">Наем годишен:</div><div className="text-right">{fmtEur(levRent)}</div>
            <div className="text-gray-600">Opex годишен:</div><div className="text-right text-orange-700">−{fmtEur(levOpex)}</div>
            <div className="text-gray-600">Вноски годишно:</div><div className="text-right text-red-700">−{fmtEur(levDebtSvc)}</div>
            <div className="text-gray-600 font-medium">NOI годишен:</div><div className="text-right font-medium">{fmtEur(levNoi)}</div>
            <div className="text-gray-700 font-bold border-t pt-2">Net CF годишен:</div>
            <div className={`text-right font-bold text-lg border-t pt-2 ${levNetCf >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmtEur(levNetCf)}</div>
            <div className="text-gray-600">Net CF месечен:</div><div className={`text-right font-semibold ${levNetCf >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmtEur(levNetCf / 12)}</div>
            <div className="text-gray-600">CF / Asset:</div><div className="text-right">{fmtPct(levNetCf / levAsset, 2)}</div>
          </div>
        </div>
      </div>

      {/* Combined totals + ratios */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500 uppercase">Общ Net CF годишен</div>
            <div className="text-xl font-bold text-slate-800">{fmtEur(totalNetCf)}</div>
            <div className="text-xs text-gray-500">{fmtEur(totalNetCf / 12)}/мес</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Дълг ÷ годишен CF</div>
            <div className="text-xl font-bold text-slate-800">{isFinite(yearsToRepay) ? `${yearsToRepay.toFixed(1)}x` : '∞'}</div>
            <div className="text-xs text-gray-500">години за пълно погасяване от CF</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Service ÷ CF</div>
            <div className="text-xl font-bold text-slate-800">{isFinite(debtSvcVsCf) ? `${(debtSvcVsCf * 100).toFixed(0)}%` : '∞'}</div>
            <div className="text-xs text-gray-500">от приходите отива в банка</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Unleveraged CF share</div>
            <div className="text-xl font-bold text-green-700">{fmtPct(unlevNetCf / totalNetCf)}</div>
            <div className="text-xs text-gray-500">от cash flow-а идва без leverage</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Pie chart: cash flow attribution */}
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">💰 Cash flow attribution (positive groups)</div>
          {cfPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={cfPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {cfPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtEur(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-400 py-12">Няма positive CF</div>
          )}
        </div>

        {/* Bar chart: per loan group */}
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">📊 Net CF по групи (по кредит)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} fontSize={11} />
              <YAxis />
              <Tooltip formatter={(v) => fmtEur(v)} />
              <Bar dataKey="net_cf" name="Net CF годишен">
                {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-loan-group detail table */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Кредит / група</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Имоти</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Asset</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Дълг</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Service/год</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Наем/год</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">NOI/год</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Net CF/год</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Net CF/мес</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr className="bg-green-50 hover:bg-green-100">
              <td className="px-3 py-2 font-semibold text-green-800">🆓 Без дълг</td>
              <td className="px-3 py-2 text-right">{unleveraged.length}</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevAsset)}</td>
              <td className="px-3 py-2 text-right text-gray-400">—</td>
              <td className="px-3 py-2 text-right text-gray-400">—</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevRent)}</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevNoi)}</td>
              <td className="px-3 py-2 text-right text-green-700 font-bold">{fmtEur(unlevNetCf)}</td>
              <td className="px-3 py-2 text-right text-green-700 font-semibold">{fmtEur(unlevNetCf / 12)}</td>
            </tr>
            {loanGroups.map(g => (
              <tr key={g.name} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{g.bank}</div>
                  <div className="text-xs text-gray-500">{g.shortName}</div>
                </td>
                <td className="px-3 py-2 text-right">{g.properties}</td>
                <td className="px-3 py-2 text-right">{fmtEur(g.asset)}</td>
                <td className="px-3 py-2 text-right text-red-700">{fmtEur(g.debt)}</td>
                <td className="px-3 py-2 text-right text-orange-700">{fmtEur(g.debt_svc)}</td>
                <td className="px-3 py-2 text-right">{fmtEur(g.rent)}</td>
                <td className="px-3 py-2 text-right">{fmtEur(g.noi)}</td>
                <td className={`px-3 py-2 text-right font-bold ${g.net_cf >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmtEur(g.net_cf)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${g.net_cf >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmtEur(g.net_cf / 12)}</td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-bold">
              <td className="px-3 py-2 text-slate-900">📊 ОБЩО</td>
              <td className="px-3 py-2 text-right">{byProperty.length}</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevAsset + levAsset)}</td>
              <td className="px-3 py-2 text-right text-red-700">{fmtEur(levDebt)}</td>
              <td className="px-3 py-2 text-right text-orange-700">{fmtEur(levDebtSvc)}</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevRent + levRent)}</td>
              <td className="px-3 py-2 text-right">{fmtEur(unlevNoi + levNoi)}</td>
              <td className={`px-3 py-2 text-right ${totalNetCf >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtEur(totalNetCf)}</td>
              <td className={`px-3 py-2 text-right ${totalNetCf >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtEur(totalNetCf / 12)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function InvestorView({ API }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('cap_rate')
  const [sortDir, setSortDir] = useState('desc')
  const [stageFilter, setStageFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    apiFetch(`${API}/api/metrics/portfolio`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [API])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedProps = useMemo(() => {
    if (!data) return []
    const arr = [...data.by_property]
    if (stageFilter !== 'all') {
      return arr.filter(p => p.lifecycle_stage === stageFilter)
        .sort((a, b) => {
          const av = a[sortField] ?? -Infinity
          const bv = b[sortField] ?? -Infinity
          return sortDir === 'desc' ? bv - av : av - bv
        })
    }
    return arr.sort((a, b) => {
      const av = a[sortField] ?? -Infinity
      const bv = b[sortField] ?? -Infinity
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [data, sortField, sortDir, stageFilter])

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда инвеститорско view...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>
  if (!data) return null

  const p = data.portfolio
  const realLtvColor = p.real_ltv == null ? 'gray' : p.real_ltv < 0.5 ? 'green' : p.real_ltv < 0.65 ? 'yellow' : 'red'
  const dscrColor = p.dscr == null ? 'gray' : p.dscr >= 1.25 ? 'green' : p.dscr >= 1.0 ? 'yellow' : 'red'
  const capRateColor = p.cap_rate == null ? 'gray' : p.cap_rate >= 0.05 ? 'green' : p.cap_rate >= 0.03 ? 'yellow' : 'red'

  const top5 = [...data.by_property]
    .filter(x => x.cap_rate != null && x.active)
    .sort((a, b) => b.cap_rate - a.cap_rate)
    .slice(0, 5)

  const bottom5 = [...data.by_property]
    .filter(x => x.cap_rate != null && x.active && x.rent_annual > 0)
    .sort((a, b) => a.cap_rate - b.cap_rate)
    .slice(0, 5)

  const stageBreakdown = Object.entries(p.properties_by_stage || {})
    .map(([stage, count]) => ({ stage, count, label: STAGE_LABELS[stage] || stage }))
    .sort((a, b) => b.count - a.count)

  const bankBreakdown = {}
  for (const s of (data.loan_schedules || [])) {
    if (!bankBreakdown[s.банка]) bankBreakdown[s.банка] = { банка: s.банка, balance: 0, principal: 0, interest: 0 }
    bankBreakdown[s.банка].balance += s.balance_now_eur
    bankBreakdown[s.банка].principal += s.principal_12m_eur
    bankBreakdown[s.банка].interest += s.interest_12m_eur
  }
  const bankData = Object.values(bankBreakdown)

  const hasOffPlan = p.off_plan_obligations > 0
  const hasNoOpex = !p.opex_annual || p.opex_annual === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>📊 Инвеститорско view</h2>
          <div className="text-sm text-gray-500 mt-1">
            Asof: {data.asof} · Opex period: {data.opex_period_from} → now · Currency: {data.currency}
          </div>
        </div>
      </div>

      {/* Warning banners */}
      {hasNoOpex && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ <b>Opex = 0</b> — бизнес банковата сметка не е импортирана още. NOI и Cap Rate са overstated. Реалните числа ще се появят след ProBanking импорт на business сметка.
        </div>
      )}

      {hasOffPlan && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-sm text-cyan-900">
          💡 <b>Pre-construction обвързаност:</b> {fmtEur(p.off_plan_obligations)} дължимо при доставка на Симеоново 12. Real LTV {fmtPct(p.real_ltv)} (vs debt-only LTV {fmtPct(p.ltv)}).
        </div>
      )}

      {/* Lifecycle breakdown */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Lifecycle разпределение</h3>
        <div className="flex flex-wrap gap-2">
          {stageBreakdown.map(s => (
            <button
              key={s.stage}
              onClick={() => setStageFilter(stageFilter === s.stage ? 'all' : s.stage)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                stageFilter === s.stage
                  ? 'bg-[#4AABCC] text-white border-[#4AABCC]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#4AABCC]'
              }`}
              style={stageFilter !== s.stage ? { borderLeftColor: STAGE_COLORS[s.stage], borderLeftWidth: '4px' } : {}}
            >
              {s.label}: <b>{s.count}</b>
            </button>
          ))}
          {stageFilter !== 'all' && (
            <button onClick={() => setStageFilter('all')} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              ✕ изчисти филтър
            </button>
          )}
        </div>
      </section>

      {/* Main KPI cards */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Портфолио KPI</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Asset base" value={fmtEur(p.asset_base)} icon="🏠" color="blue" />
          <KpiCard label="Total debt" value={fmtEur(p.total_debt)} sub={`+ off-plan: ${fmtEur(p.off_plan_obligations || 0)}`} icon="🏦" color="orange" />
          <KpiCard label="Real equity" value={fmtEur(p.real_equity)} sub={`book: ${fmtEur(p.equity)}`} icon="💰" color="green" />
          <KpiCard label="Real LTV" value={fmtPct(p.real_ltv)} sub={`debt-only: ${fmtPct(p.ltv)}`} icon="⚖️" color={realLtvColor} />
          <KpiCard label="Rent годишен" value={fmtEur(p.rent_annual)} sub={`${fmtEur(p.rent_monthly)}/мес`} icon="🔑" color="blue" />
          <KpiCard label="NOI годишен" value={fmtEur(p.noi_annual)} sub={hasNoOpex ? '(opex=0)' : ''} icon="📈" color="green" />
          <KpiCard label="Cap Rate" value={fmtPct(p.cap_rate)} icon="🎯" color={capRateColor} />
          <KpiCard label="DSCR" value={p.dscr ? p.dscr.toFixed(2) : '—'} icon="🛡️" color={dscrColor} />
          <KpiCard label="Net CF годишен" value={fmtEur(p.net_cash_flow_annual)} sub="NOI - debt service" icon="💸" color="purple" />
          <KpiCard label="Cash-on-Cash" value={fmtPct(p.cash_on_cash)} icon="🎲" color="purple" />
          <KpiCard label="Top 5 share" value={fmtPct(p.concentration.top5_rent_share)} sub={`Herfindahl: ${p.concentration.herfindahl?.toFixed(3)}`} icon="🎯" color="gray" />
          <KpiCard label="Имоти" value={`${p.properties_active}/${p.properties_total}`} sub="активни/общо" icon="🏘️" color="gray" />
        </div>
      </section>

      {/* Leverage analysis */}
      <LeverageAnalysis byProperty={data.by_property} loanSchedules={data.loan_schedules || []} />

      {/* 12m amortization */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Дълг — 12 месеца напред</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard label="Principal погасен" value={fmtEur(p.principal_paydown_12m)} sub="дълг намалява с" color="green" />
          <KpiCard label="Lihva 12m" value={fmtEur(p.interest_12m)} sub="плащате lihva" color="orange" />
          <KpiCard label="Дълг след 12м" value={fmtEur(p.debt_after_12m)} sub={`от ${fmtEur(p.total_debt)} сега`} color="blue" />
          <KpiCard label="% Principal" value={fmtPct(p.principal_share_12m)} sub="от месечната вноска" color="purple" />
        </div>

        {bankData.length > 0 && (
          <div className="bg-white border rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-700 mb-3">По банка</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bankData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="банка" />
                <YAxis />
                <Tooltip formatter={(v) => fmtEur(v)} />
                <Legend />
                <Bar dataKey="principal" name="Principal 12m" fill="#22c55e" />
                <Bar dataKey="interest" name="Lihva 12m" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Loan schedules table */}
      {data.loan_schedules?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Кредити (12m amortization)</h3>
          <div className="bg-white border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Банка</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Договор</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Balance</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Principal 12m</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Lihva 12m</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">% Lihva</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">След 12m</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.loan_schedules.map(s => {
                  const total = s.principal_12m_eur + s.interest_12m_eur
                  const intPct = total > 0 ? s.interest_12m_eur / total : 0
                  const intColor = intPct > 0.6 ? 'text-red-700 font-semibold' : intPct > 0.5 ? 'text-amber-700' : 'text-gray-700'
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2"><span style={{ color: BANK_COLORS[s.банка] || '#666' }} className="font-medium">{s.банка}</span></td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{s.договор}</td>
                      <td className="px-3 py-2 text-right">{fmtEur(s.balance_now_eur)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmtEur(s.principal_12m_eur)}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{fmtEur(s.interest_12m_eur)}</td>
                      <td className={`px-3 py-2 text-right ${intColor}`}>{fmtPct(intPct)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{fmtEur(s.balance_after_12m_eur)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top / Bottom performers */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 border-b border-green-200">🏆 Top 5 by Cap Rate</div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-1 text-left">Имот</th>
              <th className="px-3 py-1 text-right">Наем</th>
              <th className="px-3 py-1 text-right"><HintLabel>Cap</HintLabel></th>
              <th className="px-3 py-1 text-right"><HintLabel>Cap cost</HintLabel></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {top5.map(x => (
                <tr key={x.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="text-gray-900 font-medium">{x.адрес}</div>
                    <div className="text-xs text-gray-500">{x.тип}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEur(x.rent_annual)}/год</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{fmtPct(x.cap_rate, 2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtPct(x.cap_rate_cost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 border-b border-red-200">📉 Bottom 5 by Cap Rate (active с наем)</div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-1 text-left">Имот</th>
              <th className="px-3 py-1 text-right">Наем</th>
              <th className="px-3 py-1 text-right"><HintLabel>Cap</HintLabel></th>
              <th className="px-3 py-1 text-right"><HintLabel>Cap cost</HintLabel></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {bottom5.map(x => (
                <tr key={x.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="text-gray-900 font-medium">{x.адрес}</div>
                    <div className="text-xs text-gray-500">{x.тип}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEur(x.rent_annual)}/год</td>
                  <td className="px-3 py-2 text-right font-bold text-red-700">{fmtPct(x.cap_rate, 2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtPct(x.cap_rate_cost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-property full table */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Per-property {stageFilter !== 'all' && <span className="text-[#4AABCC]">(филтър: {STAGE_LABELS[stageFilter]})</span>}
          <span className="text-gray-400 font-normal"> — {sortedProps.length} имота</span>
        </h3>
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader field="id" label="ID" {...{sortField,sortDir,onSort:handleSort}} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Адрес</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Стадий</th>
                <SortHeader field="rent_annual" label="Наем/год" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="asset_val" label="Stoyност" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="allocated_debt" label="Дълг" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="ltv" label="LTV" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="cap_rate" label="Cap" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="cap_rate_cost" label="Cap cost" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="net_cash_flow" label="Net CF" align="right" {...{sortField,sortDir,onSort:handleSort}} />
                <SortHeader field="principal_paydown_12m" label="Princ 12m" align="right" {...{sortField,sortDir,onSort:handleSort}} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedProps.map(x => {
                const ltvColor = x.ltv == null ? '' : x.ltv > 0.65 ? 'text-red-700 font-semibold' : x.ltv > 0.5 ? 'text-amber-700' : 'text-gray-700'
                const cfColor = x.net_cash_flow > 0 ? 'text-green-700' : x.net_cash_flow < 0 ? 'text-red-700' : 'text-gray-500'
                return (
                  <tr key={x.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 text-xs">{x.id}</td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{x.адрес}</div>
                      <div className="text-xs text-gray-400">{x.тип}{x.наемател ? ` · ${x.наемател}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          background: (STAGE_COLORS[x.lifecycle_stage] || '#94a3b8') + '20',
                          color: STAGE_COLORS[x.lifecycle_stage] || '#475569',
                        }}
                      >
                        {STAGE_LABELS[x.lifecycle_stage] || x.lifecycle_stage}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmtEur(x.rent_annual)}</td>
                    <td className="px-3 py-2 text-right">{fmtEur(x.asset_val)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmtEur(x.allocated_debt)}</td>
                    <td className={`px-3 py-2 text-right ${ltvColor}`}>{fmtPct(x.ltv)}</td>
                    <td className="px-3 py-2 text-right">{fmtPct(x.cap_rate, 2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-medium">{fmtPct(x.cap_rate_cost, 2)}</td>
                    <td className={`px-3 py-2 text-right ${cfColor}`}>{fmtEur(x.net_cash_flow)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmtEur(x.principal_paydown_12m)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
