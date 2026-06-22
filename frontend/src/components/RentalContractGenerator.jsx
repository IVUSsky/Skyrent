import React, { useEffect, useState } from 'react'

// Публичен SEO инструмент (БЕЗ login) — /dogovor-naem.
// Генератор на „Договор за наем" (образец) → PDF от backend. Силен SEO термин
// ("договор за наем образец") + showcase на продукта → CTA към регистрация.

const BRASS = '#b8902f'

const FIELDS = [
  { group: 'Наемодател', items: [
    ['landlord_name', 'Име / фирма *', 'Иван Петров'],
    ['landlord_egn', 'ЕГН / ЕИК', '7501011234'],
    ['landlord_address', 'Адрес', 'гр. София, ул. ...'],
  ] },
  { group: 'Наемател', items: [
    ['tenant_name', 'Име *', 'Георги Димитров'],
    ['tenant_egn', 'ЕГН', '8203054321'],
    ['tenant_address', 'Адрес', 'гр. София, ул. ...'],
  ] },
  { group: 'Имот и условия', items: [
    ['property_address', 'Адрес на имота *', 'гр. София, ул. Тест 5, ап. 3'],
    ['property_desc', 'Описание (по желание)', 'двустаен, 65 м², обзаведен'],
    ['rent', 'Месечен наем (€)', '800', 'number'],
    ['deposit', 'Депозит (€)', '800', 'number'],
    ['payment_day', 'Падеж (ден от месеца)', '5', 'number'],
    ['date_from', 'Начало', '', 'date'],
    ['date_to', 'Край', '', 'date'],
    ['city', 'Град на подписване', 'София'],
    ['sign_date', 'Дата на подписване', '', 'date'],
  ] },
]

export default function RentalContractGenerator({ API = '' }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.title = 'Договор за наем — безплатен образец (PDF) | Skyrent'
    const setMeta = (name, content) => {
      let el = document.head.querySelector(`meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }
    setMeta('description', 'Безплатен генератор на договор за наем на недвижим имот по български образец. Попълни данните и свали готов PDF за минута. Без регистрация.')
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const generate = async (e) => {
    e.preventDefault()
    if (!form.landlord_name || !form.tenant_name || !form.property_address) {
      setError('Попълни наемодател, наемател и адрес на имота.'); return
    }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/public/rental-contract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Грешка') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'dogovor-naem.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.message || 'Грешка при генериране') }
    finally { setLoading(false) }
  }

  return (
    <div style={S.wrap}>
      <div style={S.inner}>
        <a href="/" style={S.back}>← Skyrent</a>
        <header style={S.head}>
          <div style={S.eyebrow}>Безплатен инструмент</div>
          <h1 style={S.h1}>Договор за наем — образец</h1>
          <p style={S.sub}>Попълни данните и свали готов PDF. Без регистрация.</p>
        </header>

        <form onSubmit={generate} style={S.card}>
          {FIELDS.map(g => (
            <div key={g.group} style={{ marginBottom: 18 }}>
              <div style={S.groupTitle}>{g.group}</div>
              <div style={S.grid}>
                {g.items.map(([k, label, ph, type]) => (
                  <div key={k} style={S.field}>
                    <label style={S.label}>{label}</label>
                    <input type={type || 'text'} value={form[k] || ''} placeholder={ph}
                      onChange={e => set(k, e.target.value)} style={S.input} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <div style={S.error}>{error}</div>}
          <button type="submit" disabled={loading} style={S.btn}>
            {loading ? 'Генериране…' : '⬇ Свали договора (PDF)'}
          </button>
          <p style={S.disclaimer}>
            ⚠️ Образец, не е правен съвет. За специфични случаи се консултирай с юрист.
          </p>
        </form>

        <section style={S.cta}>
          <h2 style={S.ctaTitle}>Управлявай договорите и наемите автоматично</h2>
          <p style={S.ctaSub}>
            Skyrent пази договорите, праща фактури, проследява плащания и напомня за изтичащи срокове.
            Безплатно до 5 имота.
          </p>
          <a href="/" style={S.ctaBtn}>Започни безплатно →</a>
        </section>

        <div style={S.foot}>Powered by <b style={{ color: '#15151e' }}>Skyrent</b>°</div>
      </div>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100vh', background: '#f4f5f8', fontFamily: "'Manrope', system-ui, sans-serif", padding: '28px 16px' },
  inner: { maxWidth: 640, margin: '0 auto' },
  back: { display: 'inline-block', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 18 },
  head: { marginBottom: 18 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: BRASS, textTransform: 'uppercase' },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 600, color: '#15151e', margin: '6px 0 4px' },
  sub: { fontSize: 14, color: '#6b7280', margin: 0 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px -24px rgba(0,0,0,.3)', padding: '22px', marginBottom: 20 },
  groupTitle: { fontSize: 13, fontWeight: 700, color: BRASS, marginBottom: 10, letterSpacing: '.03em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 },
  input: { border: '1px solid #d8dbe2', borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: '#15151e', boxSizing: 'border-box' },
  error: { color: '#dc2626', fontSize: 13, margin: '4px 0 12px' },
  btn: { width: '100%', background: `linear-gradient(180deg,#caa24a,${BRASS})`, color: '#1a1509', border: 'none', borderRadius: 999, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 6 },
  disclaimer: { fontSize: 12, color: '#9aa0aa', textAlign: 'center', margin: '12px 0 0' },
  cta: { background: '#15151e', borderRadius: 16, padding: '26px 22px', textAlign: 'center', marginBottom: 24 },
  ctaTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 21, fontWeight: 600, color: '#fff', margin: '0 0 8px' },
  ctaSub: { fontSize: 14, color: '#c8cad2', lineHeight: 1.6, margin: '0 0 18px' },
  ctaBtn: { display: 'inline-block', background: `linear-gradient(180deg,#caa24a,${BRASS})`, color: '#1a1509', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '12px 28px', borderRadius: 999 },
  foot: { textAlign: 'center', fontSize: 12.5, color: '#9aa0aa' },
}
