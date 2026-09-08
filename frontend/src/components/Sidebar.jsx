import React, { useEffect, useState, useCallback } from 'react'
import { groupTabs } from '../menuTabs'

const COLLAPSE_KEY = 'skyrent_ui_sidebar'

// Знакът на Skyrent — покрив и стълб, брас на ink, само в едно тегло.
// (Предложение от визуалната система; истинският SVG/favicon се прави, ако мине.)
function Mark({ size = 26 }) {
  const w = size >= 26 ? 2.6 : 2.8
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M6 22.5 20 8l14 14.5" stroke="#E0BD6E" strokeWidth={w} strokeLinejoin="round" />
      <path d="M11 24v10h18V24" stroke="#F4F1EA" strokeWidth={size >= 26 ? 1.8 : 2} strokeLinejoin="round" />
    </svg>
  )
}

function initials(name) {
  if (!name) return '·'
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '·'
}

/**
 * Skyrent сайдбар — ляв групиран рейл вместо хоризонталния хедър.
 * Рендира се само под темата `skyrent` и само от 900px нагоре (виж App.jsx);
 * под 1280px пада автоматично в колапсиран 62px рейл само с икони.
 */
export default function Sidebar({ tabs, activeTab, onSelect, labelFor, userName, orgName, planLabel, onLogout, brandName }) {
  const [manual, setManual] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1279px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)')
    const onChange = e => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const collapsed = manual || narrow
  const toggle = useCallback(() => {
    setManual(v => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }, [])

  const groups = groupTabs(tabs)

  const row = (tab) => {
    const active = tab.id === activeTab
    const label = labelFor ? labelFor(tab) : tab.name
    return (
      <button
        key={tab.id}
        onClick={() => onSelect(tab.id)}
        title={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
        className="sky-nav-row"
        data-active={active ? '1' : undefined}
      >
        <span className="sky-nav-icon" aria-hidden="true">{tab.icon}</span>
        {!collapsed && <span className="sky-nav-label">{label}</span>}
      </button>
    )
  }

  return (
    <aside className="sky-aside" data-collapsed={collapsed ? '1' : undefined}>
      <div className="sky-brand">
        {collapsed ? (
          // Сгънат: самият знак разгъва менюто (няма къде другаде да седне бутонът)
          <button onClick={toggle} title="Разгъни менюто" className="sky-brand-link">
            <Mark size={22} />
          </button>
        ) : (
          <>
            {/* Логото води към публичния сайт — както в хоризонталния хедър */}
            <a href="/?site=1" title="Към сайта" className="sky-brand-link">
              <Mark size={26} />
              <span className="sky-brand-name">{brandName || 'Skyrent'}</span>
            </a>
            <button onClick={toggle} title="Сгъни менюто" className="sky-collapse">«</button>
          </>
        )}
      </div>

      <nav className="sky-nav">
        {groups.map(g => (
          <div key={g.id}>
            {!collapsed && <div className="sky-nav-group">{g.title}</div>}
            <div className="sky-nav-items">{g.items.map(row)}</div>
          </div>
        ))}
      </nav>

      <div className="sky-profile">
        <span className="sky-avatar" aria-hidden="true">{initials(userName)}</span>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sky-profile-name">{userName || '—'}</div>
            <div className="sky-profile-meta">
              {[orgName, planLabel].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        )}
        {!collapsed && (
          <button onClick={onLogout} title="Изход" className="sky-logout">Изход</button>
        )}
      </div>
    </aside>
  )
}
