import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api'

// „Кой е платил и какво чака мен" — оперативният слой на Таблото от визуалната
// система. Отговаря на един въпрос, за разлика от финансовите показатели под
// него (наем, вноска, DSCR), които остават непроменени.
//
// Данните идват от /api/properties/rent-status — същият източник, който ползва
// Портфейлът, така че числата не могат да се разминат.

const fmt = (n, d = 0) => (n == null || isNaN(n))
  ? '—'
  : Number(n).toLocaleString('bg-BG', { minimumFractionDigits: d, maximumFractionDigits: d })

const bgMonth = (ym) => {
  if (!ym) return ''
  const M = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември']
  const [y, m] = ym.split('-')
  return `${M[+m - 1]} ${y}`
}

// Полето „наемател" пази и плейсхолдъри — „— (WIP)", тире, празно. Те НЕ са
// наематели: ако се броят за такива, заетостта излиза 100 %, а имот в ремонт
// влиза в просрочията с наем, който никой не дължи. (Същият капан има и
// публичният каталог — там непразното поле скрива обявата.)
const PLACEHOLDER = /^[\s—–-]*(\(?\s*wip\s*\)?)?[\s—–-]*$/i
const hasTenant = (p) => {
  const t = String(p['наемател'] || '').trim()
  return !!t && !PLACEHOLDER.test(t)
}

// Статусът е дума + цвят, никога само цвят.
function statusOf(p) {
  const rent = Number(p['наем'] || 0)
  const paid = Number(p.paid_amount || 0)
  if (!hasTenant(p)) return { kind: 'free', label: 'Свободен' }
  if (p.prepaid)                return { kind: 'paid', label: 'Предплатен' }
  if (paid <= 0)                return { kind: 'due',  label: 'Чака плащане' }
  if (paid + 0.01 < rent)       return { kind: 'part', label: `Частично · ${fmt(paid)} €` }
  const how = p.manual_payment ? 'в брой' : 'от банката'
  return { kind: 'paid', label: `Платен · ${how}` }
}

export default function RentPulse({ API, onNavigate }) {
  const [data, setData] = useState(null)
  const [err, setErr]   = useState(null)

  useEffect(() => {
    apiFetch(`${API}/api/properties/rent-status`)
      .then(r => r.json())
      .then(d => setData(d && Array.isArray(d.properties) ? d : null))
      .catch(e => setErr(e.message))
  }, [API])

  if (err || !data) return null

  const props = data.properties
  const let_  = props.filter(hasTenant)

  const charged  = let_.reduce((s, p) => s + Number(p['наем'] || 0), 0)
  const collected = let_.reduce((s, p) => s + Math.min(Number(p.paid_amount || 0), Number(p['наем'] || 0)), 0)
  const overdue   = let_.filter(p => !p.prepaid && Number(p.paid_amount || 0) + 0.01 < Number(p['наем'] || 0))
  const overdueSum = overdue.reduce((s, p) => s + (Number(p['наем'] || 0) - Number(p.paid_amount || 0)), 0)
  const free      = props.filter(p => !hasTenant(p))
  const pct       = charged > 0 ? (collected / charged) * 100 : 0
  const occupancy = props.length ? (let_.length / props.length) * 100 : 0

  const paidCount = let_.length - overdue.length

  // Сортиране: първо това, което иска действие
  const order = { due: 0, part: 1, free: 2, paid: 3 }
  const rows = [...props].sort((a, b) => {
    const d = order[statusOf(a).kind] - order[statusOf(b).kind]
    return d !== 0 ? d : Number(b['наем'] || 0) - Number(a['наем'] || 0)
  })

  const go = (tab) => onNavigate && onNavigate(tab)

  return (
    <section className="rp">
      <div className="rp-kpis">
        <div className="rp-kpi"><span className="rp-rule" style={{ background: 'var(--page-fg)' }} />
          <div className="rp-eyebrow">Начислен наем</div>
          <div className="rp-value">{fmt(charged)} €</div>
          <div className="rp-sub">{props.length} имота · {let_.length} отдадени</div>
        </div>
        <div className="rp-kpi"><span className="rp-rule" style={{ background: 'var(--pos)' }} />
          <div className="rp-eyebrow">Постъпило</div>
          <div className="rp-value">{fmt(collected)} €</div>
          <div className="rp-sub" style={{ color: 'var(--pos)' }}>
            {pct.toFixed(1)} % · {paidCount} от {let_.length} плащания
          </div>
        </div>
        <div className="rp-kpi"><span className="rp-rule" style={{ background: 'var(--neg)' }} />
          <div className="rp-eyebrow">Просрочено</div>
          <div className="rp-value">{fmt(overdueSum)} €</div>
          <div className="rp-sub" style={{ color: overdue.length ? 'var(--neg)' : 'var(--muted)' }}>
            {overdue.length ? `${overdue.length} наематели` : 'няма просрочия'}
          </div>
        </div>
        <div className="rp-kpi"><span className="rp-rule" style={{ background: 'var(--accent)' }} />
          <div className="rp-eyebrow">Заетост</div>
          <div className="rp-value">{occupancy.toFixed(1)} %</div>
          {/* Обхватът е наемният цикъл (/rent-status), не целият портфейл —
              имоти без наемен запис не влизат. Затова знаменателят е изписан. */}
          <div className="rp-sub">
            {free.length
              ? `${free.length} свободни от ${props.length} · ${free[0]['адрес']}`
              : `всички ${props.length} отдадени`}
          </div>
        </div>
      </div>

      <div className="rp-grid">
        <div className="rp-card">
          <div className="rp-card-head">
            <h3 className="rp-h">Кой е платил</h3>
            <span className="rp-meta">{bgMonth(data.month)}</span>
          </div>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr><th>Имот</th><th>Наемател</th><th className="ta-r">Наем</th><th className="ta-r">Статус</th></tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const st = statusOf(p)
                  return (
                    <tr key={p.id} data-st={st.kind}>
                      <td className="rp-addr">{p['адрес']}</td>
                      <td className="rp-tenant">{hasTenant(p) ? p['наемател'] : '— свободен'}</td>
                      <td className="ta-r rp-num">{Number(p['наем']) ? fmt(p['наем'], 2) : '—'}</td>
                      <td className="ta-r"><span className={`rp-pill rp-${st.kind}`}>{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rp-action">
          <div className="rp-eyebrow rp-eyebrow-ink">Изисква действие</div>
          {overdue.length === 0 && free.length === 0 && (
            <div className="rp-act-empty">Нищо не чака теб този месец.</div>
          )}
          {overdue.slice(0, 5).map(p => (
            <div key={p.id} className="rp-act">
              <span className="rp-dot" style={{ background: 'var(--neg)' }} />
              <div>
                <div className="rp-act-t">{p['адрес']}</div>
                <div className="rp-act-s">
                  {p['наемател']} · остават {fmt(Number(p['наем']) - Number(p.paid_amount || 0), 2)} €
                </div>
              </div>
            </div>
          ))}
          {free.slice(0, 3).map(p => (
            <div key={p.id} className="rp-act">
              <span className="rp-dot" style={{ background: 'var(--accent)' }} />
              <div>
                <div className="rp-act-t">{p['адрес']}</div>
                <div className="rp-act-s">свободен — {p.published ? 'обявата е публикувана' : 'няма обява'}</div>
              </div>
            </div>
          ))}
          {(overdue.length > 0 || free.length > 0) && (
            <button className="rp-act-btn" onClick={() => go(overdue.length ? 'tenants' : 'portfolio')}>
              {overdue.length ? 'Виж наемателите' : 'Виж имотите'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
