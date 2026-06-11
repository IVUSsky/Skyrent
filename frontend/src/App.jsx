import React, { useState, useEffect, lazy, Suspense } from 'react'
import Login from './components/Login'
import NotificationBell from './components/NotificationBell'
import { ThemeProvider } from './components/ThemeProvider'
import ThemePicker from './components/ThemePicker'
import { apiFetch } from './api'

// Lazy-loaded tabs — намалява initial bundle (само избраното се сваля)
const Portfolio      = lazy(() => import('./components/Portfolio'))
const List           = lazy(() => import('./components/List'))
const Dashboard      = lazy(() => import('./components/Dashboard'))
const InvestorView   = lazy(() => import('./components/InvestorView'))
const Loans          = lazy(() => import('./components/Loans'))
const Analysis       = lazy(() => import('./components/Analysis'))
const History        = lazy(() => import('./components/History'))
const Import         = lazy(() => import('./components/Import'))
const Tenants        = lazy(() => import('./components/Tenants'))
const Invoices       = lazy(() => import('./components/Invoices'))
const Contracts      = lazy(() => import('./components/Contracts'))
const Settings       = lazy(() => import('./components/Settings'))
const Expenses       = lazy(() => import('./components/Expenses'))
const Smart          = lazy(() => import('./components/Smart'))
const Investments    = lazy(() => import('./components/Investments'))
const PersonalBudget = lazy(() => import('./components/PersonalBudget'))
const Addons         = lazy(() => import('./components/Addons'))
const Support        = lazy(() => import('./components/Support'))
const Internet       = lazy(() => import('./components/Internet'))
const TenantApp      = lazy(() => import('./components/TenantApp'))
const ChatLearning   = lazy(() => import('./components/ChatLearning'))
const Integrity      = lazy(() => import('./components/Integrity'))

const TabFallback = () => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
    Зарежда таб...
  </div>
)

