import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from './ThemeProvider'
import { THEMES, THEME_ORDER } from '../theme'

export default function ThemePicker() {
  const { picked, effective, isFinanceAuto, financeAuto, setTheme, toggleFinanceAuto } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = THEMES[effective] || THEMES.current

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={`Тема: ${current.label}${isFinanceAuto ? ' (auto за финанси)' : ''}`}
        className="text-xs px-2 py-1 rounded transition-colors flex items-center gap-1.5"
        style={{
          background: open ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: 'var(--shell-fg)'
        }}
      >
        <span style={{ fontSize: '14px' }}>{current.icon}</span>
        <span className="hidden sm:inline">{current.label}</span>
        {isFinanceAuto && <span className="text-[9px] opacity-60">auto</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-md shadow-lg z-50 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)' }}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Визия
          </div>
          {THEME_ORDER.map(name => {
            const t = THEMES[name]
            const isActive = picked === name
            return (
              <button
                key={name}
                onClick={() => { setTheme(name); setOpen(false) }}
                className="w-full px-3 py-2 flex items-center gap-3 text-left transition-colors"
                style={{
                  background: isActive ? 'rgba(99,102,241,0.10)' : 'transparent',
                  color: 'var(--page-fg)',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: '16px' }}>{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{t.hint}</div>
                </div>
                {isActive && (
                  <span className="text-[10px]" style={{ color: 'var(--accent)' }}>●</span>
                )}
              </button>
            )
          })}
          <div className="border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <label
              className="w-full px-3 py-2.5 flex items-center gap-2 cursor-pointer text-sm"
              style={{ color: 'var(--page-fg)' }}
            >
              <input
                type="checkbox"
                checked={financeAuto}
                onChange={toggleFinanceAuto}
                className="accent-current"
              />
              <span className="flex-1">Bloomberg auto за финанси</span>
            </label>
            <div className="px-3 pb-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Dashboard, Анализ, Инвестиции, Бюджет, Кредити, История
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
