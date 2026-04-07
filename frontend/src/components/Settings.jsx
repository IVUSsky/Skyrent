import React, { useState, useEffect } from 'react'

export default function Settings({ API }) {
  const [settings, setSettings] = useState(null)
  const [tenantMap, setTenantMap] = useState([]) // [{keyword, property_id}]
  const [expenseCats, setExpenseCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        const tm = data.tenant_map || {}
        setTenantMap(Object.entries(tm).map(([keyword, property_id]) => ({ keyword, property_id: String(property_id) })))
        setExpenseCats(data.expense_cats || [])
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
    fetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_map, expense_cats: expenseCats }),
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
