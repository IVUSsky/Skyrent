import React from 'react'
import { SkyLogo } from './LandingPage'

// Обща навигация за публичната част на сайта (блог, SEO, ремонти, инструменти).
// Стил: ink + brass като landing-а. Sticky, с активна страница в brass.
// „Начало" сочи /?site=1 — показва landing-а дори когато потребителят е логнат.

const LINKS = [
  ['Начало', '/?site=1', '/'],
  ['Блог', '/blog', '/blog'],
  ['Ремонти', '/remonti', '/remonti'],
  ['Свободни имоти', '/imoti', '/imoti'],
  ['Договор за наем', '/dogovor-naem', '/dogovor-naem'],
  ['Калкулатор', '/kalkulator-naem', '/kalkulator-naem'],
]

export default function PublicNav({ active = '' }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(21,21,30,.92)', backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(236,231,220,.09)',
    }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto', padding: '14px clamp(16px, 4vw, 28px)',
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <a href="/?site=1" aria-label="Начало" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <SkyLogo height={24} />
        </a>
        <div style={{
          display: 'flex', gap: 4, alignItems: 'center', flex: 1,
          overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {LINKS.map(([label, href, key]) => {
            const isActive = active === key
            return (
              <a key={key} href={href} style={{
                whiteSpace: 'nowrap', textDecoration: 'none',
                fontSize: 13.5, fontWeight: isActive ? 800 : 600,
                color: isActive ? '#e0bd6e' : 'rgba(236,231,220,.72)',
                padding: '7px 11px', borderRadius: 999,
                background: isActive ? 'rgba(224,189,110,.10)' : 'transparent',
              }}>
                {label}
              </a>
            )
          })}
        </div>
        <a href="/" style={{
          flexShrink: 0, textDecoration: 'none', color: '#15151e',
          background: 'linear-gradient(135deg, #c9a24b, #e0bd6e)',
          padding: '9px 18px', borderRadius: 999, fontWeight: 800, fontSize: 13.5,
        }}>
          Вход
        </a>
      </div>
    </nav>
  )
}
