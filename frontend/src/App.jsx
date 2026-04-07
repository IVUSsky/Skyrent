import React, { useState } from 'react'
import Portfolio from './components/Portfolio'
import List from './components/List'
import Dashboard from './components/Dashboard'
import Loans from './components/Loans'
import Analysis from './components/Analysis'
import Import from './components/Import'
import Settings from './components/Settings'
import Expenses from './components/Expenses'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfolio', label: 'Портфолио' },
  { id: 'list', label: 'Списък' },
  { id: 'loans', label: 'Кредити' },
  { id: 'analysis', label: 'Анализ' },
  { id: 'expenses', label: '💸 Разходи' },
  { id: 'import', label: '📥 Банка' },
  { id: 'settings', label: '⚙️ Настройки' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <h1 className="text-white text-xl font-bold tracking-tight">Портфолио Имоти</h1>
          </div>
          <nav className="flex gap-1 flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow'
                    : 'text-blue-100 hover:bg-blue-600 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <Dashboard API={API} />}
        {activeTab === 'portfolio' && <Portfolio API={API} />}
        {activeTab === 'list' && <List API={API} />}
        {activeTab === 'loans' && <Loans API={API} />}
        {activeTab === 'analysis' && <Analysis API={API} />}
        {activeTab === 'expenses' && <Expenses API={API} />}
        {activeTab === 'import' && <Import API={API} />}
        {activeTab === 'settings' && <Settings API={API} />}
      </main>
    </div>
  )
}
