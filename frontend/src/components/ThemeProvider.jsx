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

// Премиум шрифтове (Fraunces / Hanken / Space Mono) — заредени веднъж глобално,
// за да работят темите които ги ползват из целия shell (не само на login).
function ensureFonts() {
  if (document.querySelector('link[data-skygfont]')) return
  const pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com'; pre1.setAttribute('data-skygfont', '1')
  const pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous'; pre2.setAttribute('data-skygfont', '1')
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.setAttribute('data-skygfont', '1')
  css.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap'
  document.head.append(pre1, pre2, css)
}

export function ThemeProvider({ children, activeTab }) {
  const [picked, setPicked] = useState(() => localStorage.getItem(STORAGE_KEY) || 'current')
  // Bloomberg-auto за финансови табове — OPT-IN (default OFF). Преди беше ON по
  // подразбиране, което насилваше Bloomberg на Dashboard и правеше избора от
  // picker-а да изглежда счупен (effective оставаше bloomberg каквото и да избереш).
  const [financeAuto, setFinanceAuto] = useState(() => {
    const raw = localStorage.getItem(FINANCE_AUTO_KEY)
    return raw === null ? false : raw === '1'
  })

  const effective = (financeAuto && FINANCE_TABS.has(activeTab)) ? 'bloomberg' : picked

  useEffect(() => { ensureFonts() }, [])

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
    if (!THEMES[name]) return
    setPicked(name)
    // Изричният избор винаги печели — изключваме Bloomberg-auto, за да се
    // приложи избраната тема веднага (иначе на финансов таб остава bloomberg).
    setFinanceAuto(false)
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
