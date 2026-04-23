import React, { useState, useEffect } from 'react'
import Login from './components/Login'
import Portfolio from './components/Portfolio'
import List from './components/List'
import Dashboard from './components/Dashboard'
import Loans from './components/Loans'
import Analysis from './components/Analysis'
import History from './components/History'
import Import from './components/Import'
import Tenants from './components/Tenants'
import Invoices from './components/Invoices'
import Contracts from './components/Contracts'
import Settings from './components/Settings'
import Expenses from './components/Expenses'

const API = import.meta.env.VITE_API_URL || ''

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard',      roles: ['admin'] },
  { id: 'portfolio', label: 'Портфолио',      roles: ['admin'] },
  { id: 'list',      label: 'Списък',         roles: ['admin'] },
  { id: 'history',   label: '📈 История',     roles: ['admin'] },
  { id: 'tenants',   label: '👥 Наематели',   roles: ['admin'] },
  { id: 'invoices',  label: '🧾 Фактури',     roles: ['admin', 'broker'] },
  { id: 'contracts', label: '📋 Договори',    roles: ['admin', 'broker'] },
  { id: 'loans',     label: 'Кредити',        roles: ['admin'] },
  { id: 'analysis',  label: 'Анализ',         roles: ['admin'] },
  { id: 'expenses',  label: '💸 Разходи',     roles: ['admin'] },
  { id: 'import',    label: '📥 Банка',       roles: ['admin'] },
  { id: 'settings',  label: '⚙️ Настройки',  roles: ['admin'] },
]

function parseRole() {
  try {
    const token = localStorage.getItem('skyrent_token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role || 'broker'
  } catch { return 'broker' }
}

export default function App() {
  const [activeTab, setActiveTab]       = useState('invoices')
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('skyrent_token'))
  const [role, setRole]                 = useState(parseRole)
  const [userName, setUserName]         = useState(localStorage.getItem('skyrent_name') || '')

  const handleLogin = (data) => {
    if (data?.role) {
      setRole(data.role)
      localStorage.setItem('skyrent_name', data.name || '')
      setUserName(data.name || '')
    }
    setAuthenticated(true)
    setActiveTab(data?.role === 'admin' ? 'dashboard' : 'invoices')
  }

  const handleLogout = () => {
    localStorage.removeItem('skyrent_token')
    localStorage.removeItem('skyrent_name')
    setAuthenticated(false)
    setRole(null)
  }

  if (!authenticated) {
    return <Login API={API} onLogin={handleLogin} />
  }

  const tabs = ALL_TABS.filter(t => t.roles.includes(role))

  // Ensure activeTab is valid for this role
  const validTab = tabs.find(t => t.id === activeTab) ? activeTab : tabs[0]?.id

  return (
    <div className="min-h-screen" style={{ background: '#f0f2f8' }}>
      <header className="shadow-lg" style={{ background: '#1a1a2e' }}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap">
          <div className="shrink-0" style={{ background: 'white', borderRadius: '7px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '42px', display: 'block' }} />
          </div>
          <nav className="flex gap-1 flex-wrap items-center">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={validTab === tab.id ? { background: '#4AABCC', color: '#ffffff' } : {}}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  validTab === tab.id
                    ? 'shadow font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {userName && <span className="text-xs text-slate-400">{userName}</span>}
            {role === 'broker' && <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">Брокер</span>}
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              Изход
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {validTab === 'dashboard' && <Dashboard API={API} />}
        {validTab === 'portfolio' && <Portfolio API={API} />}
        {validTab === 'list'      && <List API={API} />}
        {validTab === 'tenants'   && <Tenants API={API} />}
        {validTab === 'invoices'  && <Invoices API={API} role={role} />}
        {validTab === 'contracts' && <Contracts API={API} role={role} />}
        {validTab === 'loans'     && <Loans API={API} />}
        {validTab === 'history'   && <History API={API} />}
        {validTab === 'analysis'  && <Analysis API={API} />}
        {validTab === 'expenses'  && <Expenses API={API} />}
        {validTab === 'import'    && <Import API={API} />}
        {validTab === 'settings'  && <Settings API={API} />}
      </main>
    </div>
  )
}
