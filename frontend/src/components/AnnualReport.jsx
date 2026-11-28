import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, LineChart, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { apiFetch } from '../api'

// Годишен отчет — реалните пари по фирмените сметки (без амортизация).
// Числата се смятат на сървъра (backend/lib/annualReport.js); тук е само показването.

const MONTHS = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек']
const MONTHS_FULL = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември']

// Групиране на хилядите винаги (bg-BG не групира 4-цифрени числа → „7782" до „61 083").
const fmt = (n, d = 0) => {
  if (n == null || isNaN(n)) return '—'
  const [i, f] = Math.abs(Number(n)).toFixed(d).split('.')
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')
  return `${Number(n) < 0 ? '−' : ''}${g}${f ? ',' + f : ''}`
}
const eur = (n, d = 0) => (n == null || isNaN(n)) ? '—' : `${fmt(n, d)}\u00A0€`
const k = n => (n == null || isNaN(n)) ? '' : Math.abs(n) >= 1000 ? `${fmt(n / 1000, Math.abs(n) >= 10000 ? 0 : 1)}k` : fmt(n)
const pct = (n, d = 0) => (n == null || isNaN(n)) ? '—' : `${n > 0 ? '+' : ''}${fmt(n, d)}%`
const dmy = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '—'
const monthLabel = m => MONTHS[Number(m.slice(5, 7)) - 1]
const maskIban = i => i ? `${i.slice(0, 4)}…${i.slice(-4)}` : ''

// Цветовете на сериите: една и съща същност има един и същи цвят във всички
// графики (наем = син, разходи = оранжев, печалба = аква…). Стойностите са в
// CSS-а по-долу, с отделни стъпки за тъмен режим (валидирани за CVD).
const C = {
  rent: 'var(--ar-rent)', opex: 'var(--ar-opex)', profit: 'var(--ar-profit)',
  reno: 'var(--ar-reno)', purchase: 'var(--ar-purchase)', metals: 'var(--ar-metals)',
  prev: 'var(--ar-prev)', ink: 'var(--ar-ink)', grid: 'var(--ar-grid)', axis: 'var(--muted)',
}

const STYLE = `
.ar-root{--ar-rent:#257de0;--ar-opex:#f47230;--ar-profit:#00b894;--ar-reno:#f2a600;--ar-purchase:#6a4ce2;--ar-metals:#ee7fac;
  --ar-prev:#9a9a9a;--ar-ink:#3d3a35;--ar-grid:rgba(0,0,0,.07);}
html[data-mode="dark"] .ar-root{--ar-rent:#338ced;--ar-opex:#e76624;--ar-profit:#00a888;--ar-reno:#d28e05;--ar-purchase:#9887ef;--ar-metals:#e24d8b;
  --ar-prev:#7a7a7a;--ar-ink:#cfcac0;--ar-grid:rgba(255,255,255,.08);}
.ar-card{background:var(--surface);border:1px solid var(--surface-border);border-radius:14px;padding:18px 18px 14px;box-shadow:var(--shadow-card);}
.ar-card h3{margin:0 0 2px;}
.ar-cap{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.45;}
.ar-lede{font-family:var(--font-display,Georgia,serif);font-size:clamp(17px,1.7vw,21px);line-height:1.45;color:var(--page-fg);max-width:62rem;}
.ar-lede b{font-weight:600;}
.ar-tip{background:var(--surface);border:1px solid var(--surface-border);border-radius:10px;padding:9px 11px;font-size:12px;
  box-shadow:0 10px 28px -14px rgba(0,0,0,.35);color:var(--page-fg);min-width:150px;}
.ar-tip .t{font-weight:600;margin-bottom:5px;}
.ar-tip .r{display:flex;align-items:center;gap:7px;justify-content:space-between;}
.ar-tip .sw{width:9px;height:9px;border-radius:2px;display:inline-block;}
.ar-tip .v{font-variant-numeric:tabular-nums;margin-left:12px;}
.ar-yr{border:1px solid var(--surface-border);border-radius:999px;padding:4px 12px;font-size:12px;background:var(--surface);color:var(--page-fg);cursor:pointer;}
.ar-yr.on{background:var(--page-fg);color:var(--surface);border-color:var(--page-fg);}
.ar-btn{border:1px solid var(--surface-border);border-radius:8px;padding:5px 11px;font-size:12px;background:var(--surface);color:var(--page-fg);cursor:pointer;}
.ar-table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;}
.ar-table th{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:right;padding:6px 8px;border-bottom:1px solid var(--surface-border);white-space:nowrap;}
.ar-table th:first-child,.ar-table td:first-child{text-align:left;}
.ar-table td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--surface-border);white-space:nowrap;}
.ar-table tr.tot td{font-weight:600;border-top:1.5px solid var(--page-fg);border-bottom:none;}
.ar-table tr.dim td{color:var(--muted);}
.ar-note{font-size:12px;line-height:1.55;color:var(--muted);}
.ar-note li{margin:3px 0;}
.ar-pill{display:inline-block;font-size:10.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--surface-border);}
.ar-flow-row{display:grid;grid-template-columns:minmax(120px,190px) 1fr 92px;gap:10px;align-items:center;font-size:12.5px;padding:3px 0;}
.ar-flow-bar{height:14px;border-radius:3px;}
.ar-scroll{overflow-x:auto;}
@media print{
  body *{visibility:hidden !important;}
  .ar-root,.ar-root *{visibility:visible !important;}
  .ar-root{position:absolute;left:0;top:0;width:100%;padding:0 8mm;}
  .ar-noprint{display:none !important;}
  .ar-card{break-inside:avoid;box-shadow:none;}
}
`

