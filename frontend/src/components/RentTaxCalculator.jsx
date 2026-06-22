import React, { useEffect, useMemo, useState } from 'react'

// Публичен SEO инструмент (БЕЗ login) — /kalkulator-naem.
// Калкулатор за данък върху доход от наем за ФИЗИЧЕСКИ ЛИЦА в България.
// Цел: органичен трафик ("калкулатор данък наем") → CTA към регистрация.
//
// Данъчна логика (ЗДДФЛ, физически лица):
//   облагаема основа = брутен наем − 10% нормативно признати разходи
//   данък = облагаема основа × 10%  →  ефективно 9% върху брутния наем
// Тримесечни авансови вноски за Q1–Q3; за Q4 няма аванс (изравнява се с
// годишната данъчна декларация). Ориентировъчно — не е данъчен съвет.

const BRASS = '#b8902f'
const fmt = (n) => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function RentTaxCalculator() {
  const [monthly, setMonthly] = useState('')

  useEffect(() => {
    document.title = 'Калкулатор данък наем 2026 — физически лица | Skyrent'
    const setMeta = (name, content) => {
      let el = document.head.querySelector(`meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }
    setMeta('description', 'Безплатен калкулатор за данък върху доход от наем в България за физически лица. 10% данък върху облагаемата основа след 10% нормативно признати разходи (≈9% ефективно). Изчисли годишен данък и тримесечни вноски.')
    // JSON-LD за rich резултат
    let ld = document.getElementById('rt-ld')
    if (!ld) { ld = document.createElement('script'); ld.id = 'rt-ld'; ld.type = 'application/ld+json'; document.head.appendChild(ld) }
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebApplication',
      name: 'Калкулатор данък наем', applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      description: 'Изчисляване на данък върху доход от наем за физически лица в България.',
    })
  }, [])

  const r = useMemo(() => {
    const m = Math.max(0, Number(monthly) || 0)
    const gross = m * 12
    const deductible = gross * 0.10          // нормативно признати разходи
    const base = gross - deductible          // облагаема основа (90%)
    const tax = base * 0.10                  // 10% данък
    const net = gross - tax
    const effective = gross > 0 ? (tax / gross) * 100 : 0
    const quarterly = tax / 4
    return { gross, deductible, base, tax, net, effective, quarterly }
  }, [monthly])

  const has = Number(monthly) > 0

  return (
    <div style={S.wrap}>
      <div style={S.inner}>
        <a href="/" style={S.back}>← Skyrent</a>

        <header style={S.head}>
          <div style={S.eyebrow}>Безплатен инструмент</div>
          <h1 style={S.h1}>Калкулатор данък наем</h1>
          <p style={S.sub}>За физически лица в България · данъчна 2026 г.</p>
        </header>

        <div style={S.card}>
          <label style={S.label}>Месечен наем</label>
          <div style={S.inputWrap}>
            <input type="number" inputMode="decimal" min="0" value={monthly}
              onChange={e => setMonthly(e.target.value)} placeholder="напр. 800" style={S.input} autoFocus />
            <span style={S.unit}>€ / мес.</span>
          </div>

          {has && (
            <div style={S.results}>
              <Row label="Годишен брутен наем" value={`${fmt(r.gross)} €`} />
              <Row label="Нормативно признати разходи (10%)" value={`− ${fmt(r.deductible)} €`} muted />
              <Row label="Облагаема основа" value={`${fmt(r.base)} €`} muted />
              <div style={S.divider} />
              <Row label="Дължим годишен данък (10%)" value={`${fmt(r.tax)} €`} strong />
              <Row label="Ефективна ставка" value={`${r.effective.toFixed(1)}%`} muted />
              <Row label="≈ Тримесечна вноска" value={`${fmt(r.quarterly)} €`} muted />
              <div style={S.divider} />
              <Row label="Нетен доход след данък" value={`${fmt(r.net)} €`} accent />
            </div>
          )}
          {!has && <div style={S.placeholder}>Въведи месечния наем, за да видиш данъка.</div>}
        </div>

        {/* Как се изчислява (SEO + доверие) */}
        <section style={S.explain}>
          <h2 style={S.h2}>Как се изчислява данъкът върху наем?</h2>
          <p style={S.p}>
            Физическите лица в България плащат <b>10% данък</b> върху дохода от наем. Преди това
            законът признава <b>10% нормативни разходи</b>, тоест облагаемата основа е 90% от наема.
            Така <b>ефективната ставка е ≈9%</b> върху брутния наем.
          </p>
          <p style={S.p}>
            Данъкът се внася на <b>тримесечни авансови вноски</b> (за Q1–Q3; за последното
            тримесечие няма аванс — изравнява се с годишната данъчна декларация до 30 април).
            Ако отдаваш на <b>фирма</b>, наемателят удържа авансовия данък вместо теб.
          </p>
          <p style={S.disclaimer}>
            ⚠️ Ориентировъчно изчисление, не е данъчен съвет. За точна сметка се консултирай със счетоводител.
          </p>
        </section>

        {/* Funnel CTA */}
        <section style={S.cta}>
          <h2 style={S.ctaTitle}>Управлявай наемите си автоматично</h2>
          <p style={S.ctaSub}>
            Skyrent води приходите, разходите и фактурите вместо теб — и изчислява данъците автоматично.
            Безплатно до 5 имота.
          </p>
          <a href="/" style={S.ctaBtn}>Започни безплатно →</a>
        </section>

        <div style={S.foot}>Powered by <b style={{ color: '#15151e' }}>Skyrent</b>°</div>
      </div>
    </div>
  )
}

function Row({ label, value, muted, strong, accent }) {
  return (
    <div style={S.row}>
      <span style={{ ...S.rowLabel, ...(muted ? { color: '#9aa0aa' } : {}) }}>{label}</span>
      <span style={{
        ...S.rowVal,
        ...(muted ? { color: '#6b7280', fontWeight: 500 } : {}),
        ...(strong ? { fontSize: 19, color: '#15151e' } : {}),
        ...(accent ? { color: BRASS, fontSize: 19 } : {}),
      }}>{value}</span>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100vh', background: '#f4f5f8', fontFamily: "'Manrope', system-ui, sans-serif", padding: '28px 16px' },
  inner: { maxWidth: 560, margin: '0 auto' },
  back: { display: 'inline-block', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 18 },
  head: { marginBottom: 18 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: BRASS, textTransform: 'uppercase' },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 600, color: '#15151e', margin: '6px 0 4px' },
  sub: { fontSize: 14, color: '#6b7280', margin: 0 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px -24px rgba(0,0,0,.3)', padding: '24px 22px', marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  input: { width: '100%', border: '1px solid #d8dbe2', borderRadius: 12, padding: '14px 70px 14px 16px', fontSize: 22, fontWeight: 600, fontFamily: 'inherit', color: '#15151e', boxSizing: 'border-box' },
  unit: { position: 'absolute', right: 16, color: '#9aa0aa', fontSize: 14, fontWeight: 600, pointerEvents: 'none' },
  results: { marginTop: 20 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', gap: 12 },
  rowLabel: { fontSize: 14, color: '#374151' },
  rowVal: { fontSize: 15, fontWeight: 700, color: '#15151e', whiteSpace: 'nowrap' },
  divider: { height: 1, background: '#eceef2', margin: '8px 0' },
  placeholder: { marginTop: 18, textAlign: 'center', color: '#9aa0aa', fontSize: 14, padding: '10px 0' },
  explain: { background: '#fff', borderRadius: 16, padding: '22px', marginBottom: 20, boxShadow: '0 10px 40px -28px rgba(0,0,0,.25)' },
  h2: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 600, color: '#15151e', margin: '0 0 10px' },
  p: { fontSize: 14.5, color: '#4b5563', lineHeight: 1.65, margin: '0 0 12px' },
  disclaimer: { fontSize: 12.5, color: '#9aa0aa', lineHeight: 1.55, margin: '4px 0 0' },
  cta: { background: '#15151e', borderRadius: 16, padding: '26px 22px', textAlign: 'center', marginBottom: 24 },
  ctaTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 8px' },
  ctaSub: { fontSize: 14, color: '#c8cad2', lineHeight: 1.6, margin: '0 0 18px' },
  ctaBtn: { display: 'inline-block', background: `linear-gradient(180deg,#caa24a,${BRASS})`, color: '#1a1509', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '12px 28px', borderRadius: 999 },
  foot: { textAlign: 'center', fontSize: 12.5, color: '#9aa0aa' },
}
