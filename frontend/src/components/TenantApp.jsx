import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { id: 'home',      label: 'Начало',   icon: '🏠' },
  { id: 'photos',    label: 'Снимки',   icon: '📷' },
  { id: 'contract',  label: 'Договор',  icon: '📋' },
  { id: 'invoices',  label: 'Фактури',  icon: '🧾' },
  { id: 'profile',   label: 'Профил',   icon: '👤' },
]

export default function TenantApp({ userName, onLogout, mustChangePassword }) {
  const [tab, setTab] = useState('home')
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPwd, setShowPwd] = useState(!!mustChangePassword)
  const [toast, setToast] = useState(null)

  const loadMe = () => {
    setLoading(true)
    apiFetch(`${API}/api/tenant/me`)
      .then(r => r.json())
      .then(data => { setMe(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadMe() }, [])

  // Handle Stripe redirect back (?stripe_success=1 or ?stripe_cancel=1)
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
          <button onClick={onLogout} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10">
            Изход
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {tab === 'home'     && <Home me={me} property={property} contract={activeContract} />}
        {tab === 'photos'   && <Photos me={me} property={property} />}
        {tab === 'contract' && <Contract contracts={me?.contracts || []} />}
        {tab === 'invoices' && <Invoices />}
        {tab === 'profile'  && <Profile me={me} onChangePassword={() => setShowPwd(true)} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-20">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
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

function Home({ me, property, contract }) {
  if (!property) {
    return <Card>
      <p className="text-slate-600 text-sm">Все още няма активен договор за имот, свързан с Вашия профил.</p>
      <p className="text-slate-500 text-xs mt-2">Свържете се с екипа на Sky Capital за повече информация.</p>
    </Card>
  }
  return (
    <div className="space-y-4">
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
      {photos.map(p => (
        <a key={p.id} href={`${API}/api/tenant/photos/${p.id}/file`} target="_blank" rel="noopener" className="block">
          <img
            src={`${API}/api/tenant/photos/${p.id}/file`}
            alt={p.caption || ''}
            className="w-full aspect-square object-cover rounded-lg shadow-sm bg-slate-200"
            loading="lazy"
          />
          {p.caption && <div className="text-xs text-slate-500 mt-1 truncate">{p.caption}</div>}
        </a>
      ))}
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
              href={`${API}/api/tenant/contracts/${c.id}/pdf`}
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
        const canPay     = !isPaid && !isCN
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
                {inv.pdf_path && (
                  <a
                    href={`${API}/api/tenant/invoices/${inv.id}/pdf`}
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
    </div>
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