function Tip({ active, payload, label, formatLabel }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="ar-tip">
      <div className="t">{formatLabel ? formatLabel(label, payload) : label}</div>
      {payload.filter(p => p.value != null).map(p => (
        <div className="r" key={p.dataKey}>
          <span><span className="sw" style={{ background: p.color || p.fill || p.stroke }} /> {p.name}</span>
          <span className="v">{eur(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Текстът на легендата е в текстовия цвят — цветът носи само квадратчето.
const legendText = v => <span style={{ color: "var(--page-fg)" }}>{v}</span>

const axisProps = { tick: { fontSize: 11, fill: 'var(--muted)' }, tickLine: false, axisLine: false }

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <span className="kpi-rule" style={{ background: accent || 'var(--accent)' }} />
      <div className="kpi-head"><div className="kpi-label">{label}</div></div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function Card({ title, caption, children, className = '' }) {
  return (
    <section className={`ar-card ${className}`}>
      <h3 className="iv-section-h">{title}</h3>
      {caption && <p className="ar-cap">{caption}</p>}
      {children}
    </section>
  )
}

// Хоризонтални ленти за разбивки — един цвят (същността), сортирани, със стойност вдясно.
function HBars({ rows, color, height }) {
  const data = rows.map(r => ({ ...r, short: r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label }))
  const h = height || Math.max(120, data.length * 28 + 20)
  return (
    <div style={{ width: '100%', height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="short" width={170} {...axisProps} tick={{ fontSize: 11.5, fill: 'var(--page-fg)' }} />
          <Tooltip cursor={{ fill: 'var(--ar-grid)' }} content={<Tip formatLabel={(l, p) => p[0]?.payload?.label || l} />} />
          <Bar isAnimationActive={false} dataKey="amount" name="Сума" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18}
            label={{ position: 'right', formatter: v => eur(v), fontSize: 11, fill: 'var(--page-fg)' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function AnnualReport({ API }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllPayers, setShowAllPayers] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    apiFetch(`${API}/api/reports/annual?year=${year}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!alive) return; if (!ok) throw new Error(j.error || 'Грешка'); setData(j) })
      .catch(e => alive && setErr(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [API, year])

  const live = useMemo(() => (data?.months || []).filter(m => m.has_data), [data])
  const chartMonths = useMemo(() => (data?.months || []).map((m, i) => ({
    ...m, label: MONTHS[i],
    expenses: m.has_data ? r2(m.opex + m.cash) : null,
    rent_net: m.has_data ? m.rent_net : null,
    profit: m.has_data ? m.profit : null,
    prev_net: data?.prev_year?.months?.[i]?.rent_net || null,
    cur_net: m.has_data ? m.rent_net : null,
    invest_purchase: m.has_data ? m.purchase : null,
    invest_reno: m.has_data ? m.reno : null,
    invest_metals: m.has_data ? m.metals : null,
  })), [data])

  if (loading && !data) return <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Зареждане на отчета…</div>
  if (err) return <div className="p-6 text-sm" style={{ color: 'var(--neg)' }}>Отчетът не се зареди: {err}</div>
  if (!data) return null

  const t = data.totals
  const isPast = year < new Date().getFullYear()
  const n = live.length
  const noData = n === 0
  const years = (data.years && data.years.length ? data.years : [year])
  const yrs = [...new Set([...years, year])].sort()
  const lastM = live[live.length - 1]
  const firstM = live[0]
  const fin = data.financing || {}
  const prevNote = data.prev_year?.has_data
    ? `${data.prev_year.comparable_months} сравними месеца · само импортираните сметки`
    : 'няма импортирани данни за миналата година'

  // Паричен поток за годината — откъде дойдоха и къде отидоха парите
  const flows = [
    { label: 'Наеми', v: t.rent_gross },
    { label: 'Депозити (нето)', v: t.deposits },
    { label: 'Възстановен ДДС', v: t.vat_refund },
    { label: 'Финансиране от собственика', v: t.financing },
    { label: 'Други постъпления', v: t.other_in },
    { label: 'Оперативни разходи', v: -(t.opex + t.cash) },
    { label: 'ДДС към НАП', v: -t.vat_paid },
    { label: 'Ремонт и обзавеждане', v: -t.reno },
    { label: 'Покупка на имоти', v: -t.purchase },
    { label: 'Благородни метали', v: -t.metals },
    { label: 'Голямо плащане без категория', v: -t.large },
    { label: 'Към собственика', v: -t.owner },
    { label: 'Вътрешни преводи', v: t.internal },
  ].filter(f => Math.abs(f.v) >= 0.5)
  const maxFlow = Math.max(1, ...flows.map(f => Math.abs(f.v)), Math.abs(t.net_cash))

  const opexRows = (() => {
    const rows = data.opex_breakdown || []
    if (rows.length <= 10) return rows
    const rest = rows.slice(9).reduce((a, r) => a + r.amount, 0)
    return [...rows.slice(0, 9), { label: `Други (${rows.length - 9})`, amount: r2(rest) }]
  })()
  const payers = showAllPayers ? data.payers : (data.payers || []).slice(0, 12)
  const investTotal = t.purchase + t.reno + t.metals

  return (
    <div className="space-y-6 fin-surface ar-root">
      <style>{STYLE}</style>

      <header className="iv-mast">
        <div>
          <div className="iv-mast-eyebrow">{data.company || 'Фирмата'} · годишен отчет</div>
          <h2 className="iv-mast-title">{year}</h2>
        </div>
        <div className="iv-mast-meta">
          {!noData && <span>{dmy(data.period.from)} – {dmy(data.period.to)}</span>}
          {!noData && <span className="iv-mast-dot" />}
          <span>{data.source === 'accounts'
            ? `сметки: ${data.accounts.map(maskIban).join(', ')}`
            : 'всички бизнес движения от банковия импорт'}</span>
          {data.last_import && <><span className="iv-mast-dot" /><span>последен импорт {dmy(String(data.last_import).slice(0, 10))}</span></>}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 ar-noprint">
        {yrs.map(y => (
          <button key={y} className={`ar-yr ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>
        ))}
        <span className="flex-1" />
        <button className="ar-btn" onClick={() => window.print()}>Печат / PDF</button>
      </div>

      {noData ? (
        <div className="ar-card ar-note">
          За {year} г. няма движения по фирмените сметки. Отчетът се смята от банковия импорт
          (раздел „Банка“) — импортирай извлечението на фирмената сметка и се върни тук.
        </div>
      ) : <>

      <p className="ar-lede">
        За {n === 12 ? 'годината' : `${n} ${n === 1 ? 'месец' : 'месеца'}`} {data.company ? 'фирмата' : ''} получи <b>{eur(t.rent_gross)}</b> от
        наеми ({eur(t.rent_net)} без ДДС), похарчи <b>{eur(t.opex + t.cash)}</b> за текущи разходи и
        остави <b>{eur(t.profit)}</b> печалба — марж {fmt(t.margin)}%.
        {investTotal > 0 && <> Отделно в имоти, ремонт и активи са вложени {eur(investTotal)}.</>}
        {data.run_rate && <> {isPast ? "В края на периода наемите носеха" : "Сега наемите носят"} около <b>{eur(data.run_rate.gross)}</b> на месец ({MONTHS_FULL[Number(data.run_rate.month.slice(5)) - 1]}).</>}
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <Kpi label="Оборот без ДДС" value={eur(t.rent_net)} sub={`${eur(t.rent_gross)} с ДДС`} accent={C.rent} />
        <Kpi label="Текущи разходи" value={eur(t.opex + t.cash)} sub={t.rent_net ? `${fmt((t.opex + t.cash) / t.rent_net * 100)}% от оборота` : null} accent={C.opex} />
        <Kpi label="Печалба" value={eur(t.profit)} sub={`марж ${fmt(t.margin)}% · без амортизация`} accent={C.profit} />
        {data.run_rate && <Kpi label={isPast ? "Наем на месец (последен)" : "Наем на месец сега"} value={eur(data.run_rate.gross)}
          sub={`${MONTHS_FULL[Number(data.run_rate.month.slice(5)) - 1]} · ${data.run_rate.tenants} плащащи · ${eur(data.run_rate.net)} без ДДС`} accent={C.rent} />}
        <Kpi label="Спрямо миналата година" value={data.yoy == null ? '—' : pct(data.yoy)} sub={prevNote} accent={C.prev} />
        {fin.loans?.length > 0 && <Kpi label="След лихвите по кредитите" value={eur(fin.profit_after_interest)}
          sub={`≈ ${eur(fin.interest_month)}/мес лихви, платени извън фирмената сметка`} accent={C.ink} />}
      </div>

      <Card title="Приходи, разходи и печалба по месеци"
        caption="Наемът е без ДДС. Разходите са текущите (без ремонт, покупки и ДДС). Печалбата е разликата.">
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartMonths} margin={{ top: 10, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={k} width={44} />
              <Tooltip cursor={{ fill: 'var(--ar-grid)' }} content={<Tip formatLabel={(l, p) => {
                const m = p[0]?.payload?.month; return m ? `${MONTHS_FULL[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : l }} />} />
              <Legend formatter={legendText} iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: 'var(--page-fg)' }} />
              <Bar isAnimationActive={false} dataKey="rent_net" name="Наем без ДДС" fill={C.rent} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar isAnimationActive={false} dataKey="expenses" name="Текущи разходи" fill={C.opex} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Line isAnimationActive={false} dataKey="profit" name="Печалба" stroke={C.profit} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: C.profit }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <Card title="Натрупана печалба" caption={`Как расте печалбата през годината — към ${dmy(data.period.to)} е ${eur(t.profit)}.`}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={chartMonths} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="arCum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ar-profit)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--ar-profit)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={k} width={44} />
                <Tooltip content={<Tip />} />
                <Area isAnimationActive={false} dataKey="cum_profit" name="Натрупана печалба" stroke={C.profit} strokeWidth={2} fill="url(#arCum)" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`Наем: ${year} спрямо ${year - 1}`}
          caption={data.prev_year?.has_data ? `Без ДДС. Миналата година — само по импортираните сметки; ${prevNote}.` : 'Няма импортирани данни за миналата година.'}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartMonths} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={k} width={44} />
                <Tooltip content={<Tip />} />
                <Legend formatter={legendText} iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, color: 'var(--page-fg)' }} />
                <Line isAnimationActive={false} dataKey="prev_net" name={String(year - 1)} stroke={C.prev} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line isAnimationActive={false} dataKey="cur_net" name={String(year)} stroke={C.rent} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: C.rent }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <Card title="Плащащи наематели" caption={firstM && lastM ? `От ${firstM.tenants} през ${MONTHS_FULL[Number(firstM.month.slice(5)) - 1]} до ${lastM.tenants} през ${MONTHS_FULL[Number(lastM.month.slice(5)) - 1]} (различни платци по сметката).` : null}>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={chartMonths.filter(m => m.has_data)} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} width={28} />
                <Tooltip cursor={{ fill: 'var(--ar-grid)' }} formatter={v => [v, 'Наематели']} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 10, fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="tenants" name="Наематели" fill={C.ink} radius={[4, 4, 0, 0]} maxBarSize={22}
                  label={{ position: 'top', fontSize: 10.5, fill: 'var(--muted)' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Вложено в имоти и активи" caption={`Не са разход за печалбата — общо ${eur(investTotal)} за периода.`}>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={chartMonths.filter(m => m.has_data)} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={k} width={44} />
                <Tooltip cursor={{ fill: 'var(--ar-grid)' }} content={<Tip />} />
                <Legend formatter={legendText} iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: 'var(--page-fg)' }} />
                <Bar isAnimationActive={false} dataKey="invest_purchase" name="Покупки" stackId="i" fill={C.purchase} stroke="var(--surface)" strokeWidth={1} maxBarSize={26} />
                <Bar isAnimationActive={false} dataKey="invest_reno" name="Ремонт и обзавеждане" stackId="i" fill={C.reno} stroke="var(--surface)" strokeWidth={1} maxBarSize={26} />
                <Bar isAnimationActive={false} dataKey="invest_metals" name="Благородни метали" stackId="i" fill={C.metals} stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Откъде дойдоха и къде отидоха парите"
        caption={`Всички движения по фирмените сметки за периода. Нетно изменение на парите: ${eur(t.net_cash)}.`}>
        <div>
          {flows.map(f => (
            <div className="ar-flow-row" key={f.label}>
              <span>{f.label}</span>
              {/* Две половини около централна линия: плащанията растат наляво, постъпленията — надясно */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderRight: '1px solid var(--surface-border)' }}>
                  {f.v < 0 && <div className="ar-flow-bar" style={{ width: `${Math.max(1.2, -f.v / maxFlow * 100)}%`, background: C.opex, borderRadius: '4px 0 0 4px' }} title={eur(f.v)} />}
                </div>
                <div style={{ display: 'flex' }}>
                  {f.v > 0 && <div className="ar-flow-bar" style={{ width: `${Math.max(1.2, f.v / maxFlow * 100)}%`, background: C.rent, borderRadius: '0 4px 4px 0' }} title={eur(f.v)} />}
                </div>
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.v > 0 ? '+' : ''}{eur(f.v)}</span>
            </div>
          ))}
          <div className="ar-flow-row" style={{ borderTop: '1.5px solid var(--page-fg)', marginTop: 6, paddingTop: 6, fontWeight: 600 }}>
            <span>Нетно изменение</span>
            <span />
            <span style={{ textAlign: 'right' }}>{t.net_cash > 0 ? '+' : ''}{eur(t.net_cash)}</span>
          </div>
          <p className="ar-cap" style={{ marginTop: 8 }}>
            <span className="sw" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.rent, marginRight: 5 }} />постъпления
            <span className="sw" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.opex, margin: '0 5px 0 14px' }} />плащания
          </p>
        </div>
      </Card>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <Card title="Текущи разходи по вид" caption={`Общо ${eur(t.opex + t.cash)} — ${eur(n ? (t.opex + t.cash) / n : 0)} средно на месец.`}>
          {opexRows.length ? <HBars rows={opexRows} color={C.opex} /> : <p className="ar-note">Няма текущи разходи.</p>}
        </Card>
        <Card title="Ремонт и обзавеждане по доставчик" caption={`Общо ${eur(t.reno)}.`}>
          {(data.reno_breakdown || []).length ? <HBars rows={data.reno_breakdown.slice(0, 10)} color={C.reno} /> : <p className="ar-note">Няма.</p>}
        </Card>
      </div>

      <Card title="Наем по имоти" caption="С ДДС, както е постъпил по сметката. Имотите без отбелязан имот в импорта са в „Без имот“.">
        <HBars rows={(data.by_property || []).slice(0, 20).map(b => ({ label: b.address || 'Без имот', amount: b.gross }))} color={C.rent} />
      </Card>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        {data.forecast && !isPast && (
          <Card title="Следващите 12 месеца" caption={`При сегашния наем (${MONTHS_FULL[Number(data.run_rate.month.slice(5)) - 1]}) и средните разходи досега. Без нови наематели и без напуснали.`}>
            <table className="ar-table">
              <tbody>
                <tr><td>Наем с ДДС</td><td>{eur(data.forecast.rent_gross_year)}</td></tr>
                <tr><td>Наем без ДДС (оборот)</td><td>{eur(data.forecast.rent_net_year)}</td></tr>
                <tr><td>Текущи разходи</td><td>−{eur(data.forecast.opex_year)}</td></tr>
                <tr className="tot"><td>Печалба</td><td>{eur(data.forecast.profit_year)}</td></tr>
                {fin.loans?.length > 0 && <tr className="dim"><td>след лихвите по кредитите</td><td>{eur(data.forecast.profit_after_interest_year)}</td></tr>}
              </tbody>
            </table>
          </Card>
        )}
        {fin.loans?.length > 0 && (
          <Card title="Кредити за имотите на фирмата" caption="Вноските не минават през фирмената сметка, затова не са в печалбата. Лихвата е по сегашния остатък — приблизително.">
            <div className="ar-scroll">
              <table className="ar-table">
                <thead><tr><th>Банка</th><th>Остатък</th><th>Лихва</th><th>Вноска</th><th>Лихва/мес</th></tr></thead>
                <tbody>
                  {fin.loans.map(l => (
                    <tr key={l.id}><td>{l.bank}</td><td>{eur(l.balance)}</td><td>{fmt(l.rate, 2)}%</td><td>{eur(l.payment)}</td><td>{eur(l.interest_month)}</td></tr>
                  ))}
                  <tr className="tot"><td>Общо</td><td>{eur(fin.balance)}</td><td /><td>{eur(fin.payment_month)}</td><td>{eur(fin.interest_month)}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Card title="Месец по месец" caption="Всички числа от графиките. Наемът е постъпилият по сметката; печалбата = наем без ДДС − текущи разходи.">
        <div className="ar-scroll">
          <table className="ar-table">
            <thead><tr>
              <th>Месец</th><th>Наем с ДДС</th><th>Без ДДС</th><th>Текущи разх.</th><th>Печалба</th><th>ДДС към НАП</th>
              <th>Ремонт</th><th>Покупки</th><th>Метали</th><th>Наематели</th>
            </tr></thead>
            <tbody>
              {live.map(m => (
                <tr key={m.month}>
                  <td>{MONTHS_FULL[Number(m.month.slice(5)) - 1]}</td>
                  <td>{fmt(m.rent_gross)}</td><td>{fmt(m.rent_net)}</td><td>{fmt(m.opex + m.cash)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(m.profit)}</td><td>{fmt(m.vat_paid)}</td>
                  <td>{fmt(m.reno)}</td><td>{fmt(m.purchase)}</td><td>{fmt(m.metals)}</td><td>{m.tenants}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Общо</td><td>{fmt(t.rent_gross)}</td><td>{fmt(t.rent_net)}</td><td>{fmt(t.opex + t.cash)}</td>
                <td>{fmt(t.profit)}</td><td>{fmt(t.vat_paid)}</td><td>{fmt(t.reno)}</td><td>{fmt(t.purchase)}</td><td>{fmt(t.metals)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Наематели" caption="Кой колко е платил по сметката през годината, по имот. „+1“ = още един платец по същия имот (нов наемател или друго изписване). „Спрял“ = без плащане в последните два месеца с данни.">
        <div className="ar-scroll">
          <table className="ar-table">
            <thead><tr><th>Платец</th><th style={{ textAlign: "left" }}>Имот</th><th>Месеци</th><th>Общо</th><th>Последно</th><th /></tr></thead>
            <tbody>
              {payers.map((p, i) => (
                <tr key={i} className={p.active ? '' : 'dim'}>
                  <td>{p.name}{p.other_names > 0 && <span style={{ color: 'var(--muted)' }}> +{p.other_names}</span>}</td>
                  <td style={{ textAlign: 'left', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address || '—'}</td>
                  <td>{p.months}</td><td>{eur(p.total)}</td><td>{dmy(p.last)} · {eur(p.last_amount)}</td>
                  <td><span className="ar-pill" style={{ color: p.active ? 'var(--pos)' : 'var(--muted)' }}>{p.active ? '● плаща' : '○ спрял'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(data.payers || []).length > 12 && (
          <button className="ar-btn ar-noprint" style={{ marginTop: 10 }} onClick={() => setShowAllPayers(v => !v)}>
            {showAllPayers ? 'Покажи по-малко' : `Покажи всички (${data.payers.length})`}
          </button>
        )}
      </Card>

      <Card title="Как е сметнато и какво да се провери">
        <ul className="ar-note" style={{ paddingLeft: 18, listStyle: 'disc' }}>
          <li>Само движенията по фирмените сметки от банковия импорт{data.source === 'accounts' ? ` (${data.accounts.map(maskIban).join(', ')})` : ''}. Наемите в брой и плащанията от лични сметки не са тук.</li>
          <li>Без счетоводна амортизация и без начислени, но неплатени суми. Корпоративният данък не е изваден.</li>
          <li>{data.vat_rate ? `Оборотът без ДДС = постъпленията ÷ ${fmt(1 + data.vat_rate, 2)} (имотите, освободени от ДДС, остават както са). ДДС към НАП и възстановеният ДДС не са нито приход, нито разход.` : 'Фирмата не е регистрирана по ДДС — оборотът е както е постъпил.'}</li>
          <li>Депозитите не са оборот. Когато наем и депозит са платени заедно, излишъкът над наема по договора се брои за депозит.</li>
          <li>Ремонтите, покупките на имоти (с нотариалните такси) и благородните метали са вложения — показани отделно, не намаляват печалбата.</li>
          {data.data_quality?.duplicates_skipped > 0 && (
            <li>{data.data_quality.duplicates_skipped} движения за {eur(data.data_quality.duplicates_amount)} са внесени два пъти от различни извлечения и са броени веднъж.</li>
          )}
          {(data.large_uncategorized || []).length > 0 && (
            <li style={{ color: 'var(--page-fg)' }}>
              Големи плащания без категория — не са в печалбата, провери ги в „Банка“:
              <ul style={{ paddingLeft: 16, listStyle: 'circle' }}>
                {data.large_uncategorized.map((l, i) => <li key={i}>{dmy(l.date)} · {l.label} · {eur(l.amount)} — {l.description}</li>)}
              </ul>
            </li>
          )}
          {t.cash > 0 && <li>Теглене в брой ({eur(t.cash)}) е броено за разход, защото не се знае за какво е.</li>}
          {t.internal !== 0 && <li>Преводи към/от други сметки на фирмата: {eur(t.internal)}. Ако тези сметки не са импортирани, движенията по тях не са в отчета.</li>}
        </ul>
      </Card>
      </>}
    </div>
  )
}

function r2(v) { return Math.round(v * 100) / 100 }
