import React, { useEffect, useState, useRef } from 'react'
import { apiFetch, authUrl } from '../api'
import UtilityHistoryChart from './UtilityHistoryChart'
import NotificationBell from './NotificationBell'
import { TicketDetail } from './Support'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { id: 'home',         label: 'Начало',     icon: '🏠' },
  { id: 'chat',         label: 'Помощник',   icon: '💬' },
  { id: 'photos',       label: 'Снимки',     icon: '📷' },
  { id: 'contract',     label: 'Договор',    icon: '📋' },
  { id: 'invoices',     label: 'Фактури',    icon: '🧾' },
  { id: 'addons',       label: 'Услуги',     icon: '🛍️' },
  { id: 'internet',     label: 'Интернет',   icon: '🌐' },
  { id: 'support',      label: 'Поддръжка',  icon: '🛟' },
  { id: 'consumption',  label: 'Сметки',     icon: '📊' },
  { id: 'profile',      label: 'Профил',     icon: '👤' },
]

export default function TenantApp({ userName, onLogout, mustChangePassword }) {
  const [tab, setTab] = useState('home')
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPwd, setShowPwd] = useState(!!mustChangePassword)
  const [toast, setToast] = useState(null)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [chatPrefill, setChatPrefill] = useState('')

  const askInChat = (text) => { setChatPrefill(text); setTab('chat') }

  // PWA install — capture beforeinstallprompt for Android/Chrome
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      // Only show banner if user hasn't dismissed it before
      if (!localStorage.getItem('skyrent_install_dismissed')) {
        setShowInstallBanner(true)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // iOS install hint — Safari doesn't fire beforeinstallprompt
  useEffect(() => {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    if (isIos && !isInStandalone && !localStorage.getItem('skyrent_install_dismissed')) {
      setShowInstallBanner(true)
    }
  }, [])

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

  const triggerInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      setInstallPrompt(null)
      setShowInstallBanner(false)
      if (outcome === 'accepted') localStorage.setItem('skyrent_install_dismissed', '1')
    }
  }

  const dismissInstall = () => {
    setShowInstallBanner(false)
    localStorage.setItem('skyrent_install_dismissed', '1')
  }

  const loadMe = () => {
    setLoading(true)
    apiFetch(`${API}/api/tenant/me`)
      .then(r => r.json())
      .then(data => { setMe(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadMe() }, [])

  // Handle Stripe redirect back (?stripe_success=1 or ?stripe_cancel=1, ?autopay_*=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('stripe_success') === '1') {
      setTab('invoices')
      setToast({ type: 'success', text: '✅ Плащането е получено! Фактурата е маркирана като платена.' })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('stripe_cancel') === '1') {
      setTab('invoices')
      setToast({ type: 'error', text: 'Плащането беше прекратено. Можеш да опиташ отново.' })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('autopay_success') === '1') {
      setTab('profile')
      setToast({ type: 'success', text: '✅ Автоплащането е активирано! От следващия месец наемът ще се тегли автоматично.' })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('autopay_cancel') === '1') {
      setTab('profile')
      setToast({ type: 'error', text: 'Активирането беше прекратено.' })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Force password change on first login
  if (showPwd) {
    return <ChangePassword
      isFirstLogin={!!mustChangePassword}
      onDone={() => { setShowPwd(false); loadMe() }}
      onLogout={onLogout}
    />
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Зареждане...</div>
  }

  const activeContract = me?.contracts?.find(c => c.status === 'active') || me?.contracts?.[0]
  const property = me?.properties?.find(p => p.id === activeContract?.property_id) || me?.properties?.[0]

  return (
    <div className="min-h-screen pb-20" style={{ background: '#f0f2f8' }}>
      {/* PWA install banner */}
      {showInstallBanner && (
        <div className="bg-blue-600 text-white px-4 py-3 text-sm">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xl">📱</span>
              <div className="min-w-0">
                <div className="font-semibold">Инсталирай приложението</div>
                {isIos ? (
                  <div className="text-xs opacity-90">
                    В Safari натисни <strong>Share</strong> → <strong>Add to Home Screen</strong>
                  </div>
                ) : (
                  <div className="text-xs opacity-90">Бърз достъп от началния екран на телефона</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {installPrompt && !isIos && (
                <button onClick={triggerInstall}
                  className="bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
                  Инсталирай
                </button>
              )}
              <button onClick={dismissInstall}
                className="text-white text-xs opacity-80 hover:opacity-100 px-2">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <div
          className="fixed top-4 inset-x-4 z-50 max-w-2xl mx-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium"
          style={{
            background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: toast.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <header className="shadow-md sticky top-0 z-10" style={{ background: '#1a1a2e' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ background: 'white', borderRadius: '6px', padding: '3px 8px' }}>
              <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '32px' }} />
            </div>
            <div className="text-white">
              <div className="text-xs text-slate-400">Здравей,</div>
              <div className="text-sm font-semibold">{userName || me?.user?.name || 'наемател'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell
              API={API}
              basePath="/api/tenant/notifications"
              darkHeader
              onNavigate={(link) => {
                if (link?.startsWith('tickets/')) setTab('support')
                else if (link === 'addons')      setTab('addons')
                else if (link === 'invoices')    setTab('invoices')
              }}
            />
            <button onClick={onLogout} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10">
              Изход
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {tab === 'home'        && <Home me={me} property={property} contract={activeContract} onAsk={askInChat} />}
        {tab === 'chat'        && <Chat prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill('')} />}
        {tab === 'photos'      && <Photos me={me} property={property} />}
        {tab === 'contract'    && <Contract contracts={me?.contracts || []} />}
        {tab === 'invoices'    && <Invoices />}
        {tab === 'addons'      && <Addons />}
        {tab === 'internet'    && <TenantInternet />}
        {tab === 'support'     && <TenantTickets />}
        {tab === 'consumption' && <Consumption property={property} />}
        {tab === 'profile'     && <Profile me={me} onChangePassword={() => setShowPwd(true)} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-20">
        <div className="max-w-2xl mx-auto grid grid-cols-10">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2 flex flex-col items-center text-xs ${tab === t.id ? 'text-blue-600 font-semibold' : 'text-slate-500'}`}
              style={tab === t.id ? { borderTop: '2px solid #4AABCC' } : {}}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-1">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Chat({ prefill = '', onPrefillConsumed }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [toast, setToast]       = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    apiFetch(`${API}/api/tenant/chat/history`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setMessages(data) : null)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      onPrefillConsumed?.()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [prefill])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setMessages(prev => [...prev, { role: 'user', content: text, created_at: new Date().toISOString(), _local: true }])
    setInput('')
    try {
      const r = await apiFetch(`${API}/api/tenant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, created_at: new Date().toISOString(), _local: true }])
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: '420px' }}>
      {toast && (
        <div className="mb-2 px-3 py-2 rounded text-sm"
          style={{
            background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: toast.type === 'success' ? '#166534' : '#991b1b',
          }}>
          {toast.text}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-3">
        {messages.length === 0 && !sending && (
          <div className="text-center text-slate-400 text-sm py-8">
            <div className="text-3xl mb-2">💬</div>
            <div>Питай ме за апартамента, договора, плащанията…</div>
            <div className="text-xs mt-2 text-slate-300">Например: „Каква е WiFi паролата?" или „Колко дължа?"</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id || `local-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 px-3 py-2 rounded-2xl rounded-bl-sm text-sm">
              <span className="inline-block animate-pulse">пише…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="mt-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Напиши съобщение…"
          disabled={sending}
          className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <button onClick={send} disabled={sending || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  )
}

function Home({ me, property, contract, onAsk }) {
  if (!property) {
    return <Card>
      <p className="text-slate-600 text-sm">Все още няма активен договор за имот, свързан с Вашия профил.</p>
      <p className="text-slate-500 text-xs mt-2">Свържете се с екипа на Sky Capital за повече информация.</p>
    </Card>
  }
  const suggestions = [
    'Колко дължа?',
    'Каква е WiFi паролата?',
    'До кога е договорът?',
    'Как да платя наема?',
  ]
  return (
    <div className="space-y-4">
      {/* Quick action: AI helper */}
      <button
        onClick={() => onAsk?.('')}
        className="w-full text-left rounded-xl shadow-sm border border-blue-200 hover:border-blue-400 transition-colors p-4"
        style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">💬</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">AI Помощник</div>
            <div className="text-xs text-slate-600">Питай за апартамента, наема, плащане, уредите…</div>
          </div>
          <span className="text-slate-400">→</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mt-3">
          {suggestions.map(q => (
            <span
              key={q}
              onClick={(e) => { e.stopPropagation(); onAsk?.(q) }}
              className="text-xs bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-400 text-blue-700 px-2.5 py-1 rounded-full cursor-pointer transition-colors"
            >
              {q}
            </span>
          ))}
        </div>
      </button>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Имот</div>
            <h2 className="text-lg font-bold text-slate-800">{property.адрес}</h2>
            {property.район && <div className="text-sm text-slate-500">{property.район}</div>}
          </div>
          <span className="text-2xl">🏠</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          {property.тип && <Info label="Тип" value={property.тип} />}
          {property.площ && <Info label="Площ" value={`${property.площ} м²`} />}
          {contract?.monthly_rent && <Info label="Наем" value={`${Number(contract.monthly_rent).toLocaleString('bg-BG')} ${contract.currency || 'EUR'}`} />}
          {contract?.end_date && <Info label="Договорът изтича" value={fmtDate(contract.end_date)} />}
        </div>
      </Card>

      {(property.абонат_ток || property.абонат_вода || property.абонат_тец) && (
        <Card title="Абонатни номера за сметки">
          <div className="space-y-2 text-sm">
            {property.абонат_ток  && <Row icon="⚡" label="Ток"  value={property.абонат_ток} />}
            {property.абонат_вода && <Row icon="💧" label="Вода" value={property.абонат_вода} />}
            {property.абонат_тец  && <Row icon="🔥" label="Топлофикация" value={property.абонат_тец} />}
            {property.абонат_вход && <Row icon="🏢" label="Входна такса" value={property.абонат_вход} />}
          </div>
        </Card>
      )}

      <Card title="Контакт със Sky Capital">
        <a href="mailto:info@skycapital.pro" className="block text-sm text-blue-600 hover:underline mb-1">📧 info@skycapital.pro</a>
        {property.телефон && <div className="text-sm text-slate-600">📞 {property.телефон}</div>}
      </Card>
    </div>
  )
}

function Photos({ property }) {
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    if (!property?.id) return
    apiFetch(`${API}/api/tenant/properties/${property.id}/photos`)
      .then(r => r.json())
      .then(setPhotos)
      .catch(() => setPhotos([]))
  }, [property?.id])
  if (!property) return <Card><p className="text-slate-500 text-sm">Няма имот.</p></Card>
  if (photos === null) return <Card><p className="text-slate-500 text-sm">Зареждане на снимките...</p></Card>
  if (photos.length === 0) return <Card><p className="text-slate-500 text-sm">Все още няма снимки на имота.</p></Card>
  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map(p => {
        const photoUrl = authUrl(`${API}/api/tenant/photos/${p.id}/file`)
        return (
          <a key={p.id} href={photoUrl} target="_blank" rel="noopener" className="block">
            <img
              src={photoUrl}
              alt={p.caption || ''}
              className="w-full aspect-square object-cover rounded-lg shadow-sm bg-slate-200"
              loading="lazy"
            />
            {p.caption && <div className="text-xs text-slate-500 mt-1 truncate">{p.caption}</div>}
          </a>
        )
      })}
    </div>
  )
}

function Contract({ contracts }) {
  if (!contracts.length) return <Card><p className="text-slate-500 text-sm">Няма свързани договори.</p></Card>
  return (
    <div className="space-y-3">
      {contracts.map(c => (
        <Card key={c.id}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase text-slate-400">№ {c.contract_number}</div>
              <div className="font-semibold text-slate-800">{c.property_address}</div>
              <div className="text-xs text-slate-500 mt-1">
                {fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : 'безсрочен'}
              </div>
              <div className="mt-2 text-sm">
                <strong>{Number(c.monthly_rent).toLocaleString('bg-BG')} {c.currency || 'EUR'}</strong>/мес.
              </div>
            </div>
            <StatusBadge status={c.status} />
          </div>
          {c.pdf_path && (
            <a
              href={authUrl(`${API}/api/tenant/contracts/${c.id}/pdf`)}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
            >
              📄 Изтегли PDF
            </a>
          )}
        </Card>
      ))}
    </div>
  )
}

function Invoices() {
  const [list, setList] = useState(null)
  const [payingId, setPayingId] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => {
    apiFetch(`${API}/api/tenant/invoices`).then(r => r.json()).then(setList).catch(() => setList([]))
  }
  useEffect(load, [])

  const pay = async (invoiceId) => {
    setPayingId(invoiceId); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/invoices/${invoiceId}/pay`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok || !data.url) {
        setErr(data.error || 'Грешка при стартиране на плащането')
        setPayingId(null)
        return
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (e) {
      setErr('Сървърна грешка')
      setPayingId(null)
    }
  }

  if (list === null) return <Card><p className="text-slate-500 text-sm">Зареждане...</p></Card>
  if (list.length === 0) return <Card><p className="text-slate-500 text-sm">Все още няма издадени фактури.</p></Card>

  return (
    <div className="space-y-2">
      {err && <Card><p className="text-sm text-red-600">{err}</p></Card>}
      {list.map(inv => {
        const isPaid     = !!inv.paid_at
        const isCN       = inv.type === 'credit_note'
        const stripeOff  = inv.stripe_enabled === 0
        const canPay     = !isPaid && !isCN && !stripeOff
        const isPaying   = payingId === inv.id
        return (
          <Card key={inv.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-slate-800 truncate">№ {inv.invoice_number}</div>
                  {isCN && <span className="text-xs text-red-600 font-semibold">КИ</span>}
                  {isPaid && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#dcfce7', color: '#166534' }}>
                      ✓ Платена
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{inv.month} · {inv.property_address}</div>
                <div className="text-sm mt-1">
                  <strong>{Number(inv.total || inv.amount).toLocaleString('bg-BG')}</strong>{' '}
                  <span className="text-xs text-slate-500">EUR</span>
                </div>
                {(inv.addons_total || 0) > 0 && Array.isArray(inv.addons) && inv.addons.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-600 bg-slate-50 rounded px-2 py-1 border border-slate-200">
                    <div className="font-semibold text-slate-700 mb-0.5">Включва (доп. услуги):</div>
                    {inv.addons.map((a, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{a.name}{a.kind === 'deposit' ? ' (депозит)' : ''}</span>
                        <span className="ml-2">{Number(a.amount).toLocaleString('bg-BG')} €</span>
                      </div>
                    ))}
                  </div>
                )}
                {inv.due_date && !isPaid && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    Падеж: {fmtDate(inv.due_date)}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {canPay && (
                  <button
                    onClick={() => pay(inv.id)}
                    disabled={isPaying}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    {isPaying ? '...' : '💳 Плати'}
                  </button>
                )}
                {!isPaid && !isCN && stripeOff && (
                  <span className="text-[10px] text-slate-500 italic text-center max-w-[100px]">
                    Само по банков път
                  </span>
                )}
                {inv.pdf_path && (
                  <a
                    href={authUrl(`${API}/api/tenant/invoices/${inv.id}/pdf`)}
                    target="_blank"
                    rel="noopener"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-2 rounded-lg text-center"
                  >
                    PDF
                  </a>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Addons() {
  const [catalog, setCatalog] = useState(null)
  const [mine, setMine]       = useState(null)
  const [busy, setBusy]       = useState(null) // service_id while submitting
  const [err, setErr]         = useState(null)
  const [msg, setMsg]         = useState(null)

  const load = async () => {
    setErr(null)
    try {
      const [c, m] = await Promise.all([
        apiFetch(`${API}/api/tenant/addons/catalog`).then(r => r.json()),
        apiFetch(`${API}/api/tenant/addons/mine`).then(r => r.json()),
      ])
      setCatalog(c); setMine(m)
    } catch (e) { setErr('Грешка при зареждане') }
  }
  useEffect(() => { load() }, [])

  const request = async (svc) => {
    setBusy(svc.id); setErr(null); setMsg(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/addons/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: svc.id }),
      })
      const data = await r.json()
      if (!r.ok) { setErr(data.error || 'Грешка'); return }
      setMsg(`✓ Заявката за "${svc.name}" е изпратена. Управителят ще я прегледа.`)
      load()
    } catch (e) { setErr('Сървърна грешка') }
    finally { setBusy(null) }
  }

  const cancel = async (sub) => {
    if (!confirm(`Да отменя ли заявката за ${sub.service_name}?`)) return
    try {
      const r = await apiFetch(`${API}/api/tenant/addons/mine/${sub.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) { setErr(data.error || 'Грешка'); return }
      load()
    } catch (e) { setErr('Сървърна грешка') }
  }

  if (catalog === null || mine === null) return <Card><p className="text-slate-500 text-sm">Зареждане...</p></Card>

  // Map: which services have an active/pending sub
  const subByService = {}
  for (const s of mine) {
    if (s.status === 'pending' || s.status === 'active') subByService[s.service_id] = s
  }

  const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })

  const STATUS_LABEL = {
    pending:  { text: '⏳ Чакаща',   cls: 'bg-yellow-100 text-yellow-800' },
    active:   { text: '✓ Активна',   cls: 'bg-green-100 text-green-800' },
    stopped:  { text: '⏹ Спряна',    cls: 'bg-gray-200 text-gray-700' },
    rejected: { text: '✗ Отказана',  cls: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{msg}</div>}

      {/* My subscriptions */}
      {mine.length > 0 && (
        <Card title="Моите услуги">
          <div className="space-y-2">
            {mine.map(s => {
              const st = STATUS_LABEL[s.status] || { text: s.status, cls: 'bg-gray-100 text-gray-700' }
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">
                      <span className="mr-1">{s.service_icon}</span>{s.service_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmt(s.service_monthly_price)} €/мес
                      {s.service_deposit_amount > 0 && (
                        <> · депозит {fmt(s.service_deposit_amount)} €{s.deposit_charged ? (s.deposit_refunded ? ' (върнат)' : ' (удържан)') : ' (предстои)'}</>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.text}</span>
                  {s.status === 'pending' && (
                    <button onClick={() => cancel(s)} className="text-xs text-red-600 hover:text-red-800 px-2 py-1">Отмени</button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Catalog */}
      <Card title="Налични услуги">
        <p className="text-xs text-slate-500 mb-3">
          Заявката отива до управителя. След одобрение услугата се добавя към следващата ви фактура.
          {catalog.some(c => c.deposit_amount > 0) && ' Някои услуги изискват еднократен депозит, който се връща при прекратяване.'}
        </p>
        <div className="space-y-2">
          {catalog.map(svc => {
            const sub = subByService[svc.id]
            const disabled = !!sub || busy === svc.id
            return (
              <div key={svc.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">
                    <span className="mr-1 text-lg">{svc.icon}</span>{svc.name}
                  </div>
                  {svc.description && (
                    <div className="text-xs text-slate-500">{svc.description}</div>
                  )}
                  <div className="text-xs text-slate-600 mt-0.5">
                    <strong>{fmt(svc.monthly_price)} €/мес</strong>
                    {svc.deposit_amount > 0 && (
                      <span className="text-orange-700 ml-2">+ депозит {fmt(svc.deposit_amount)} €</span>
                    )}
                  </div>
                </div>
                {sub ? (
                  <span className="text-xs text-slate-500 italic">{sub.status === 'active' ? 'активна' : 'заявена'}</span>
                ) : (
                  <button
                    onClick={() => request(svc)}
                    disabled={disabled}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                  >
                    {busy === svc.id ? '...' : 'Заяви'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function TenantInternet() {
  const [data, setData] = useState(null)
  const [busy, setBusy]   = useState(null) // plan id while buying
  const [err, setErr]     = useState(null)
  const [macInput, setMacInput] = useState('')
  const [savingMac, setSavingMac] = useState(false)

  const load = () => {
    apiFetch(`${API}/api/tenant/internet`).then(r => r.json()).then(d => {
      setData(d); setMacInput(d?.account?.mac_address || '')
    }).catch(() => setErr('Грешка при зареждане'))
  }
  useEffect(load, [])

  // Refresh ако се върнем от Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('internet_success')) {
      setTimeout(() => { load(); window.history.replaceState({}, '', '/') }, 1500)
    }
  }, [])

  const buy = async (plan) => {
    setBusy(plan.id); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/internet/buy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      })
      const d = await r.json()
      if (!r.ok || !d.url) { setErr(d.error || 'Грешка'); setBusy(null); return }
      window.location.href = d.url
    } catch (e) { setErr('Сървърна грешка'); setBusy(null) }
  }

  const saveMac = async () => {
    setSavingMac(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/internet/mac`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac_address: macInput }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Грешка'); return }
      load()
    } catch (e) { setErr('Сървърна грешка') }
    finally { setSavingMac(false) }
  }

  if (data === null) return <Card><p className="text-slate-500 text-sm">Зареждане...</p></Card>

  const acc = data.account
  const isActive = acc.status === 'active' && acc.valid_until && new Date(acc.valid_until) > new Date()
  const validUntil = acc.valid_until ? new Date(acc.valid_until + (acc.valid_until.endsWith('Z') ? '' : 'Z')) : null
  const hoursLeft = validUntil ? Math.max(0, (validUntil.getTime() - Date.now()) / 3600000) : 0

  const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })
  const fmtTimeLeft = (h) => {
    if (h < 1)  return `${Math.round(h * 60)} мин`
    if (h < 48) return `${Math.round(h)} часа`
    return `${Math.round(h / 24)} дни`
  }

  return (
    <div className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

      {/* Status card */}
      <Card title="Достъп до Wi-Fi">
        {isActive ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <div className="flex items-baseline justify-between">
              <div className="text-green-800 font-bold">✅ Активен</div>
              <div className="text-xs text-green-600">остават {fmtTimeLeft(hoursLeft)}</div>
            </div>
            <div className="text-xs text-green-700 mt-1">До: {validUntil.toLocaleString('bg-BG')}</div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <div className="text-red-800 font-bold">❌ Няма активен пакет</div>
            <div className="text-xs text-red-700 mt-1">Изберете план по-долу за да активирате интернет.</div>
          </div>
        )}

        <div className="bg-slate-50 rounded p-3 mb-3 text-sm">
          <div className="text-xs text-slate-500 mb-1">За свързване към Wi-Fi мрежата:</div>
          <div className="flex justify-between">
            <span className="text-slate-600">Потребител:</span>
            <span className="font-mono font-semibold">{acc.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Парола:</span>
            <span className="font-mono font-semibold">{acc.password}</span>
          </div>
        </div>

        <div className="text-xs text-slate-600">
          <div className="font-medium mb-1">MAC адрес на устройството ви (опционално)</div>
          <div className="text-slate-500 mb-2">Ако зададете MAC, ще се свързвате автоматично без парола.</div>
          <div className="flex gap-2">
            <input value={macInput} onChange={e => setMacInput(e.target.value.toUpperCase())}
              placeholder="AA:BB:CC:DD:EE:FF" maxLength={17}
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
            <button onClick={saveMac} disabled={savingMac || macInput === (acc.mac_address || '')}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded">
              {savingMac ? '...' : 'Запази'}
            </button>
          </div>
        </div>
      </Card>

      {/* Plans */}
      <Card title="Купи пакет">
        <p className="text-xs text-slate-500 mb-3">Изберете пакет — заплащате с карта; интернетът се активира веднага.</p>
        <div className="space-y-2">
          {data.plans.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{p.name}</div>
                {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                <div className="text-xs text-slate-600 mt-0.5">
                  <strong>{fmt(p.price)} €</strong>
                  <span className="text-slate-400 ml-1">· {p.duration_days} дни</span>
                  {p.speed_down_mbps && <span className="text-slate-400 ml-1">· {p.speed_down_mbps}/{p.speed_up_mbps || '?'} Mbps</span>}
                </div>
              </div>
              <button onClick={() => buy(p)} disabled={busy === p.id}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap">
                {busy === p.id ? '...' : '💳 Купи'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Last purchases */}
      {data.purchases.length > 0 && (
        <Card title="История на покупките">
          <div className="space-y-1 text-xs">
            {data.purchases.map(p => (
              <div key={p.id} className="flex justify-between py-1.5 border-b last:border-0">
                <div>
                  <div className="font-medium text-slate-800">{p.plan_name}</div>
                  <div className="text-slate-500">{(p.paid_at || p.created_at || '').slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmt(p.amount)} €</div>
                  <div className={`text-[10px] ${p.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {p.status === 'paid' ? '✓ Платен' : '⏳ Чакащ'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function TenantTickets() {
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null) // ticket detail object
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'other', priority: 'normal' })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  const TICKET_CATS = [
    ['plumbing',   '🚿 ВиК (теч, запушване)'],
    ['electrical', '⚡ Електро (ток, осветление)'],
    ['appliance',  '🔌 Уред (хладилник, перална)'],
    ['heating',    '🔥 Отопление (бойлер, климатик)'],
    ['internet',   '🌐 Интернет / TV'],
    ['cleaning',   '🧹 Чистене / битови'],
    ['other',      '📌 Друго'],
  ]

  const STATUS_BADGE = {
    open:        { text: '⏳ Отворен',    cls: 'bg-red-100 text-red-700' },
    in_progress: { text: '🔧 В процес',  cls: 'bg-yellow-100 text-yellow-800' },
    resolved:    { text: '✓ Разрешен',   cls: 'bg-green-100 text-green-800' },
    closed:      { text: '🔒 Затворен',  cls: 'bg-gray-200 text-gray-700' },
  }

  const load = () => {
    apiFetch(`${API}/api/tenant/tickets`).then(r => r.json()).then(setList).catch(() => setList([]))
  }
  useEffect(load, [])

  const openDetail = (id) => {
    apiFetch(`${API}/api/tenant/tickets/${id}`).then(r => r.json()).then(setDetail)
  }

  const submit = async () => {
    if (!form.title.trim()) { setErr('Заглавието е задължително'); return }
    setSubmitting(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('description', form.description.trim())
      fd.append('category', form.category)
      fd.append('priority', form.priority)
      files.forEach(f => fd.append('files', f))
      const r = await apiFetch(`${API}/api/tenant/tickets`, { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) { setErr(data.error || 'Грешка'); return }
      setShowNew(false)
      setForm({ title: '', description: '', category: 'other', priority: 'normal' })
      setFiles([]); if (fileRef.current) fileRef.current.value = ''
      load()
      openDetail(data.id)
    } catch (e) { setErr('Сървърна грешка') }
    finally { setSubmitting(false) }
  }

  if (detail) {
    return (
      <div>
        <button onClick={() => { setDetail(null); load() }} className="text-xs text-blue-600 mb-2">← Към списъка</button>
        <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
          <TicketDetail
            API={API}
            ticket={detail}
            attachmentPath="/api/tenant/support-attachments"
            postPath={`/api/tenant/tickets/${detail.id}/messages`}
            onAfterReply={() => openDetail(detail.id)}
          />
        </div>
      </div>
    )
  }

  if (list === null) return <Card><p className="text-slate-500 text-sm">Зареждане...</p></Card>

  return (
    <div className="space-y-3">
      {!showNew && (
        <button onClick={() => setShowNew(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl shadow">
          ➕ Нов сигнал за проблем
        </button>
      )}

      {showNew && (
        <Card>
          <h3 className="font-bold text-slate-800 mb-3">Нов сигнал</h3>
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">{err}</div>}
          <div className="space-y-2 text-sm">
            <div>
              <label className="text-xs text-slate-500 font-medium">Категория</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5">
                {TICKET_CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Заглавие</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Кратко описание (пр. 'Тече кранът в банята')"
                className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Описание (по желание)</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Кога започна? Колко често? Какво забелязахте?" rows={3}
                className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Приоритет</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  ['low', '🟢 Ниско'],
                  ['normal', '🔵 Нормално'],
                  ['high', '🟠 Високо'],
                  ['urgent', '🔴 Спешно'],
                ].map(([k, v]) => (
                  <button key={k} onClick={() => setForm({ ...form, priority: k })}
                    className={`text-xs px-3 py-1.5 rounded-full border ${form.priority === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-gray-300'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Снимки/файлове</label>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
                onChange={e => setFiles(Array.from(e.target.files || []))}
                className="w-full text-xs" />
              {files.length > 0 && (
                <div className="text-xs text-slate-500 mt-1">{files.length} файла избрани</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={submit} disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg flex-1">
                {submitting ? 'Изпраща...' : '📤 Изпрати сигнал'}
              </button>
              <button onClick={() => { setShowNew(false); setErr(null); setFiles([]) }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg">
                Отказ
              </button>
            </div>
          </div>
        </Card>
      )}

      {list.length === 0
        ? <Card><p className="text-slate-500 text-sm">Все още няма подадени сигнали.</p></Card>
        : list.map(t => {
            const st = STATUS_BADGE[t.status] || { text: t.status, cls: 'bg-gray-100' }
            return (
              <button key={t.id} onClick={() => openDetail(t.id)} className="w-full text-left">
                <Card>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-slate-800 flex-1 min-w-0 truncate">#{t.id} {t.title}</div>
                    {t.unread_for_tenant > 0 && (
                      <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {t.unread_for_tenant}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
                    <span className="text-[10px] text-slate-400">{(t.updated_at || '').slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  {t.last_message && (
                    <div className="text-xs text-slate-500 mt-1 italic truncate">
                      {t.last_message_role === 'admin' ? '👤 Управителят: ' : '🗣️ Вие: '}{t.last_message}
                    </div>
                  )}
                </Card>
              </button>
            )
          })
      }
    </div>
  )
}

function Consumption({ property }) {
  if (!property) return (
    <div className="bg-white rounded-lg p-4 text-sm text-gray-500 text-center">
      Все още няма обвързан имот.
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg p-3 border">
        <div className="text-xs text-gray-500">Имот</div>
        <div className="font-semibold">{property.адрес}</div>
      </div>
      {/* showAmounts=true за да види наемателят колко плащаш собственикът */}
      <UtilityHistoryChart propertyId={property.id} showAmounts={true} compact={true} />
    </div>
  )
}

function Profile({ me, onChangePassword }) {
  if (!me?.user) return null
  return (
    <div className="space-y-3">
      <Card title="Моят профил">
        <div className="space-y-2 text-sm">
          <Info label="Име" value={me.user.name || '—'} />
          <Info label="Имейл" value={me.user.email || '—'} />
          <Info label="Телефон" value={me.user.phone || '—'} />
          <Info label="Потребител" value={me.user.username} />
        </div>
        <button
          onClick={onChangePassword}
          className="mt-4 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg"
        >
          🔑 Смяна на парола
        </button>
      </Card>

      <AutopayCard />
    </div>
  )
}

function AutopayCard() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [showConfirmDisable, setShowConfirmDisable] = useState(false)

  const load = () => {
    apiFetch(`${API}/api/tenant/autopay-status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }))
  }
  useEffect(load, [])

  const setup = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/setup-autopay`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.url) {
        setErr(d.error || 'Грешка при стартиране на настройката')
        setLoading(false)
        return
      }
      window.location.href = d.url
    } catch {
      setErr('Сървърна грешка'); setLoading(false)
    }
  }

  const disable = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/disable-autopay`, { method: 'POST' })
      const d = await r.json()
      setLoading(false); setShowConfirmDisable(false)
      if (d.ok) load()
      else setErr(d.error || 'Грешка')
    } catch {
      setLoading(false); setErr('Сървърна грешка')
    }
  }

  if (!status) return <Card title="💳 Автоплащане"><p className="text-slate-500 text-sm">Зареждане...</p></Card>

  return (
    <Card title="💳 Автоплащане (SEPA Direct Debit)">
      {status.enabled ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#166534' }}>
              ✓ Активно
            </span>
            <span className="text-xs text-slate-500">от {fmtDate(status.activated_at)}</span>
          </div>
          <div className="text-sm text-slate-700 space-y-1 mb-3">
            <div>IBAN завършващ на: <strong className="font-mono">•••• {status.iban_last4 || '????'}</strong></div>
            <div>Месечно теглене на: <strong>{status.autopay_day || 5}-то число</strong></div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Наемът ще се тегли автоматично от Вашата банкова сметка всеки месец. Можете да деактивирате по всяко време.
          </p>
          {showConfirmDisable ? (
            <div className="flex gap-2">
              <button onClick={disable} disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg">
                {loading ? '...' : 'Да, деактивирай'}
              </button>
              <button onClick={() => setShowConfirmDisable(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg">
                Отказ
              </button>
            </div>
          ) : (
            <button onClick={() => setShowConfirmDisable(true)}
              className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg">
              🚫 Деактивирай автоплащане
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700 mb-3">
            Спестете време — оставете наемът да се тегли автоматично от Вашата банкова сметка всеки месец.
          </p>
          <ul className="text-xs text-slate-600 mb-4 space-y-1">
            <li>✓ Няма повече забравяне на падежи</li>
            <li>✓ Подписвате SEPA mandate веднъж</li>
            <li>✓ Можете да деактивирате по всяко време</li>
            <li>✓ Имате 8 седмици да оспорите всяко теглене</li>
          </ul>
          <button onClick={setup} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {loading ? 'Стартиране...' : '🏦 Активирай SEPA автоплащане'}
          </button>
        </>
      )}
      {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
    </Card>
  )
}

function ChangePassword({ isFirstLogin, onDone, onLogout }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (newPwd.length < 6)        return setErr('Паролата трябва да е поне 6 символа')
    if (newPwd !== confirm)       return setErr('Паролите не съвпадат')
    setLoading(true); setErr(null)
    apiFetch(`${API}/api/tenant/change-password`, {
      method: 'POST',
      body: JSON.stringify({ current_password: oldPwd, new_password: newPwd }),
    })
      .then(r => r.json())
      .then(d => { setLoading(false); if (d.ok) onDone(); else setErr(d.error || 'Грешка') })
      .catch(() => { setLoading(false); setErr('Грешка при сървъра') })
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f2f8' }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-2">
          {isFirstLogin ? 'Добре дошли!' : 'Смяна на парола'}
        </h2>
        {isFirstLogin && (
          <p className="text-sm text-slate-500 mb-4">
            Моля задайте Ваша лична парола, преди да продължите.
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
          {!isFirstLogin && (
            <div>
              <label className="block text-xs text-slate-600 mb-1">Текуща парола</label>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-600 mb-1">Нова парола</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" required minLength={6} />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Повторете новата парола</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg">
            {loading ? 'Запис...' : 'Запази'}
          </button>
          {!isFirstLogin && (
            <button type="button" onClick={onDone} className="w-full text-sm text-slate-500 hover:text-slate-700">
              Отказ
            </button>
          )}
          {isFirstLogin && (
            <button type="button" onClick={onLogout} className="w-full text-xs text-slate-500 hover:text-slate-700 mt-2">
              Изход
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// ─── Small UI helpers ─────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      {title && <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>}
      {children}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between border-b last:border-b-0 pb-1.5 last:pb-0">
      <span className="text-slate-600">{icon} {label}</span>
      <span className="font-mono text-slate-800">{value}</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    active:     { bg: '#dcfce7', fg: '#166534', label: 'Активен' },
    draft:      { bg: '#fef3c7', fg: '#92400e', label: 'Чернова' },
    sent:       { bg: '#dbeafe', fg: '#1e40af', label: 'Изпратен' },
    terminated: { bg: '#fee2e2', fg: '#991b1b', label: 'Прекратен' },
  }[status] || { bg: '#f1f5f9', fg: '#475569', label: status }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.label}
    </span>
  )
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return s }
}
