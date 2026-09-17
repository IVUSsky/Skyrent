import React, { useEffect, useState, useRef } from 'react'
import { apiFetch, authUrl } from '../api'
import UtilityHistoryChart from './UtilityHistoryChart'
import NotificationBell from './NotificationBell'
import { TicketDetail } from './Support'
import { useTenantI18n, getTenantLocale } from '../tenantI18n'

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
  const { lang, t: tr, setLang, langs } = useTenantI18n()
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
      setToast({ type: 'success', text: tr('toast.paid') })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('stripe_cancel') === '1') {
      setTab('invoices')
      setToast({ type: 'error', text: tr('toast.payCancel') })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('autopay_success') === '1') {
      setTab('profile')
      setToast({ type: 'success', text: tr('toast.autopayOn') })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('autopay_cancel') === '1') {
      setTab('profile')
      setToast({ type: 'error', text: tr('toast.autopayCancel') })
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
    return <div className="min-h-screen flex items-center justify-center text-slate-500">{tr('common.loading')}</div>
  }

  // Наемният договор е водещ за началния екран; интернет договорът (Sky като
  // доставчик) е допълнение и се показва в таб „Договор" със собствен етикет.
  const isRent = c => (c.kind || 'наем') !== 'интернет'
  const activeContract = me?.contracts?.find(c => c.status === 'active' && isRent(c))
    || me?.contracts?.find(c => c.status === 'active')
    || me?.contracts?.find(isRent)
    || me?.contracts?.[0]
  const property = me?.properties?.find(p => p.id === activeContract?.property_id) || me?.properties?.[0]

  return (
    <div className="min-h-screen pb-20 ten-root fin-surface" style={{ background: '#F4F1EA' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=Hanken+Grotesk:wght@400;500;600&display=swap');
        .ten-root{font-family:'Hanken Grotesk',system-ui,sans-serif;
          --surface:#FFFDF8;--surface-border:#E7E0D0;--page-fg:#1B201C;--muted:#6E746A;
          --accent:#B5872F;--pos:#1F9D63;--neg:#CF5247;}
        .ten-head{position:relative;background:#0C1A15;}
        .ten-head::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,#D8B66A,#85B8A0);opacity:.85;}
        .ten-hello{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9AA59C;}
        .ten-name{font-family:'Fraunces',serif;font-weight:400;font-size:17px;color:#ECE6D7;line-height:1.1;}
      `}</style>
      {/* PWA install banner */}
      {showInstallBanner && (
        <div className="bg-blue-600 text-white px-4 py-3 text-sm">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xl">📱</span>
              <div className="min-w-0">
                <div className="font-semibold">{tr('pwa.install')}</div>
                {isIos ? (
                  <div className="text-xs opacity-90">
                    {tr('pwa.iosHint')} <strong>Share</strong> → <strong>Add to Home Screen</strong>
                  </div>
                ) : (
                  <div className="text-xs opacity-90">{tr('pwa.quick')}</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {installPrompt && !isIos && (
                <button onClick={triggerInstall}
                  className="bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
                  {tr('pwa.installBtn')}
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
      <header className="ten-head shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {me?.white_label
              ? <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '.3px' }}>{me.brand || ''}</div>
              : <div style={{ background: 'white', borderRadius: '6px', padding: '3px 8px' }}>
                  <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '32px' }} />
                </div>}
            <div>
              <div className="ten-hello">{tr('common.hello')}</div>
              <div className="ten-name">{userName || me?.user?.name || tr('common.tenant')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={lang} onChange={e => setLang(e.target.value)}
              title="Език / Language / Язык / Мова"
              className="text-xs font-semibold text-slate-300 bg-transparent hover:text-white px-2 py-1 rounded border border-white/20 focus:outline-none cursor-pointer">
              {langs.map(l => <option key={l.code} value={l.code} style={{ color: '#0f172a' }}>{l.label}</option>)}
            </select>
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
              {tr('common.logout')}
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
      <nav className="fixed bottom-0 inset-x-0 border-t shadow-lg z-20"
           style={{ background: '#FFFDF8', borderColor: '#E7E0D0' }}>
        <div className="max-w-2xl mx-auto grid grid-cols-10">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="py-2 flex flex-col items-center text-xs"
              style={{
                color: tab === t.id ? '#B5872F' : '#8A9088',
                fontWeight: tab === t.id ? 600 : 400,
                borderTop: tab === t.id ? '2px solid #B5872F' : '2px solid transparent',
              }}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-1">{tr('tab.' + t.id, t.label)}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Chat({ prefill = '', onPrefillConsumed }) {
  const { t: tr } = useTenantI18n()
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
      if (!r.ok) throw new Error(data.error || tr('common.error'))
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, created_at: new Date().toISOString(), _local: true }])
    } catch (e) {
      setToast({ type: 'error', text: tr('chat.error') + e.message })
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
            <div>{tr('chat.empty')}</div>
            <div className="text-xs mt-2 text-slate-300">{tr('chat.example')}</div>
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
              <span className="inline-block animate-pulse">{tr('chat.typing')}</span>
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
          placeholder={tr('chat.placeholder')}
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
  const { t: tr, locale } = useTenantI18n()
  if (!property) {
    return <Card>
      <p className="text-slate-600 text-sm">{tr('home.noContract')}</p>
      <p className="text-slate-500 text-xs mt-2">{tr('home.contactUs')}</p>
    </Card>
  }
  const suggestions = [
    tr('home.q1'),
    tr('home.q2'),
    tr('home.q3'),
    tr('home.q4'),
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
            <div className="text-sm font-semibold text-slate-800">{tr('home.aiTitle')}</div>
            <div className="text-xs text-slate-600">{tr('home.aiSub')}</div>
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
            <div className="text-xs uppercase tracking-wide text-slate-400">{tr('common.property')}</div>
            <h2 className="text-lg font-bold text-slate-800">{property.адрес}</h2>
            {property.район && <div className="text-sm text-slate-500">{property.район}</div>}
          </div>
          <span className="text-2xl">🏠</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          {property.тип && <Info label={tr('home.type')} value={property.тип} />}
          {property.площ && <Info label={tr('home.area')} value={`${property.площ} м²`} />}
          {contract?.monthly_rent && <Info label={(contract.kind || 'наем') === 'интернет' ? tr('home.internet') : tr('home.rent')} value={`${Number(contract.monthly_rent).toLocaleString(locale)} ${contract.currency || 'EUR'}${tr('common.month')}`} />}
          {contract?.end_date && <Info label={(contract.kind || 'наем') === 'интернет' ? tr('home.netContractEnds') : tr('home.contractEnds')} value={fmtDate(contract.end_date)} />}
        </div>
      </Card>

      {(property.абонат_ток || property.абонат_вода || property.абонат_тец) && (
        <Card title={tr('home.utilityIds')}>
          <div className="space-y-2 text-sm">
            {property.абонат_ток  && <Row icon="⚡" label={tr('home.electricity')} value={property.абонат_ток} />}
            {property.абонат_вода && <Row icon="💧" label={tr('home.water')} value={property.абонат_вода} />}
            {property.абонат_тец  && <Row icon="🔥" label={tr('home.heating')} value={property.абонат_тец} />}
            {property.абонат_вход && <Row icon="🏢" label={tr('home.entranceFee')} value={property.абонат_вход} />}
          </div>
        </Card>
      )}

      <Card title={tr('home.contact')}>
        <a href="mailto:info@skycapital.pro" className="block text-sm text-blue-600 hover:underline mb-1">📧 info@skycapital.pro</a>
        {property.телефон && <div className="text-sm text-slate-600">📞 {property.телефон}</div>}
      </Card>
    </div>
  )
}

function Photos({ property }) {
  const { t: tr } = useTenantI18n()
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    if (!property?.id) return
    apiFetch(`${API}/api/tenant/properties/${property.id}/photos`)
      .then(r => r.json())
      .then(setPhotos)
      .catch(() => setPhotos([]))
  }, [property?.id])
  if (!property) return <Card><p className="text-slate-500 text-sm">{tr('photos.none')}</p></Card>
  if (photos === null) return <Card><p className="text-slate-500 text-sm">{tr('photos.loading')}</p></Card>
  if (photos.length === 0) return <Card><p className="text-slate-500 text-sm">{tr('photos.empty')}</p></Card>
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
  const { t: tr, locale } = useTenantI18n()
  if (!contracts.length) return <Card><p className="text-slate-500 text-sm">{tr('contract.none')}</p></Card>
  return (
    <div className="space-y-3">
      {contracts.map(c => (
        <Card key={c.id}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase text-slate-400">
                {(c.kind || 'наем') === 'интернет' ? tr('contract.internet') : tr('contract.rent')} · № {c.contract_number || 'Д' + c.id}
              </div>
              <div className="font-semibold text-slate-800">{c.property_address}</div>
              <div className="text-xs text-slate-500 mt-1">
                {fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : tr('contract.openEnded')}
              </div>
              <div className="mt-2 text-sm">
                <strong>{Number(c.monthly_rent).toLocaleString(locale)} {c.currency || 'EUR'}</strong>{tr('common.month')}{(c.kind || 'наем') === 'интернет' ? tr('contract.internetSuffix') : ''}
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
              {tr('contract.download')}
            </a>
          )}
        </Card>
      ))}
    </div>
  )
}

function Invoices() {
  const { t: tr, locale } = useTenantI18n()
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
        setErr(data.error || tr('inv.payError'))
        setPayingId(null)
        return
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (e) {
      setErr(tr('common.serverError'))
      setPayingId(null)
    }
  }

  if (list === null) return <Card><p className="text-slate-500 text-sm">{tr('common.loading')}</p></Card>
  if (list.length === 0) return <Card><p className="text-slate-500 text-sm">{tr('inv.empty')}</p></Card>

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
                  {isCN && <span className="text-xs text-red-600 font-semibold">{tr('inv.creditNote')}</span>}
                  {isPaid && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#dcfce7', color: '#166534' }}>
                      {tr('inv.paid')}
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
                    <div className="font-semibold text-slate-700 mb-0.5">{tr('inv.includes')}</div>
                    {inv.addons.map((a, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{a.name}{a.kind === 'deposit' ? tr('inv.deposit') : ''}</span>
                        <span className="ml-2">{Number(a.amount).toLocaleString(locale)} €</span>
                      </div>
                    ))}
                  </div>
                )}
                {inv.due_date && !isPaid && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {tr('inv.due')}{fmtDate(inv.due_date)}
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
                    {isPaying ? '...' : tr('inv.pay')}
                  </button>
                )}
                {!isPaid && !isCN && stripeOff && (
                  <span className="text-[10px] text-slate-500 italic text-center max-w-[100px]">
                    {tr('inv.bankOnly')}
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
  const { t: tr } = useTenantI18n()
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
    } catch (e) { setErr(tr('common.loadError')) }
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
      if (!r.ok) { setErr(data.error || tr('common.error')); return }
      setMsg(tr('addon.requested', { name: svc.name }))
      load()
    } catch (e) { setErr(tr('common.serverError')) }
    finally { setBusy(null) }
  }

  const cancel = async (sub) => {
    if (!confirm(tr('addon.cancelAsk', { name: sub.service_name }))) return
    try {
      const r = await apiFetch(`${API}/api/tenant/addons/mine/${sub.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) { setErr(data.error || tr('common.error')); return }
      load()
    } catch (e) { setErr(tr('common.serverError')) }
  }

  if (catalog === null || mine === null) return <Card><p className="text-slate-500 text-sm">{tr('common.loading')}</p></Card>

  // Map: which services have an active/pending sub
  const subByService = {}
  for (const s of mine) {
    if (s.status === 'pending' || s.status === 'active') subByService[s.service_id] = s
  }

  const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })

  const STATUS_LABEL = {
    pending:  { text: tr('addon.pending'),  cls: 'bg-yellow-100 text-yellow-800' },
    active:   { text: tr('addon.active'),   cls: 'bg-green-100 text-green-800' },
    stopped:  { text: tr('addon.stopped'),  cls: 'bg-gray-200 text-gray-700' },
    rejected: { text: tr('addon.rejected'), cls: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{msg}</div>}

      {/* My subscriptions */}
      {mine.length > 0 && (
        <Card title={tr('addon.mine')}>
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
                      {fmt(s.service_monthly_price)} {tr('addon.perMonth')}
                      {s.service_deposit_amount > 0 && (
                        <> · {tr('addon.depositWord')} {fmt(s.service_deposit_amount)} €{s.deposit_charged ? (s.deposit_refunded ? tr('addon.depRefunded') : tr('addon.depHeld')) : tr('addon.depPending')}</>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.text}</span>
                  {s.status === 'pending' && (
                    <button onClick={() => cancel(s)} className="text-xs text-red-600 hover:text-red-800 px-2 py-1">{tr('addon.cancel')}</button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Catalog */}
      <Card title={tr('addon.available')}>
        <p className="text-xs text-slate-500 mb-3">
          {tr('addon.info')}
          {catalog.some(c => c.deposit_amount > 0) && tr('addon.depositInfo')}
        </p>
        <div className="space-y-2">
          {catalog.map(svc => {
            const sub = subByService[svc.id]
            const disabled = !!sub || busy === svc.id
            return (
              <div key={svc.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                {svc.photo_path && (
                  <img src={authUrl(`${API}/api/tenant/addons/catalog/${svc.id}/photo`)} alt=""
                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">
                    {!svc.photo_path && <span className="mr-1 text-lg">{svc.icon}</span>}{svc.name}
                  </div>
                  {svc.description && (
                    <div className="text-xs text-slate-500">{svc.description}</div>
                  )}
                  <div className="text-xs text-slate-600 mt-0.5">
                    <strong>{fmt(svc.monthly_price)} {tr('addon.perMonth')}</strong>
                    {svc.deposit_amount > 0 && (
                      <span className="text-orange-700 ml-2">{tr('addon.plusDeposit')} {fmt(svc.deposit_amount)} €</span>
                    )}
                  </div>
                </div>
                {sub ? (
                  <span className="text-xs text-slate-500 italic">{sub.status === 'active' ? tr('addon.stActive') : tr('addon.stRequested')}</span>
                ) : (
                  <button
                    onClick={() => request(svc)}
                    disabled={disabled}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                  >
                    {busy === svc.id ? '...' : tr('addon.request')}
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
  const { t: tr, locale } = useTenantI18n()
  const [data, setData] = useState(null)
  const [busy, setBusy]   = useState(null) // plan id while buying
  const [err, setErr]     = useState(null)
  const [macInput, setMacInput] = useState('')
  const [savingMac, setSavingMac] = useState(false)

  const load = () => {
    apiFetch(`${API}/api/tenant/internet`).then(r => r.json()).then(d => {
      setData(d); setMacInput(d?.account?.mac_address || '')
    }).catch(() => setErr(tr('common.loadError')))
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
      if (!r.ok || !d.url) { setErr(d.error || tr('common.error')); setBusy(null); return }
      window.location.href = d.url
    } catch (e) { setErr(tr('common.serverError')); setBusy(null) }
  }

  const saveMac = async () => {
    setSavingMac(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/internet/mac`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac_address: macInput }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || tr('common.error')); return }
      load()
    } catch (e) { setErr(tr('common.serverError')) }
    finally { setSavingMac(false) }
  }

  if (data === null) return <Card><p className="text-slate-500 text-sm">{tr('common.loading')}</p></Card>

  if (data.has_router === false) {
    return (
      <Card title={tr('net.title')}>
        <p className="text-slate-500 text-sm">
          {tr('net.noService2')}
          {' '}{tr('net.noService3')}
        </p>
      </Card>
    )
  }

  const acc = data.account
  const isActive = acc.status === 'active' && acc.valid_until && new Date(acc.valid_until) > new Date()
  const validUntil = acc.valid_until ? new Date(acc.valid_until + (acc.valid_until.endsWith('Z') ? '' : 'Z')) : null
  const hoursLeft = validUntil ? Math.max(0, (validUntil.getTime() - Date.now()) / 3600000) : 0

  const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })
  const fmtTimeLeft = (h) => {
    if (h < 1)  return `${Math.round(h * 60)} ${tr('net.min')}`
    if (h < 48) return `${Math.round(h)} ${tr('net.hours')}`
    return `${Math.round(h / 24)} ${tr('net.daysLeft')}`
  }

  return (
    <div className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

      {/* Status card */}
      <Card title={tr('net.title')}>
        {isActive ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <div className="flex items-baseline justify-between">
              <div className="text-green-800 font-bold">{tr('net.active')}</div>
              <div className="text-xs text-green-600">{tr('net.remaining')}{fmtTimeLeft(hoursLeft)}</div>
            </div>
            <div className="text-xs text-green-700 mt-1">{tr('net.until')}{validUntil.toLocaleString(locale)}</div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <div className="text-red-800 font-bold">{tr('net.noPackage')}</div>
            <div className="text-xs text-red-700 mt-1">{tr('net.choose')}</div>
          </div>
        )}

        {data.router_mode !== 'flat' && (
          <>
            <div className="bg-slate-50 rounded p-3 mb-3 text-sm">
              <div className="text-xs text-slate-500 mb-1">{tr('net.wifiCreds')}</div>
              <div className="flex justify-between">
                <span className="text-slate-600">{tr('net.username')}:</span>
                <span className="font-mono font-semibold">{acc.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{tr('net.password')}:</span>
                <span className="font-mono font-semibold">{acc.password}</span>
              </div>
            </div>

            <div className="text-xs text-slate-600">
              <div className="font-medium mb-1">{tr('net.macTitle')}</div>
              <div className="text-slate-500 mb-2">{tr('net.macHint2')}</div>
              <div className="flex gap-2">
                <input value={macInput} onChange={e => setMacInput(e.target.value.toUpperCase())}
                  placeholder="AA:BB:CC:DD:EE:FF" maxLength={17}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
                <button onClick={saveMac} disabled={savingMac || macInput === (acc.mac_address || '')}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded">
                  {savingMac ? '...' : tr('common.save')}
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Plans */}
      <Card title={tr('net.buyTitle')}>
        <p className="text-xs text-slate-500 mb-3">{tr('net.buyInfo')}</p>
        <div className="space-y-2">
          {data.plans.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{p.name}</div>
                {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                <div className="text-xs text-slate-600 mt-0.5">
                  <strong>{fmt(p.price)} €</strong>
                  <span className="text-slate-400 ml-1">· {p.duration_days} {tr('common.days')}</span>
                  {p.speed_down_mbps && <span className="text-slate-400 ml-1">· {p.speed_down_mbps}/{p.speed_up_mbps || '?'} Mbps</span>}
                </div>
              </div>
              <button onClick={() => buy(p)} disabled={busy === p.id}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap">
                {busy === p.id ? '...' : tr('net.buyBtn')}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Last purchases */}
      {data.purchases.length > 0 && (
        <Card title={tr('net.history')}>
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
                    {p.status === 'paid' ? tr('net.paidSt') : tr('net.pendingSt')}
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
  const { t: tr } = useTenantI18n()
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null) // ticket detail object
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'other', priority: 'normal' })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  const TICKET_CATS = [
    ['plumbing',   tr('tk.catPlumbing')],
    ['electrical', tr('tk.catElectrical')],
    ['appliance',  tr('tk.catAppliance')],
    ['heating',    tr('tk.catHeating')],
    ['internet',   tr('tk.catInternet')],
    ['cleaning',   tr('tk.catCleaning')],
    ['other',      tr('tk.catOther')],
  ]

  const STATUS_BADGE = {
    open:        { text: tr('tk.stOpen'),     cls: 'bg-red-100 text-red-700' },
    in_progress: { text: tr('tk.stProgress'), cls: 'bg-yellow-100 text-yellow-800' },
    resolved:    { text: tr('tk.stResolved'), cls: 'bg-green-100 text-green-800' },
    closed:      { text: tr('tk.stClosed'),   cls: 'bg-gray-200 text-gray-700' },
  }

  const load = () => {
    apiFetch(`${API}/api/tenant/tickets`).then(r => r.json()).then(setList).catch(() => setList([]))
  }
  useEffect(load, [])

  const openDetail = (id) => {
    apiFetch(`${API}/api/tenant/tickets/${id}`).then(r => r.json()).then(setDetail)
  }

  const submit = async () => {
    if (!form.title.trim()) { setErr(tr('tk.titleRequired')); return }
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
      if (!r.ok) { setErr(data.error || tr('common.error')); return }
      setShowNew(false)
      setForm({ title: '', description: '', category: 'other', priority: 'normal' })
      setFiles([]); if (fileRef.current) fileRef.current.value = ''
      load()
      openDetail(data.id)
    } catch (e) { setErr(tr('common.serverError')) }
    finally { setSubmitting(false) }
  }

  if (detail) {
    return (
      <div>
        <button onClick={() => { setDetail(null); load() }} className="text-xs text-blue-600 mb-2">{tr('tk.back')}</button>
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

  if (list === null) return <Card><p className="text-slate-500 text-sm">{tr('common.loading')}</p></Card>

  return (
    <div className="space-y-3">
      {!showNew && (
        <button onClick={() => setShowNew(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl shadow">
          {tr('tk.new')}
        </button>
      )}

      {showNew && (
        <Card>
          <h3 className="font-bold text-slate-800 mb-3">{tr('tk.newTitle')}</h3>
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2 mb-3">{err}</div>}
          <div className="space-y-2 text-sm">
            <div>
              <label className="text-xs text-slate-500 font-medium">{tr('tk.category')}</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5">
                {TICKET_CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">{tr('tk.title')}</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={tr('tk.titlePh')}
                className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">{tr('tk.desc')}</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={tr('tk.descPh')} rows={3}
                className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">{tr('tk.priority')}</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  ['low', tr('tk.prLow')],
                  ['normal', tr('tk.prNormal')],
                  ['high', tr('tk.prHigh')],
                  ['urgent', tr('tk.prUrgent')],
                ].map(([k, v]) => (
                  <button key={k} onClick={() => setForm({ ...form, priority: k })}
                    className={`text-xs px-3 py-1.5 rounded-full border ${form.priority === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-gray-300'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">{tr('tk.files')}</label>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
                onChange={e => setFiles(Array.from(e.target.files || []))}
                className="w-full text-xs" />
              {files.length > 0 && (
                <div className="text-xs text-slate-500 mt-1">{files.length}{tr('tk.filesChosen')}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={submit} disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg flex-1">
                {submitting ? tr('tk.sending') : tr('tk.send')}
              </button>
              <button onClick={() => { setShowNew(false); setErr(null); setFiles([]) }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg">
                {tr('common.cancel')}
              </button>
            </div>
          </div>
        </Card>
      )}

      {list.length === 0
        ? <Card><p className="text-slate-500 text-sm">{tr('tk.empty')}</p></Card>
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
                      {t.last_message_role === 'admin' ? tr('tk.manager') : tr('tk.you')}{t.last_message}
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
  const { t: tr } = useTenantI18n()
  if (!property) return (
    <div className="bg-white rounded-lg p-4 text-sm text-gray-500 text-center">
      {tr('cons.none')}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg p-3 border">
        <div className="text-xs text-gray-500">{tr('common.property')}</div>
        <div className="font-semibold">{property.адрес}</div>
      </div>
      {/* showAmounts=true за да види наемателят колко плащаш собственикът */}
      <UtilityHistoryChart propertyId={property.id} showAmounts={true} compact={true} />
    </div>
  )
}

function Profile({ me, onChangePassword }) {
  const { t: tr } = useTenantI18n()
  if (!me?.user) return null
  return (
    <div className="space-y-3">
      <Card title={tr('prof.title')}>
        <div className="space-y-2 text-sm">
          <Info label={tr('common.name')} value={me.user.name || '—'} />
          <Info label={tr('common.email')} value={me.user.email || '—'} />
          <Info label={tr('common.phone')} value={me.user.phone || '—'} />
          <Info label={tr('prof.username')} value={me.user.username} />
        </div>
        <button
          onClick={onChangePassword}
          className="mt-4 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg"
        >
          {tr('prof.changePwd')}
        </button>
      </Card>

      <AutopayCard />
    </div>
  )
}

function AutopayCard() {
  const { t: tr } = useTenantI18n()
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
        setErr(d.error || tr('ap.setupError'))
        setLoading(false)
        return
      }
      window.location.href = d.url
    } catch {
      setErr(tr('common.serverError')); setLoading(false)
    }
  }

  const disable = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await apiFetch(`${API}/api/tenant/disable-autopay`, { method: 'POST' })
      const d = await r.json()
      setLoading(false); setShowConfirmDisable(false)
      if (d.ok) load()
      else setErr(d.error || tr('common.error'))
    } catch {
      setLoading(false); setErr(tr('common.serverError'))
    }
  }

  if (!status) return <Card title={tr('ap.title')}><p className="text-slate-500 text-sm">{tr('common.loading')}</p></Card>

  return (
    <Card title={tr('ap.titleFull')}>
      {status.enabled ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#166534' }}>
              {tr('ap.activeSt')}
            </span>
            <span className="text-xs text-slate-500">{tr('ap.since')}{fmtDate(status.activated_at)}</span>
          </div>
          <div className="text-sm text-slate-700 space-y-1 mb-3">
            <div>{tr('ap.ibanEnding')}<strong className="font-mono">•••• {status.iban_last4 || '????'}</strong></div>
            <div>{tr('ap.monthlyOn')}<strong>{status.autopay_day || 5}{tr('ap.dayOfMonth')}</strong></div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {tr('ap.infoActive')}
          </p>
          {showConfirmDisable ? (
            <div className="flex gap-2">
              <button onClick={disable} disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg">
                {loading ? '...' : tr('ap.confirmOff')}
              </button>
              <button onClick={() => setShowConfirmDisable(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg">
                {tr('common.cancel')}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowConfirmDisable(true)}
              className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg">
              {tr('ap.deactivate')}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700 mb-3">
            {tr('ap.pitch')}
          </p>
          <ul className="text-xs text-slate-600 mb-4 space-y-1">
            <li>{tr('ap.b1')}</li>
            <li>{tr('ap.b2')}</li>
            <li>{tr('ap.b3')}</li>
            <li>{tr('ap.b4')}</li>
          </ul>
          <button onClick={setup} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {loading ? tr('ap.starting') : tr('ap.activate')}
          </button>
        </>
      )}
      {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
    </Card>
  )
}

function ChangePassword({ isFirstLogin, onDone, onLogout }) {
  const { t: tr } = useTenantI18n()
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (newPwd.length < 6)        return setErr(tr('pwd.min'))
    if (newPwd !== confirm)       return setErr(tr('pwd.mismatch'))
    setLoading(true); setErr(null)
    apiFetch(`${API}/api/tenant/change-password`, {
      method: 'POST',
      body: JSON.stringify({ current_password: oldPwd, new_password: newPwd }),
    })
      .then(r => r.json())
      .then(d => { setLoading(false); if (d.ok) onDone(); else setErr(d.error || tr('common.error')) })
      .catch(() => { setLoading(false); setErr(tr('pwd.serverError')) })
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f2f8' }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-2">
          {isFirstLogin ? tr('pwd.welcome') : tr('pwd.title')}
        </h2>
        {isFirstLogin && (
          <p className="text-sm text-slate-500 mb-4">
            {tr('pwd.first')}
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
          {!isFirstLogin && (
            <div>
              <label className="block text-xs text-slate-600 mb-1">{tr('pwd.current')}</label>
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-600 mb-1">{tr('pwd.new')}</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" required minLength={6} />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">{tr('pwd.repeat')}</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg">
            {loading ? tr('pwd.saving') : tr('common.save')}
          </button>
          {!isFirstLogin && (
            <button type="button" onClick={onDone} className="w-full text-sm text-slate-500 hover:text-slate-700">
              {tr('common.cancel')}
            </button>
          )}
          {isFirstLogin && (
            <button type="button" onClick={onLogout} className="w-full text-xs text-slate-500 hover:text-slate-700 mt-2">
              {tr('common.logout')}
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
  const { t: tr } = useTenantI18n()
  const cfg = {
    active:     { bg: '#dcfce7', fg: '#166534', label: tr('status.active') },
    draft:      { bg: '#fef3c7', fg: '#92400e', label: tr('status.draft') },
    sent:       { bg: '#dbeafe', fg: '#1e40af', label: tr('status.sent') },
    terminated: { bg: '#fee2e2', fg: '#991b1b', label: tr('status.terminated') },
  }[status] || { bg: '#f1f5f9', fg: '#475569', label: status }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.label}
    </span>
  )
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString(getTenantLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return s }
}
