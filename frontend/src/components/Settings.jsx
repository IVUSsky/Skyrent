import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'
import { HIDEABLE } from '../menuTabs'
import TwoFactorSetup from './TwoFactorSetup'

export default function Settings({ API }) {
  const [settings, setSettings] = useState(null)
  const [tenantMap, setTenantMap] = useState([])
  const [expenseCats, setExpenseCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [smtp, setSmtp] = useState({ host: '', port: '587', user: '', pass: '', from_name: '' })
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [issuer, setIssuer] = useState({ name: '', address: '', eik: '', mol: '', vat_number: '', iban: '', bic: '', place: '', email: '', phone: '', vat_rate: '0' })
  const [entityType, setEntityType] = useState('company') // 'company' | 'individual'
  const [kontrolisiEmail, setKontrolisiEmail] = useState('')
  const [kontrolisiAuto, setKontrolisiAuto] = useState(false)
  const [autoInvoiceActivate, setAutoInvoiceActivate] = useState(false)
  const [counter, setCounter] = useState(null)
  const [nextMain, setNextMain] = useState('')
  const [nextRent, setNextRent] = useState('')
  const [savingCounter, setSavingCounter] = useState(false)
  const [autopayResult, setAutopayResult] = useState(null)
  const [autopayLoading, setAutopayLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'broker', name: '', email: '' })
  const [savingUser, setSavingUser] = useState(false)
  const [hiddenMenus, setHiddenMenus] = useState([])
  const [savingMenus, setSavingMenus] = useState(false)
  const [whiteLabel, setWhiteLabel] = useState({ available: false, enabled: false })

  const toggleWhiteLabel = () => {
    const next = !whiteLabel.enabled
    setWhiteLabel(w => ({ ...w, enabled: next }))
    apiFetch(`${API}/api/white-label`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) })
      .then(r => r.json()).then(d => {
        if (d.ok) showToast(next ? 'White-label включен' : 'White-label изключен')
        else { setWhiteLabel(w => ({ ...w, enabled: !next })); showToast(d.error || 'Грешка', 'error') }
      }).catch(() => { setWhiteLabel(w => ({ ...w, enabled: !next })); showToast('Грешка', 'error') })
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadCounter = () => {
    apiFetch(`${API}/api/invoices/counter`).then(r => r.json()).then(d => {
      setCounter(d)
      setNextMain(String(d.main?.next_sequential ?? ''))
      setNextRent(String(d.rent?.next_sequential ?? ''))
    }).catch(() => {})
  }

  const saveCounter = (series, value) => {
    setSavingCounter(series)
    apiFetch(`${API}/api/invoices/counter`, {
      method: 'PUT',
      body: JSON.stringify({ series, next_sequential: Number(value) }),
    })
      .then(r => r.json())
      .then(d => {
        setSavingCounter(false)
        if (d.ok) { showToast(`Следваща ${series === 'rent' ? 'наемна ' : ''}фактура: ${d.next_number}`); loadCounter() }
        else showToast(d.error || 'Грешка', 'error')
      })
      .catch(() => { setSavingCounter(false); showToast('Грешка при запис', 'error') })
  }

  useEffect(() => {
    apiFetch(`${API}/api/users`).then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d) }).catch(() => {})
    apiFetch(`${API}/api/white-label`).then(r => r.json()).then(d => { if (d && typeof d.available === 'boolean') setWhiteLabel(d) }).catch(() => {})
    loadCounter()
    apiFetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        const tm = data.tenant_map || {}
        setTenantMap(Object.entries(tm).map(([keyword, property_id]) => ({ keyword, property_id: String(property_id) })))
        setExpenseCats(data.expense_cats || [])
        if (data.smtp) setSmtp(data.smtp)
        if (data.issuer) setIssuer(data.issuer)
        if (data.entity_type === 'individual' || data.entity_type === 'company') setEntityType(data.entity_type)
        if (data.kontrolisi_email) setKontrolisiEmail(data.kontrolisi_email)
        setKontrolisiAuto(data.kontrolisi_auto === true || data.kontrolisi_auto === 'true' || data.kontrolisi_auto === 1)
        setAutoInvoiceActivate(data.auto_invoice_on_activate === true || data.auto_invoice_on_activate === 'true' || data.auto_invoice_on_activate === 1)
        try { setHiddenMenus(Array.isArray(data.menu_hidden) ? data.menu_hidden : JSON.parse(data.menu_hidden || '[]')) } catch { setHiddenMenus([]) }
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const addTenantRow = () => {
    setTenantMap(prev => [...prev, { keyword: '', property_id: '' }])
  }

  const updateTenantRow = (idx, field, value) => {
    setTenantMap(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  const removeTenantRow = (idx) => {
    setTenantMap(prev => prev.filter((_, i) => i !== idx))
  }

  const addExpenseCat = () => {
    const cat = newCat.trim().toLowerCase()
    if (cat && !expenseCats.includes(cat)) {
      setExpenseCats(prev => [...prev, cat])
      setNewCat('')
    }
  }

  const removeExpenseCat = (cat) => {
    setExpenseCats(prev => prev.filter(c => c !== cat))
  }

  const handleSave = () => {
    // Build tenant_map object from rows, skip empty keywords
    const tenant_map = {}
    tenantMap.forEach(row => {
      const kw = row.keyword.trim().toLowerCase()
      const pid = Number(row.property_id)
      if (kw && pid) tenant_map[kw] = pid
    })

    setSaving(true)
    apiFetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_map, expense_cats: expenseCats, smtp, issuer, entity_type: entityType, kontrolisi_email: kontrolisiEmail, kontrolisi_auto: kontrolisiAuto, auto_invoice_on_activate: autoInvoiceActivate }),
    })
      .then(r => r.json())
      .then(data => {
        setSaving(false)
        if (data.ok) showToast('Настройките са запазени успешно!')
        else throw new Error(data.error || 'Unknown error')
      })
      .catch(e => { setSaving(false); showToast('Грешка: ' + e.message, 'error') })
  }

  const toggleMenu = (id) => {
    setHiddenMenus(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const saveMenus = () => {
    setSavingMenus(true)
    apiFetch(`${API}/api/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_hidden: hiddenMenus }),
    }).then(r => r.json()).then(d => {
      setSavingMenus(false)
      if (d.ok) {
        showToast('Менютата са запазени!')
        window.dispatchEvent(new CustomEvent('skyrent:menus-changed', { detail: hiddenMenus }))
      } else showToast('Грешка: ' + (d.error || ''), 'error')
    }).catch(e => { setSavingMenus(false); showToast('Грешка: ' + e.message, 'error') })
  }

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  return (
    <div className="max-w-3xl fin-surface">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Настройки</h2>

      <section className="bg-white rounded-xl shadow p-5 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">🧭 Менюта в приложението</h3>
        <p className="text-sm text-gray-500 mb-3">
          Изключи менютата, които не ползваш — ще изчезнат от лентата горе. (Системните остават винаги.)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {HIDEABLE.map(t => {
            const on = !hiddenMenus.includes(t.id)
            return (
              <label key={t.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${on ? 'bg-blue-50 border-blue-200 text-gray-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                <input type="checkbox" checked={on} onChange={() => toggleMenu(t.id)} className="w-4 h-4" />
                <span className="truncate">{t.label}</span>
              </label>
            )
          })}
        </div>
        <button onClick={saveMenus} disabled={savingMenus}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
          {savingMenus ? 'Запазва...' : 'Запази менютата'}
        </button>
      </section>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 2FA — security section comes first */}
      <div className="mb-6">
        <TwoFactorSetup API={API} />
      </div>

      {/* Users */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-3">👥 Потребители и достъп</h3>
        <div className="space-y-2 mb-4">
          {users.map(u => {
            const roleStyles = {
              admin:   { bg: 'bg-purple-100', fg: 'text-purple-700', label: 'Администратор' },
              broker:  { bg: 'bg-blue-100',   fg: 'text-blue-700',   label: 'Брокер' },
              tenant:  { bg: 'bg-green-100',  fg: 'text-green-700',  label: 'Наемател' },
            }[u.role] || { bg: 'bg-gray-100', fg: 'text-gray-700', label: u.role || '—' }
            const changeRole = (newRole) => {
              if (newRole === u.role) return
              apiFetch(`${API}/api/users/${u.id}`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole, name: u.name || '', email: u.email || '' }),
              }).then(r => r.json()).then(() => {
                setUsers(us => us.map(x => x.id === u.id ? { ...x, role: newRole } : x))
                showToast(`Ролята е променена на "${{admin:'Администратор',broker:'Брокер',tenant:'Наемател'}[newRole] || newRole}"`)
              })
            }
            return (
              <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex-1">
                  <span className="font-medium text-sm text-gray-800">{u.name || u.username}</span>
                  <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
                  {u.email && <span className="text-xs text-gray-400 ml-2">{u.email}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleStyles.bg} ${roleStyles.fg}`}>
                  {roleStyles.label}
                </span>
                <select value={u.role} onChange={e => changeRole(e.target.value)}
                  disabled={u.role === 'admin' && users.filter(x => x.role === 'admin').length <= 1}
                  className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  title="Смени роля">
                  <option value="admin">Администратор</option>
                  <option value="broker">Брокер</option>
                  <option value="tenant">Наемател</option>
                </select>
                {u.role !== 'admin' && (
                  <button onClick={() => {
                    if (!window.confirm(`Изтриване на ${u.username}?`)) return
                    apiFetch(`${API}/api/users/${u.id}`, { method: 'DELETE' })
                      .then(r => r.json()).then(() => setUsers(us => us.filter(x => x.id !== u.id)))
                  }} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                )}
              </div>
            )
          })}
        </div>
        <div className="border-t pt-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">Добави потребител</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[['username','Потребителско име'],['password','Парола'],['name','Имена'],['email','Имейл']].map(([k,l]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                <input type={k==='password'?'password':'text'} value={newUser[k]}
                  onChange={e => setNewUser(u => ({...u,[k]:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select value={newUser.role} onChange={e => setNewUser(u => ({...u,role:e.target.value}))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="broker">Брокер</option>
              <option value="tenant">Наемател</option>
              <option value="admin">Администратор</option>
            </select>
            <button disabled={savingUser || !newUser.username || !newUser.password}
              onClick={() => {
                setSavingUser(true)
                apiFetch(`${API}/api/users`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(newUser) })
                  .then(r => r.json()).then(d => {
                    setSavingUser(false)
                    if (d.id) { showToast('Потребителят е създаден'); setNewUser({username:'',password:'',role:'broker',name:'',email:''}); apiFetch(`${API}/api/users`).then(r=>r.json()).then(setUsers) }
                    else showToast(d.error||'Грешка','error')
                  }).catch(() => { setSavingUser(false); showToast('Грешка','error') })
              }}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
              {savingUser ? 'Запазва...' : '+ Добави'}
            </button>
          </div>
        </div>
      </div>

      {/* Kontrolisi */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">📊 Kontrolisi — счетоводна програма</h3>
        <p className="text-sm text-gray-500 mb-3">Имейл за изпращане на фактури към Kontrolisi. Всяка фактура може да се изпрати с един бутон.</p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Имейл адрес на Kontrolisi</label>
        <input type="email" value={kontrolisiEmail} onChange={e => setKontrolisiEmail(e.target.value)}
          placeholder="import@kontrolisi.bg"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />

        <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${kontrolisiAuto ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <input type="checkbox" checked={kontrolisiAuto} onChange={e => setKontrolisiAuto(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm text-gray-700">
            <strong>Автоматично изпращане</strong> — всяка нова фактура отива сама към Контролиси
            {!kontrolisiEmail && <span className="text-amber-600"> (първо въведи имейл)</span>}
          </span>
        </label>
        <p className="text-xs text-gray-400 mt-2">Запиши настройките. Бутонът 📊 за ръчно изпращане остава до всяка фактура.</p>
      </div>

      {/* Backup */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">💾 Бекап на данните</h3>
        <p className="text-sm text-gray-500 mb-3">Изтегли копие на базата данни. Препоръчително веднъж седмично.</p>
        <button
          onClick={() => apiFetch(`${API}/api/backup`).then(r => r.blob()).then(b => {
            const date = new Date().toISOString().slice(0,10)
            const a = document.createElement('a')
            a.href = URL.createObjectURL(b)
            a.download = `skyrent_backup_${date}.db`
            a.click()
          })}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          ⬇️ Изтегли бекап
        </button>
      </div>

      {/* Tenant Map */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">Наематели → Имот (tenant_map)</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Ключова дума от контрагент/основание → ID на имот. Използва се при парсване на банков отчет.
            </p>
          </div>
          <button
            onClick={addTenantRow}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            + Добави
          </button>
        </div>

        {tenantMap.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
            Няма дефинирани съответствия. Добавете ключова дума и ID на имот.
          </div>
        )}

        <div className="space-y-2">
          {tenantMap.map((row, idx) => (
            <div key={idx} className="flex gap-3 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  value={row.keyword}
                  onChange={e => updateTenantRow(idx, 'keyword', e.target.value)}
                  placeholder="Ключова дума (напр. 'хабип муса')"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="w-28">
                <input
                  type="number"
                  value={row.property_id}
                  onChange={e => updateTenantRow(idx, 'property_id', e.target.value)}
                  placeholder="ID имот"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
              <button
                onClick={() => removeTenantRow(idx)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                title="Изтрий"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {tenantMap.length > 0 && (
          <div className="mt-3 text-xs text-gray-400">
            Съвет: Ключовите думи са case-insensitive. Напр. 'иво лазаров' ще съвпадне с 'Иво Лазаров' в банковия отчет.
          </div>
        )}
      </div>

      {/* Expense Categories */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">Категории разходи (expense_cats)</h3>
        <p className="text-sm text-gray-500 mb-4">
          Ключови думи за класифициране на разходи при парсване. Ако основание или контрагент съдържа думата — транзакцията се маркира като 'разход'.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {expenseCats.map(cat => (
            <div key={cat} className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
              <span className="text-sm text-gray-700">{cat}</span>
              <button
                onClick={() => removeExpenseCat(cat)}
                className="text-gray-400 hover:text-red-500 ml-1 leading-none text-base"
                title="Премахни"
              >
                ×
              </button>
            </div>
          ))}
          {expenseCats.length === 0 && (
            <span className="text-sm text-gray-400">Няма категории</span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExpenseCat()}
            placeholder="Нова категория (напр. 'нотариус')"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addExpenseCat}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Добави
          </button>
        </div>
      </div>

      {/* Issuer Details */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">🧾 Данни на издателя</h3>
        <p className="text-sm text-gray-500 mb-3">Отпечатват се на фактури и договори. Изберете типа лице:</p>
        <div className="flex gap-2 mb-4">
          {[['company', '🏢 Фирма'], ['individual', '👤 Физическо лице']].map(([v, label]) => (
            <button key={v} onClick={() => setEntityType(v)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition ${entityType === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>
        {entityType === 'individual' && (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
            👤 Физическо лице: не издаваш фактури. Наемният доход се декларира веднъж годишно по чл.50 — виж „Годишна справка за наем" в таб Фактури. (Полето „ЕИК / ЕГН" въведи своя ЕГН.)
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'name',       label: 'Фирма / Име',           placeholder: 'Вашата фирма ООД' },
            { key: 'eik',        label: 'ЕИК / ЕГН',             placeholder: '123456789' },
            { key: 'mol',        label: 'МОЛ',                    placeholder: 'Иво Лазаров' },
            { key: 'address',    label: 'Адрес',                  placeholder: 'София, ул. ...' },
            { key: 'place',      label: 'Място на издаване',     placeholder: 'София' },
            { key: 'vat_number', label: 'ДДС номер (ако има)',    placeholder: 'BG123456789' },
            { key: 'iban',       label: 'IBAN',                   placeholder: 'BG80BNBG96611020345678' },
            { key: 'bic',        label: 'BIC',                    placeholder: 'BNBGBGSF' },
            { key: 'email',      label: 'Имейл за контакт',       placeholder: 'office@firma.bg' },
            { key: 'phone',      label: 'Телефон за контакт',     placeholder: '+359 ...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input type="text" value={issuer[key] || ''}
                onChange={e => setIssuer(s => ({ ...s, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ДДС ставка % (0 = не сте регистрирани)</label>
            <select value={issuer.vat_rate || '0'}
              onChange={e => setIssuer(s => ({ ...s, vat_rate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="0">0% — не сте регистрирани по ДДС</option>
              <option value="20">20% — регистрирани по ДДС</option>
            </select>
          </div>
        </div>
      </div>

      {/* White-label (Agency) */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-800 mb-1">🏷️ White-label
              {!whiteLabel.available && <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Agency</span>}
            </h3>
            <p className="text-sm text-gray-500">Скрий „Powered by Skyrent" на публичните си обяви и покажи своя бранд.</p>
          </div>
          {whiteLabel.available ? (
            <button onClick={toggleWhiteLabel}
              className={`shrink-0 relative w-12 h-7 rounded-full transition ${whiteLabel.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition ${whiteLabel.enabled ? 'translate-x-5' : ''}`} />
            </button>
          ) : (
            <span className="shrink-0 text-xs text-gray-400">Налично в Agency плана</span>
          )}
        </div>
      </div>

      {/* SEPA Autopay manual trigger */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">🏦 SEPA Автоплащане — тест</h3>
        <p className="text-sm text-gray-500 mb-4">
          Натисни за да стартираш autopay cron веднага (без да чакаш конкретно число от месеца).
          Ще charge-ва всички tenants с активирано автоплащане.
        </p>
        <button
          onClick={() => {
            setAutopayLoading(true); setAutopayResult(null)
            apiFetch(`${API}/api/invoices/run-autopay-now`, { method: 'POST' })
              .then(r => r.json())
              .then(d => { setAutopayLoading(false); setAutopayResult(d) })
              .catch(e => { setAutopayLoading(false); setAutopayResult({ error: e.message }) })
          }}
          disabled={autopayLoading}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
        >
          {autopayLoading ? 'Стартира...' : '▶️ Стартирай autopay сега'}
        </button>
        {autopayResult && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-600 mb-2">Резултат:</div>
            <pre className="text-xs text-gray-800 overflow-x-auto">{JSON.stringify(autopayResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Auto-invoice on contract activation */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">🧾 Автоматична фактура при активиране на договор</h3>
        <p className="text-sm text-gray-500 mb-3">
          Когато активираш договор (след като наемателят го е подписал), системата може сама да издаде първата фактура.
        </p>
        <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${autoInvoiceActivate ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <input type="checkbox" checked={autoInvoiceActivate} onChange={e => setAutoInvoiceActivate(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm text-gray-700">
            <strong>Генерирай фактура автоматично</strong> при активиране на договор
          </span>
        </label>
        <p className="text-xs text-gray-400 mt-2">
          Изисква фактурирането да е включено за имота. Изключено ли е — издаваш фактурата ръчно от таб Фактури. Запиши настройките.
        </p>
      </div>

      {/* Invoice number counter — две отделни серии */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">🔢 Пореден номер на фактурите</h3>
        <p className="text-sm text-gray-500 mb-4">
          10-цифрен формат, две независими серии. <strong>Фактури</strong> — за интернет/услуги/ръчни (напр. <code className="bg-gray-100 px-1 rounded text-xs">1000000062</code>).
          <strong> Наеми</strong> — за наемните фактури (с нули отпред, напр. <code className="bg-gray-100 px-1 rounded text-xs">0000000123</code>).
          Полезно ако продължаваш номерация от стара система.
        </p>
        {counter && [
          { series: 'main', label: '📄 Фактури (интернет / услуги / ръчни)', data: counter.main, val: nextMain, set: setNextMain,
            box: 'bg-blue-50 border-blue-200', eyebrow: 'text-blue-700', body: 'text-blue-900' },
          { series: 'rent', label: '🏠 Наеми', data: counter.rent, val: nextRent, set: setNextRent,
            box: 'bg-emerald-50 border-emerald-200', eyebrow: 'text-emerald-700', body: 'text-emerald-900' },
        ].map(row => (
          <div key={row.series} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end mb-4 last:mb-0">
            <div className={`border rounded-lg p-3 ${row.box}`}>
              <div className={`text-xs font-semibold uppercase ${row.eyebrow}`}>{row.label}</div>
              <div className={`text-sm mt-1 ${row.body}`}>
                Издадени до момента: <strong>{row.data?.counter ?? 0}</strong> бр.
              </div>
              <div className={`text-sm ${row.body}`}>
                Следваща ще е: <strong className="font-mono">{row.data?.next_number}</strong>
                {row.data && !row.data.configured && <span className="text-amber-600 text-xs ml-1">(стар формат — задай за да минеш на новия)</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Следваща {row.series === 'rent' ? 'наемна ' : ''}фактура — пълен номер (до 10 цифри)
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min="1" max="9999999999"
                  value={row.val}
                  onChange={e => row.set(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => saveCounter(row.series, row.val)}
                  disabled={savingCounter === row.series || !row.val || Number(row.val) === row.data?.next_sequential}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg whitespace-nowrap"
                >
                  {savingCounter === row.series ? '...' : 'Запази'}
                </button>
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-400 mt-2">
          Номер, който вече е издаден, не се приема. Скок напред е разрешен.
        </p>
      </div>

      {/* Email Settings — Resend */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">📧 Имейл настройки</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">Настройка на Resend (3 стъпки):</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Регистрирай се на <strong>resend.com</strong> → добави домейна <strong>skycapital.pro</strong> → постави DNS записите</li>
            <li>Създай API Key → копирай го</li>
            <li>В Railway → твоя backend service → <strong>Variables</strong> → добави <code className="bg-blue-100 px-1 rounded">RESEND_API_KEY = re_xxx...</code></li>
          </ol>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">От имейл (след верификация на домейна)</label>
            <input type="email" value={smtp.user}
              onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))}
              placeholder="info@skycapital.pro"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Изпращач (показвано име)</label>
            <input type="text" value={smtp.from_name}
              onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))}
              placeholder="Име на подателя"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-3">
          <button
            disabled={testingSmtp}
            onClick={() => {
              setTestingSmtp(true)
              apiFetch(`${API}/api/email/test`, { method: 'POST' })
                .then(r => r.json())
                .then(d => {
                  setTestingSmtp(false)
                  if (d.ok) showToast(`Връзката е успешна! Домейни: ${(d.domains || []).join(', ') || 'няма верифицирани'}`)
                  else showToast('Грешка: ' + d.error, 'error')
                })
                .catch(e => { setTestingSmtp(false); showToast('Грешка: ' + e.message, 'error') })
            }}
            className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-40">
            {testingSmtp ? 'Проверява...' : '🔌 Тест на Resend API'}
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow transition-colors"
        >
          {saving ? 'Запазва...' : '💾 Запази настройките'}
        </button>
      </div>

      {/* Info card */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-blue-800 mb-2">Как работи класификацията?</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• При <strong>Кт</strong> транзакция: ако контрагент е в tenant_map или основание съдържа 'наем'/'rent' → категория 'наем'</li>
          <li>• При <strong>Дт</strong> транзакция: ако контрагент съдържа 'прокредит'/'уникредит'/'пощенска' → 'вноска'</li>
          <li>• При <strong>Дт</strong> транзакция: ако основание/контрагент съдържа дума от expense_cats → 'разход'</li>
          <li>• Всичко останало → 'разход_друг' или 'приход_друг'</li>
        </ul>
      </div>
    </div>
  )
}
