import React, { useEffect, useState } from 'react'

// Публична страница на обява под наем — БЕЗ login. Зарежда се при URL ?listing=<org>-<id>.
// Лек, премиум вид (brass акцент), снимки + цена + детайли + форма за запитване.

const PT_LABEL = { '2-стаен': 'Двустаен', '3-стаен': 'Тристаен', '1-стаен': 'Едностаен' }

// Само YouTube/Vimeo → embed URL. Непознат домейн → null (не вграждаме произволни
// iframe-ове = защита срещу iframe инжекция).
function videoEmbed(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\.|^m\./, '')
    if (h === 'youtube.com') { const id = u.searchParams.get('v'); if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}` }
    if (h === 'youtu.be') { const id = u.pathname.slice(1); if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}` }
    if (h === 'vimeo.com') { const id = u.pathname.split('/').filter(Boolean)[0]; if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}` }
  } catch (_) {}
  return null
}

export default function PublicListing({ param, API = '' }) {
  const [m, org, pid] = (() => {
    const x = String(param || '').split('-')
    return [null, x[0], x[1]]
  })()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [active, setActive] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [formErr, setFormErr] = useState(null)

  useEffect(() => {
    if (!org || !pid) { setErr(true); return }
    fetch(`${API}/api/public/listings/${org}/${pid}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setData(d)
        const t = (PT_LABEL[d.тип] || d.тип || 'Имот')
        const title = `${t}${d.район ? ' · ' + d.район : ''} — ${Number(d.наем || 0)}€/мес`
        const desc = (d.desc || `${t} под наем${d.район ? ' в ' + d.район : ''} — ${Number(d.наем || 0)}€/месец.`).slice(0, 180)
        const base = (API && /^https?:/.test(API)) ? API : window.location.origin
        const img = (d.photo_ids && d.photo_ids[0]) ? `${base}/api/public/listings/${org}/${pid}/photo/${d.photo_ids[0]}` : ''
        document.title = `${title} | Skyrent`
        const setMeta = (key, attr, content) => {
          if (!content) return
          let el = document.head.querySelector(`meta[${attr}="${key}"]`)
          if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
          el.setAttribute('content', content)
        }
        setMeta('description', 'name', desc)
        setMeta('og:title', 'property', title)
        setMeta('og:description', 'property', desc)
        setMeta('og:type', 'property', 'website')
        setMeta('og:image', 'property', img)
        setMeta('twitter:card', 'name', img ? 'summary_large_image' : 'summary')
        setMeta('twitter:title', 'name', title)
        setMeta('twitter:image', 'name', img)
      })
      .catch(() => setErr(true))
  }, [org, pid])

  const submit = (e) => {
    e.preventDefault()
    if (!form.name || (!form.email && !form.phone)) { setFormErr('Име и поне един контакт са задължителни'); return }
    setSending(true); setFormErr(null)
    fetch(`${API}/api/public/listings/${org}/${pid}/inquiry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).then(r => r.json()).then(d => {
      setSending(false)
      if (d.ok) setSent(true); else setFormErr(d.error || 'Грешка')
    }).catch(() => { setSending(false); setFormErr('Грешка при изпращане') })
  }

  if (err) return (
    <div style={S.wrap}><div style={S.card}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🏚️</div>
      <h1 style={S.h1}>Обявата не е намерена</h1>
      <p style={{ color: '#6b7280' }}>Възможно е да е свалена или линкът да е грешен.</p>
    </div></div>
  )
  if (!data) return <div style={{ ...S.wrap, color: '#9aa0aa' }}>Зареждане…</div>

  const photos = data.photo_ids || []
  const fmt = n => Number(n || 0).toLocaleString('bg-BG')

  return (
    <div style={S.wrap}>
      <a href="/imoti" style={{ ...S.foot, marginTop: 0, marginBottom: 14, textDecoration: 'none', color: '#6b7280' }}>← Всички обяви</a>
      <div style={S.shell}>
        {/* Gallery */}
        <div style={S.gallery}>
          {photos.length ? (
            <>
              <img src={`${API}/api/public/listings/${org}/${pid}/photo/${photos[active]}`} alt="" style={S.hero} />
              {photos.length > 1 && (
                <div style={S.thumbs}>
                  {photos.map((id, i) => (
                    <img key={id} src={`${API}/api/public/listings/${org}/${pid}/photo/${id}`} alt=""
                      onClick={() => setActive(i)}
                      style={{ ...S.thumb, ...(i === active ? S.thumbOn : {}) }} />
                  ))}
                </div>
              )}
            </>
          ) : <div style={S.noPhoto}>🏠 Без снимки</div>}
          {videoEmbed(data.video) && (
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
              <iframe src={videoEmbed(data.video)} title="Видео обиколка" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          )}
        </div>

        {/* Details */}
        <div style={S.body}>
          <div style={S.eyebrow}>Имот под наем</div>
          <h1 style={S.title}>{PT_LABEL[data.тип] || data.тип || 'Имот'}{data.район ? ` · ${data.район}` : ''}</h1>
          <div style={S.price}>{fmt(data.наем)} €<span style={S.permo}> / месец</span></div>

          <div style={S.specs}>
            {data.площ ? <span style={S.spec}>📐 {data.площ} м²</span> : null}
            {data.тип ? <span style={S.spec}>🏷 {PT_LABEL[data.тип] || data.тип}</span> : null}
            {data.адрес ? <span style={S.spec}>📍 {data.адрес}</span> : null}
          </div>

          {data.desc && <p style={S.desc}>{data.desc}</p>}

          {/* Inquiry */}
          <div style={S.inq}>
            {sent ? (
              <div style={S.sentBox}>
                <div style={{ fontSize: 30 }}>✓</div>
                <b>Запитването е изпратено!</b>
                <span style={{ color: '#6b7280', fontSize: 14 }}>Наемодателят ще се свърже с вас.</span>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div style={S.inqTitle}>Интересувам се</div>
                <input style={S.input} placeholder="Вашето име *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <input style={S.input} placeholder="Имейл" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  <input style={S.input} placeholder="Телефон" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} placeholder="Съобщение (по желание)" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
                {formErr && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{formErr}</div>}
                <button type="submit" disabled={sending} style={S.btn}>{sending ? 'Изпращане…' : 'Изпрати запитване →'}</button>
              </form>
            )}
          </div>
        </div>
      </div>
      <div style={S.foot}>Powered by <b style={{ color: '#1a1a2e' }}>Skyrent</b>°</div>
    </div>
  )
}

const BRASS = '#b8902f'
const S = {
  wrap: { minHeight: '100vh', background: '#f4f5f8', fontFamily: "'Manrope', system-ui, sans-serif", padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  shell: { width: '100%', maxWidth: 960, background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px -30px rgba(0,0,0,.25)', display: 'grid', gridTemplateColumns: '1.1fr 1fr' },
  gallery: { background: '#0f0f17', display: 'flex', flexDirection: 'column' },
  hero: { width: '100%', height: 360, objectFit: 'cover', display: 'block' },
  thumbs: { display: 'flex', gap: 6, padding: 8, overflowX: 'auto' },
  thumb: { width: 56, height: 44, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', opacity: .55, transition: '.2s' },
  thumbOn: { opacity: 1, outline: `2px solid ${BRASS}` },
  noPhoto: { color: '#6b7280', height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  body: { padding: '32px 30px' },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: BRASS, marginBottom: 10 },
  title: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 600, color: '#15151e', margin: '0 0 12px', lineHeight: 1.15 },
  price: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 700, color: BRASS },
  permo: { fontFamily: "'Manrope', sans-serif", fontSize: 15, color: '#9aa0aa', fontWeight: 500 },
  specs: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '18px 0' },
  spec: { fontSize: 13, color: '#374151', background: '#f1f2f6', borderRadius: 999, padding: '6px 12px' },
  desc: { fontSize: 14.5, color: '#4b5563', lineHeight: 1.6, margin: '4px 0 20px' },
  inq: { borderTop: '1px solid #eceef2', paddingTop: 18, marginTop: 8 },
  inqTitle: { fontWeight: 700, color: '#15151e', marginBottom: 10, fontSize: 15 },
  input: { width: '100%', border: '1px solid #d8dbe2', borderRadius: 9, padding: '10px 12px', fontSize: 14, marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { width: '100%', background: `linear-gradient(180deg,#caa24a,${BRASS})`, color: '#1a1509', border: 'none', borderRadius: 999, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  sentBox: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', color: '#16a34a', padding: '10px 0' },
  foot: { marginTop: 18, fontSize: 12.5, color: '#9aa0aa' },
}