const API = import.meta.env.VITE_API_URL || ''

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard',      roles: ['admin'] },
  { id: 'investor',  label: '📊 Инвеститор',  roles: ['admin'] },
  { id: 'portfolio', label: 'Портфолио',      roles: ['admin'] },
  { id: 'list',      label: 'Списък',         roles: ['admin'] },
  { id: 'history',   label: '📈 История',     roles: ['admin'] },
  { id: 'tenants',   label: '👥 Наематели',   roles: ['admin'] },
  { id: 'invoices',  label: '🧾 Фактури',     roles: ['admin', 'broker'] },
  { id: 'contracts', label: '📋 Договори',    roles: ['admin', 'broker'] },
  { id: 'addons',    label: '🛍️ Услуги',     roles: ['admin'] },
  { id: 'internet',  label: '🌐 Интернет',    roles: ['admin'] },
  { id: 'support',   label: '🛟 Поддръжка',   roles: ['admin'] },
  { id: 'loans',     label: 'Кредити',        roles: ['admin'] },
  { id: 'analysis',  label: 'Анализ',         roles: ['admin'] },
  { id: 'expenses',    label: '💸 Разходи',     roles: ['admin'] },
  { id: 'import',      label: '📥 Банка',       roles: ['admin'] },
  { id: 'investments', label: '📈 Инвестиции',  roles: ['admin'] },
  { id: 'personal',    label: '💰 Личен бюджет', roles: ['admin'] },
  { id: 'smart',       label: '⚡ Смарт',       roles: ['admin'] },
  { id: 'integrity',   label: '🩺 Интегритет', roles: ['admin'] },
  { id: 'settings',    label: '⚙️ Настройки',  roles: ['admin'] },
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
  const [mustChangePwd, setMustChangePwd] = useState(localStorage.getItem('skyrent_must_change_pwd') === '1')
  const [learningCount, setLearningCount] = useState(0)
  const [showLearning, setShowLearning]   = useState(false)

  const refreshLearningCount = () => {
    if (!authenticated || role === 'tenant') return
    apiFetch(`${API}/api/chat-learning/pending-count`)
      .then(r => r.json())
      .then(d => setLearningCount(Number(d?.count) || 0))
      .catch(() => {})
  }

  useEffect(() => {
    refreshLearningCount()
    if (!authenticated || role === 'tenant') return
    const id = setInterval(refreshLearningCount, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [authenticated, role])

  const handleLogin = (data) => {
    if (data?.role) {
      setRole(data.role)
      localStorage.setItem('skyrent_name', data.name || '')
      setUserName(data.name || '')
    }
    if (data?.must_change_password) {
      localStorage.setItem('skyrent_must_change_pwd', '1')
      setMustChangePwd(true)
    } else {
      localStorage.removeItem('skyrent_must_change_pwd')
      setMustChangePwd(false)
    }
    setAuthenticated(true)
    setActiveTab(data?.role === 'admin' ? 'dashboard' : 'invoices')
  }

  const handleLogout = () => {
    localStorage.removeItem('skyrent_token')
    localStorage.removeItem('skyrent_name')
    localStorage.removeItem('skyrent_must_change_pwd')
    setAuthenticated(false)
    setRole(null)
    setMustChangePwd(false)
  }

  if (!authenticated) {
    return <Login API={API} onLogin={handleLogin} />
  }

  if (role === 'tenant') {
    return (
      <Suspense fallback={<TabFallback/>}>
        <TenantApp userName={userName} onLogout={handleLogout} mustChangePassword={mustChangePwd} />
      </Suspense>
    )
  }

  const tabs = ALL_TABS.filter(t => t.roles.includes(role))

  // Ensure activeTab is valid for this role
  const validTab = tabs.find(t => t.id === activeTab) ? activeTab : tabs[0]?.id

  return (
    <ThemeProvider activeTab={validTab}>
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header className="shadow-lg" style={{ background: 'var(--shell-bg)' }}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap">
          <div className="shrink-0" style={{ background: 'white', borderRadius: '7px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '42px', display: 'block' }} />
          </div>
          <nav className="flex gap-1 flex-wrap items-center">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={validTab === tab.id
                  ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                  : { color: 'var(--shell-fg)' }}
                className={`shell-nav-btn px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  validTab === tab.id ? 'shadow font-semibold active' : ''
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemePicker />
            <NotificationBell
              API={API}
              basePath="/api/notifications"
              darkHeader
              onNavigate={(link) => {
                if (link?.startsWith('tickets/')) {
                  setActiveTab('support')
                } else if (link === 'addons') {
                  setActiveTab('addons')
                } else if (link === 'invoices') {
                  setActiveTab('invoices')
                }
              }}
            />
            <button
              onClick={() => setShowLearning(true)}
              title="Учене от разговори (предложения от AI асистента)"
              className="relative text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors text-sm"
            >
              🎓
              {learningCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                  {learningCount}
                </span>
              )}
            </button>
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

      {showLearning && (
        <Suspense fallback={null}>
          <ChatLearning API={API} onClose={() => setShowLearning(false)} onChanged={refreshLearningCount} />
        </Suspense>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<TabFallback/>}>
          {validTab === 'dashboard' && <Dashboard API={API} />}
          {validTab === 'investor'  && <InvestorView API={API} />}
          {validTab === 'portfolio' && <Portfolio API={API} />}
          {validTab === 'list'      && <List API={API} />}
          {validTab === 'tenants'   && <Tenants API={API} />}
          {validTab === 'invoices'  && <Invoices API={API} role={role} />}
          {validTab === 'contracts' && <Contracts API={API} role={role} />}
          {validTab === 'addons'    && <Addons API={API} />}
          {validTab === 'internet'  && <Internet API={API} />}
          {validTab === 'support'   && <Support API={API} />}
          {validTab === 'loans'     && <Loans API={API} />}
          {validTab === 'history'   && <History API={API} />}
          {validTab === 'analysis'  && <Analysis API={API} />}
          {validTab === 'expenses'  && <Expenses API={API} />}
          {validTab === 'import'    && <Import API={API} />}
          {validTab === 'smart'        && <Smart API={API} />}
          {validTab === 'investments'  && <Investments API={API} />}
          {validTab === 'personal'     && <PersonalBudget />}
          {validTab === 'integrity'    && <Integrity API={API} />}
          {validTab === 'settings'     && <Settings API={API} />}
        </Suspense>
      </main>
    </div>
    </ThemeProvider>
  )
}
