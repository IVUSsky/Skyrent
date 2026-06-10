import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { THEMES, FINANCE_TABS } from '../theme'

const STORAGE_KEY      = 'skyrent_theme'
const FINANCE_AUTO_KEY = 'skyrent_theme_finance_auto'

const ThemeContext = createContext(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

function applyVars(themeName) {
  const theme = THEMES[themeName] || THEMES.current
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.setAttribute('data-theme', themeName)
}

export function ThemeProvider({ children, activeTab }) {
  const [picked, setPicked] = useState(() => localStorage.getItem(STORAGE_KEY) || 'current')
  const [financeAuto, setFinanceAuto] = useState(() => {
    const raw = localStorage.getItem(FINANCE_AUTO_KEY)
    return raw === null ? true : raw === '1'
  })

  const effective = (financeAuto && FINANCE_TABS.has(activeTab)) ? 'bloomberg' : picked

  useEffect(() => {
    applyVars(effective)
  }, [effective])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, picked)
  }, [picked])

  useEffect(() => {
    localStorage.setItem(FINANCE_AUTO_KEY, financeAuto ? '1' : '0')
  }, [financeAuto])

  const setTheme = useCallback((name) => {
    if (THEMES[name]) setPicked(name)
  }, [])

  const toggleFinanceAuto = useCallback(() => setFinanceAuto(v => !v), [])

  return (
    <ThemeContext.Provider value={{
      picked,
      effective,
      isFinanceAuto: financeAuto && FINANCE_TABS.has(activeTab),
      financeAuto,
      setTheme,
      toggleFinanceAuto,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
