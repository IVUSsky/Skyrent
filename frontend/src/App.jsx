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

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfolio', label: 'Портфолио' },
  { id: 'list', label: 'Списък' },
  { id: 'history', label: '📈 История' },
  { id: 'tenants', label: '👥 Наематели' },
  { id: 'invoices', label: '🧾 Фактури' },
  { id: 'contracts', label: '📋 Договори' },
  { id: 'loans', label: 'Кредити' },
  { id: 'analysis', label: 'Анализ' },
  { id: 'expenses', label: '💸 Разходи' },
  { id: 'import', label: '📥 Банка' },
  { id: 'settings', label: '⚙️ Настройки' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('skyrent_token'))

  if (!authenticated) {
    return <Login API={API} onLogin={() => setAuthenticated(true)} />
  }

  return (
    <div className="min-h-screen" style={{ background: '#f0f2f8' }}>
      {/* Header */}
      <header className="shadow-lg" style={{ background: '#1a1a2e' }}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap">
          <div className="shrink-0" style={{ background: 'white', borderRadius: '7px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '42px', display: 'block' }} />
          </div>
          <nav className="flex gap-1 flex-wrap items-center">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={activeTab === tab.id ? { background: '#4AABCC', color: '#ffffff' } : {}}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'shadow font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => { localStorage.removeItem('skyrent_token'); setAuthenticated(false) }}
            className="ml-auto text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            Изход
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <Dashboard API={API} />}
        {activeTab === 'portfolio' && <Portfolio API={API} />}
        {activeTab === 'list' && <List API={API} />}
        {activeTab === 'tenants' && <Tenants API={API} />}
        {activeTab === 'invoices' && <Invoices API={API} />}
        {activeTab === 'contracts' && <Contracts API={API} />}
        {activeTab === 'loans' && <Loans API={API} />}
        {activeTab === 'history' && <History API={API} />}
        {activeTab === 'analysis' && <Analysis API={API} />}
        {activeTab === 'expenses' && <Expenses API={API} />}
        {activeTab === 'import' && <Import API={API} />}
        {activeTab === 'settings' && <Settings API={API} />}
      </main>
    </div>
  )
}
