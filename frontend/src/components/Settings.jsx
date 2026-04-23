import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'

export default function Settings({ API }) {
  const [settings, setSettings] = useState(null)
  const [tenantMap, setTenantMap] = useState([])
  const [expenseCats, setExpenseCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [smtp, setSmtp] = useState({ host: '', port: '587', user: '', pass: '', from_name: 'Sky Capital' })
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [issuer, setIssuer] = useState({ name: '', address: '', eik: '', mol: '', vat_number: '', iban: '', vat_rate: '0' })
  const [kontrolisiEmail, setKontrolisiEmail] = useState('')
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'broker', name: '', email: '' })
  const [savingUser, setSavingUser] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    apiFetch(`${API}/api/users`).then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d) }).catch(() => {})
    apiFetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        const tm = data.tenant_map || {}
        setTenantMap(Object.entries(tm).map(([keyword, property_id]) => ({ keyword, property_id: String(property_id) })))
        setExpenseCats(data.expense_cats || [])
        if (data.smtp) setSmtp(data.smtp)
        if (data.issuer) setIssuer(data.issuer)
        if (data.kontrolisi_email) setKontrolisiEmail(data.kontrolisi_email)
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
      body: JSON.stringify({ tenant_map, expense_cats: expenseCats, smtp, issuer, kontrolisi_email: kontrolisiEmail }),
    })
      .then(r => r.json())
      .then(data => {
        setSaving(false)
        if (data.ok) showToast('Настройките са запазени успешно!')
        else throw new Error(data.error || 'Unknown error')
      })
      .catch(e => { setSaving(false); showToast('Грешка: ' + e.message, 'error') })
  }

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Настройки</h2>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Users */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-3">👥 Потребители и достъп</h3>
        <div className="space-y-2 mb-4">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex-1">
                <span className="font-medium text-sm text-gray-800">{u.name || u.username}</span>
                <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {u.role === 'admin' ? 'Администратор' : 'Брокер'}
              </span>
              {u.role !== 'admin' && (
                <button onClick={() => {
                  if (!window.confirm(`Изтриване на ${u.username}?`)) return
                  apiFetch(`${API}/api/users/${u.id}`, { method: 'DELETE' })
                    .then(r => r.json()).then(() => setUsers(us => us.filter(x => x.id !== u.id)))
                }} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
              )}
            </div>
          ))}
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
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
        <p className="text-xs text-gray-400">Запишете и след това бутонът 📊 ще се появи до всяка фактура.</p>
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
        <h3 className="text-base font-bold text-gray-800 mb-1">🧾 Данни на издателя (за фактури)</h3>
        <p className="text-sm text-gray-500 mb-4">Тези данни се отпечатват на всяка фактура като "Доставчик".</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'name',       label: 'Фирма / Име',           placeholder: 'Sky Capital OOD' },
            { key: 'eik',        label: 'ЕИК / ЕГН',             placeholder: '123456789' },
            { key: 'mol',        label: 'МОЛ',                    placeholder: 'Иво Лазаров' },
            { key: 'address',    label: 'Адрес',                  placeholder: 'София, ул. ...' },
            { key: 'vat_number', label: 'ДДС номер (ако има)',    placeholder: 'BG123456789' },
            { key: 'iban',       label: 'IBAN',                   placeholder: 'BG80BNBG96611020345678' },
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
              placeholder="Sky Capital"
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
