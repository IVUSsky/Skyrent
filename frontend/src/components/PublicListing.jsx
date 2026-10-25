import React, { useEffect, useRef, useState } from 'react'
import { setCanonical } from '../lib/seo'
import { parseVideo } from '../lib/videoEmbed'

// Публична страница на обява под наем — БЕЗ login. Зарежда се при URL ?listing=<org>-<id>.
// Лек, премиум вид (brass акцент), снимки + цена + детайли + форма за запитване.

const PT_LABEL = { '2-стаен': 'Двустаен', '3-стаен': 'Тристаен', '1-стаен': 'Едностаен' }

// Разпознаването на линка живее в lib/videoEmbed.js — ползва се и от формата
// при въвеждане, за да предупреждава веднага при негоден адрес.

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
  const [zoom, setZoom] = useState(false)   // отворен лайтбокс
  const [mag, setMag] = useState(null)      // точката, около която е увеличено
  const touchX = useRef(null)
  const swiped = useRef(false)   // плъзгането не бива да мине и за натискане

  // Стрелките и Esc работят само докато лайтбоксът е отворен, а страницата
  // отдолу не скролира — иначе на телефон пръстът мести обявата, не снимката.
  useEffect(() => {
    if (!zoom) return
    const n = (data?.photo_ids || []).length
    const step = d => { setMag(null); if (n) setActive(i => (i + d + n) % n) }
    const onKey = e => {
      if (e.key === 'Escape') { setZoom(false); setMag(null) }
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [zoom, data])

  useEffect(() => {
    if (!org || !pid) { setErr(true); return }
    setCanonical(`/obiava/${org}-${pid}`)
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
  const photoUrl = id => `${API}/api/public/listings/${org}/${pid}/photo/${id}`
  const step = d => { setMag(null); setActive(i => (i + d + photos.length) % photos.length) }

  // Натискане върху отворената снимка я увеличава около мястото, където е
  // натиснато; следващото натискане я връща цяла.
  const magnify = e => {
    if (swiped.current) { swiped.current = false; return }
    if (mag) { setMag(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setMag({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }

  const swipe = {
    onTouchStart: e => { touchX.current = e.touches[0].clientX; swiped.current = false },
    onTouchEnd: e => {
      const x0 = touchX.current
      touchX.current = null
      if (x0 == null || mag || photos.length < 2) return
      const dx = e.changedTouches[0].clientX - x0
      if (Math.abs(dx) > 40) { swiped.current = true; step(dx < 0 ? 1 : -1) }
    },
  }

  return (
    <div style={S.wrap}>
      <a href="/imoti" style={{ ...S.foot, marginTop: 0, marginBottom: 14, textDecoration: 'none', color: '#6b7280' }}>← Всички обяви</a>
      <div style={S.shell}>
        {/* Gallery */}
        <div style={S.gallery}>
          {photos.length ? (
            <>
              <div style={S.heroWrap} {...swipe}
                onClick={() => { if (swiped.current) { swiped.current = false; return } setZoom(true) }}
                title="Натисни за цялата снимка">
                <img src={photoUrl(photos[active])} alt="" style={S.hero} />
                <div style={S.heroHint}>⤢ Увеличи</div>
              </div>
              {photos.length > 1 && (
                <div style={S.thumbs}>
                  {photos.map((id, i) => (
                    <img key={id} src={photoUrl(id)} alt=""
                      onClick={() => { setMag(null); setActive(i) }}
                      style={{ ...S.thumb, ...(i === active ? S.thumbOn : {}) }} />
                  ))}
                </div>
              )}
            </>
          ) : <div style={S.noPhoto}>🏠 Без снимки</div>}
          {(() => {
            const v = parseVideo(data.video)
            if (!v) return null
            // Вертикалните клипове (Shorts) се ограничават по височина, иначе
            // заемат цял екран на телефон и обявата изчезва под тях.
            return (
              <div style={{
                position: 'relative', background: '#000',
                paddingTop: `${v.ratio}%`,
                ...(v.vertical ? { maxHeight: '70vh', paddingTop: 0, height: '70vh' } : {}),
              }}>
                <iframe src={v.src} title="Видео обиколка" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
              </div>
            )
          })()}
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
      {!data.white_label && <div style={S.foot}>Powered by <b style={{ color: '#1a1a2e' }}>Skyrent</b>°</div>}

      {/* Лайтбокс — цялата снимка, не изрязаната. Натискане навън затваря. */}
      {zoom && photos.length > 0 && (
        <div style={S.lb} onClick={() => { setZoom(false); setMag(null) }}>
          {photos.length > 1 && <div style={S.lbCount}>{active + 1} / {photos.length}</div>}
          <button style={S.lbX} aria-label="Затвори"
            onClick={e => { e.stopPropagation(); setZoom(false); setMag(null) }}>×</button>
          {photos.length > 1 && (
            <button style={{ ...S.lbArrow, left: 12 }} aria-label="Предишна"
              onClick={e => { e.stopPropagation(); step(-1) }}>‹</button>
          )}
          <img src={photoUrl(photos[active])} alt="" {...swipe}
            onClick={e => { e.stopPropagation(); magnify(e) }}
            style={{
              ...S.lbImg,
              cursor: mag ? 'zoom-out' : 'zoom-in',
              transform: mag ? 'scale(2.4)' : 'none',
              transformOrigin: mag ? `${mag.x}% ${mag.y}%` : 'center',
            }} />
          {photos.length > 1 && (
            <button style={{ ...S.lbArrow, right: 12 }} aria-label="Следваща"
              onClick={e => { e.stopPropagation(); step(1) }}>›</button>
          )}
        </div>
      )}
    </div>
  )
}

const BRASS = '#b8902f'
const S = {
  wrap: { minHeight: '100vh', background: '#f4f5f8', fontFamily: "'Manrope', system-ui, sans-serif", padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  shell: { width: '100%', maxWidth: 960, background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px -30px rgba(0,0,0,.25)', display: 'grid', gridTemplateColumns: '1.1fr 1fr' },
  gallery: { background: '#0f0f17', display: 'flex', flexDirection: 'column' },
  heroWrap: { position: 'relative', cursor: 'zoom-in' },
  hero: { width: '100%', height: 360, objectFit: 'cover', display: 'block' },
  heroHint: { position: 'absolute', right: 10, bottom: 10, background: 'rgba(0,0,0,.45)', color: '#fff', fontSize: 12, borderRadius: 8, padding: '4px 9px', pointerEvents: 'none', backdropFilter: 'blur(2px)' },
  lb: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,8,12,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' },
  lbImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, transition: 'transform .25s ease', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
  lbX: { position: 'absolute', top: 14, right: 16, width: 40, height: 40, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 26, lineHeight: 1, cursor: 'pointer' },
  lbCount: { position: 'absolute', top: 24, left: 22, color: '#cfd0d8', fontSize: 13, letterSpacing: '.06em' },
  lbArrow: { position: 'absolute', top: '50%', marginTop: -23, width: 46, height: 46, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer' },
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
