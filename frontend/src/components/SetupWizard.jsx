import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

// Welcome wizard при първи вход — клиентът избира как работи, а ние конфигурираме
// SaaS-а за сценария (entity_type). Показва се само за свеж акаунт (без избор и
// без имоти). Записва setup_done=true → не се показва повече.

const SCENARIOS = [
  { id: 'individual', icon: '👤', title: 'Физическо лице', vat: false,
    desc: 'Отдавам имоти под наем като частно лице. Без фактури — данъкът се декларира веднъж годишно по чл.50.' },
  { id: 'individual_vat', icon: '🧾', title: 'Физическо лице по ДДС', vat: true,
    desc: 'Частно лице, но регистриран по ДДС — издавам фактури с ДДС + декларация чл.50.' },
  { id: 'company', icon: '🏢', title: 'Фирма', vat: false,
    desc: 'Управлявам наеми през фирма (ЕООД/ООД) — издавам фактури, водя счетоводство.' },
  { id: 'agency', icon: '🏛️', title: 'Агенция', vat: false,
    desc: 'Управлявам имоти на други собственици. Нужен е план Agency (мулти-собственик, white-label).' },
]

export default function SetupWizard({ API = '', onDone }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch(`${API}/api/onboarding`).then(r => r.json())
      .then(d => { if (d && !d.setup_done && !d.has_property) setShow(true) }).catch(() => {})
  }, [])

  if (!show) return null

  const put = (body, entity_type) =>
    apiFetch(`${API}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(() => {
        setSaving(false); setShow(false)
        if (onDone) onDone(entity_type)
        window.dispatchEvent(new CustomEvent('skyrent:onboarding-refresh'))
      }).catch(() => { setSaving(false); setShow(false) })

  const choose = (s) => {
    setSaving(true)
    // entity_type: company за фирма/агенция; individual за двата физ. варианта.
    const entity_type = (s.id === 'company' || s.id === 'agency') ? 'company' : 'individual'
    if (s.vat) {
      // ДДС → merge vat_rate в съществуващия issuer (да не изтрием името)
      apiFetch(`${API}/api/settings`).then(r => r.json())
        .then(cur => put({ entity_type, setup_done: true, issuer: { ...(cur.issuer || {}), vat_rate: '20' } }, entity_type))
        .catch(() => put({ entity_type, setup_done: true }, entity_type))
    } else {
      put({ entity_type, setup_done: true }, entity_type)
    }
  }

  const skip = () => {
    apiFetch(`${API}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setup_done: true }) })
      .finally(() => { setShow(false); if (onDone) onDone('company') })
  }

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        <div style={S.eyebrow}>Добре дошли в Skyrent°</div>
        <h1 style={S.h1}>Как работите?</h1>
        <p style={S.sub}>Изберете сценария си — ще настроим Skyrent точно за него. Може да го смените после от Настройки.</p>

        <div style={S.grid}>
          {SCENARIOS.map(s => (
            <button key={s.id} disabled={saving} onClick={() => choose(s)} style={S.scenario}>
              <div style={S.icon}>{s.icon}</div>
              <div style={S.sTitle}>{s.title}</div>
              <div style={S.sDesc}>{s.desc}</div>
            </button>
          ))}
        </div>

        <button onClick={skip} style={S.skip}>Пропусни — ще реша после</button>
      </div>
    </div>
  )
}

const BRASS = '#c9a24b'
const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,20,18,.88)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto',
    fontFamily: "'Manrope', system-ui, sans-serif" },
  card: { width: '100%', maxWidth: 640, background: '#fff', borderRadius: 20, padding: '32px 28px',
    boxShadow: '0 30px 80px -30px rgba(0,0,0,.5)' },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: BRASS, marginBottom: 6 },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 600, color: '#15151e', margin: '0 0 6px' },
  sub: { fontSize: 14.5, color: '#6b7280', margin: '0 0 22px', lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 },
  scenario: { all: 'unset', cursor: 'pointer', boxSizing: 'border-box', textAlign: 'left', background: '#f7f8fa',
    border: '1.5px solid #e6e8ec', borderRadius: 14, padding: '16px 16px', transition: '.16s' },
  icon: { fontSize: 26, marginBottom: 8 },
  sTitle: { fontWeight: 700, fontSize: 15.5, color: '#15151e', marginBottom: 5 },
  sDesc: { fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 },
  skip: { all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', marginTop: 18,
    fontSize: 13, fontWeight: 600, color: '#9aa0aa' },
}
