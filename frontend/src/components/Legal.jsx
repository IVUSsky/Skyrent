import React from 'react'
import { LEGAL } from '../legalContent'

// Публична страница за правен документ (Общи условия / Политика за поверителност).
// Сервира се от App.jsx по pubPath (/usloviya, /poveritelnost).

export default function Legal({ which }) {
  const doc = LEGAL[which]
  if (!doc) return null
  return (
    <div style={S.wrap}>
      <div style={S.inner}>
        <a href="/" style={S.back}>← {LEGAL.terms ? 'Skyrent' : 'Назад'}</a>
        <h1 style={S.h1}>{doc.title}</h1>
        <div style={S.meta}>Последна актуализация: {doc.updated}</div>
        <p style={S.intro}>{doc.intro}</p>
        {doc.sections.map((s, i) => (
          <section key={i} style={S.section}>
            <h2 style={S.h2}>{s.h}</h2>
            {s.p.map((para, j) => <p key={j} style={S.p}>{para}</p>)}
          </section>
        ))}
        <div style={S.foot}>
          <a href="/usloviya" style={S.link}>Общи условия</a>
          <span style={{ color: '#cbd2e0' }}>·</span>
          <a href="/poveritelnost" style={S.link}>Политика за поверителност</a>
        </div>
      </div>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100vh', background: '#f6f7fb', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' },
  inner: { maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 16, padding: '44px 48px', boxShadow: '0 2px 24px rgba(20,20,40,.06)' },
  back: { color: '#6b7280', textDecoration: 'none', fontSize: 14, fontWeight: 600 },
  h1: { fontSize: 30, fontWeight: 800, color: '#15151e', margin: '18px 0 6px' },
  meta: { fontSize: 13, color: '#9aa2b1', marginBottom: 22 },
  intro: { fontSize: 15, lineHeight: 1.75, color: '#3b4252', marginBottom: 10 },
  section: { marginTop: 22 },
  h2: { fontSize: 17, fontWeight: 700, color: '#15151e', margin: '0 0 8px' },
  p: { fontSize: 14.5, lineHeight: 1.7, color: '#3b4252', margin: '0 0 9px' },
  foot: { marginTop: 40, paddingTop: 20, borderTop: '1px solid #eceef3', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 },
  link: { color: '#4f46e5', textDecoration: 'none', fontWeight: 600 },
}
