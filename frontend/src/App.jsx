import React, { useState, useEffect, lazy, Suspense } from 'react'
import Login from './components/Login'
import NotificationBell from './components/NotificationBell'
import { ThemeProvider } from './components/ThemeProvider'
import ThemePicker from './components/ThemePicker'
import ErrorBoundary from './components/ErrorBoundary'
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
const Billing        = lazy(() => import('./components/Billing'))
const Platform       = lazy(() => import('./components/Platform'))

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
  { id: 'billing',     label: '💳 Абонамент',  roles: ['admin'] },
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

// Org от JWT (multi-tenant). Стар token без claim → org 1.
function parseOrgId() {
  try {
    const token = localStorage.getItem('skyrent_token')
    if (!token) return 1
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Number(payload.organization_id) || 1
  } catch { return 1 }
}

// Org-1-only табове: интеграции с лични env ключове (T212, Tuya, личен бюджет)
const ORG1_ONLY_TABS = new Set(['investments', 'smart', 'personal'])

function parseIsSuper() {
  try {
    const token = localStorage.getItem('skyrent_token')
    if (!token) return false
    return !!JSON.parse(atob(token.split('.')[1])).is_superadmin
  } catch { return false }
}

// Платформени оферти/новини банер (Phase 5) — за org admins.
function AnnouncementBar({ API }) {
  const [items, setItems] = useState([])
  const [sent, setSent] = useState({})
  useEffect(() => {
    apiFetch(`${API}/api/announcements`).then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  const dismiss = (id) => {
    setItems(prev => prev.filter(x => x.id !== id))
    apiFetch(`${API}/api/announcements/${id}/dismiss`, { method: 'POST' }).catch(() => {})
  }
  const interest = (id) => {
    setSent(s => ({ ...s, [id]: true }))
    apiFetch(`${API}/api/announcements/${id}/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }).catch(() => {})
  }
  if (!items.length) return null
  const ICON = { news: '📢', offer: '🎁', service: '🏠' }
  return (
    <div className="max-w-7xl mx-auto px-4 pt-3 space-y-2">
      {items.map(a => (
        <div key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="font-medium text-amber-900">{ICON[a.type] || '📢'} {a.title}</span>
            <span className="text-amber-800 text-sm ml-2">{a.body}</span>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {a.cta_label && (sent[a.id]
              ? <span className="text-green-700 text-sm font-medium">✓ Ще се свържем с теб</span>
              : <button onClick={() => interest(a.id)}
                  className="px-3 py-1 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">{a.cta_label}</button>)}
            <button onClick={() => dismiss(a.id)} className="text-amber-400 hover:text-amber-600 px-1" title="Скрий">✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab]       = useState('invoices')
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('skyrent_token'))
  const [role, setRole]                 = useState(parseRole)
  const [userName, setUserName]         = useState(localStorage.getItem('skyrent_name') || '')
  const [mustChangePwd, setMustChangePwd] = useState(localStorage.getItem('skyrent_must_change_pwd') === '1')
  const [learningCount, setLearningCount] = useState(0)
  const [showLearning, setShowLearning]   = useState(false)

  // 402 (изтекъл trial / спрян абонамент) → отвори таб Абонамент
  useEffect(() => {
    const h = () => setActiveTab('billing')
    window.addEventListener('skyrent:billing-required', h)
    return () => window.removeEventListener('skyrent:billing-required', h)
  }, [])

  // White-label (Phase 4): бранд от org settings.issuer (име + опц. лого).
  // Org 1 (Sky Capital) пада на вграденото лого; нови организации виждат своето.
  const [brand, setBrand] = useState(null) // { name, logo? }
  useEffect(() => {
    if (!authenticated || role === 'tenant') return
    apiFetch(`${API}/api/settings`).then(r => r.json())
      .then(s => { if (s?.issuer?.name) setBrand({ name: s.issuer.name, logo: s.issuer.logo || null }) })
      .catch(() => {})
  }, [authenticated, role])

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
      <ErrorBoundary resetKey="tenant">
        <Suspense fallback={<TabFallback/>}>
          <TenantApp userName={userName} onLogout={handleLogout} mustChangePassword={mustChangePwd} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  const orgId = parseOrgId()
  const isSuper = parseIsSuper()
  const tabs = [
    ...ALL_TABS.filter(t => t.roles.includes(role) && (orgId === 1 || !ORG1_ONLY_TABS.has(t.id))),
    ...(isSuper ? [{ id: 'platform', label: '🛸 Платформа', roles: ['admin'] }] : []),
  ]

  // Ensure activeTab is valid for this role
  const validTab = tabs.find(t => t.id === activeTab) ? activeTab : tabs[0]?.id

  return (
    <ThemeProvider activeTab={validTab}>
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header className="shadow-lg" style={{ background: 'var(--shell-bg)' }}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap">
          <div className="shrink-0" style={{ background: 'white', borderRadius: '7px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
            {brand?.logo ? (
              <img src={brand.logo} alt={brand.name} style={{ height: '42px', display: 'block' }} />
            ) : brand && brand.name !== 'Sky Capital' ? (
              <span style={{ fontWeight: 700, fontSize: '18px', color: '#0F1E18', padding: '8px 2px', display: 'block' }}>{brand.name}</span>
            ) : (
              <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '42px', display: 'block' }} />
            )}
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

      <AnnouncementBar API={API} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <ErrorBoundary resetKey={validTab}>
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
          {validTab === 'billing'      && <Billing API={API} />}
          {validTab === 'platform'     && <Platform API={API} />}
          {validTab === 'settings'     && <Settings API={API} />}
        </Suspense>
        </ErrorBoundary>
      </main>
    </div>
    </ThemeProvider>
  )
}
