import React, { useState, useEffect } from 'react'

const STATUS_COLORS = {
  '✅': 'bg-green-100 text-green-800',
  '🔶': 'bg-yellow-100 text-yellow-800',
  '❌': 'bg-red-100 text-red-800',
}

const fmt = (n) => (n || 0).toLocaleString('bg-BG')

export default function Portfolio({ API }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingProp, setEditingProp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`${API}/api/properties`)
      .then(r => r.json())
      .then(data => { setProperties(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const openEdit = (prop) => {
    setEditingProp(prop)
    setEditForm({
      наем: prop['наем'] || 0,
      наемател: prop['наемател'] || '',
      статус: prop['статус'] || '✅',
      market_val: prop.market_val || '',
      тип: prop['тип'] || '2-стаен',
      площ: prop['площ'] || '',
      покупна: prop['покупна'] || 0,
      ремонт: prop['ремонт'] || 0,
    })
  }

  const closeEdit = () => { setEditingProp(null); setEditForm({}) }

  const saveEdit = () => {
    setSaving(true)
    console.log('Saving property:', editingProp.id, JSON.stringify(editForm))
    fetch(`${API}/api/properties/${editingProp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        наем: Number(editForm.наем) || 0,
        наемател: editForm.наемател,
        статус: editForm.статус,
        market_val: editForm.market_val !== '' ? Number(editForm.market_val) : null,
        тип: editForm.тип,
        площ: editForm.площ !== '' ? Number(editForm.площ) : null,
        покупна: editForm.покупна !== '' ? Number(editForm.покупна) : null,
        ремонт: editForm.ремонт !== '' ? Number(editForm.ремонт) : null,
      }),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); closeEdit(); load() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  const totalRent = properties.filter(p => p['статус'] === '✅').reduce((s, p) => s + (p['наем'] || 0), 0)

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Портфолио имоти</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-gray-500">Общ месечен наем: </span>
          <span className="font-bold text-blue-700 text-base">{fmt(totalRent)} €</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Адрес', 'Район', 'Статус', 'Наемател', 'Наем (EUR €)', 'Площ м²', 'Тип', 'Покупна+Ремонт (EUR €)', 'Пазарна стойност (EUR €)', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {properties.map((p, i) => {
                const cost = (p['покупна'] || 0) + (p['ремонт'] || 0)
                return (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{p.id}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{p['адрес']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['район']}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p['статус']] || 'bg-gray-100 text-gray-600'}`}>
                        {p['статус']}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[160px] truncate">{p['наемател']}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{p['наем'] ? fmt(p['наем']) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p['площ']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['тип']}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{cost > 0 ? fmt(cost) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.market_val ? fmt(p.market_val) : '—'}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors"
                        title="Редактирай"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-blue-50 border-t-2 border-blue-200">
              <tr>
                <td colSpan={5} className="px-3 py-3 font-semibold text-gray-700">Общо (активни)</td>
                <td className="px-3 py-3 text-right font-bold text-blue-700 text-base">{fmt(totalRent)} €</td>
                <td colSpan={4}></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingProp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Редактирай имот</h3>
              <p className="text-sm text-gray-500 mt-1">{editingProp['адрес']}</p>
            </div>

            {/* Scrollable fields */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select
                  value={editForm.статус}
                  onChange={e => setEditForm(f => ({ ...f, статус: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="✅">✅ Активен</option>
                  <option value="🔶">🔶 В процес</option>
                  <option value="❌">❌ Неактивен</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Наемател</label>
                <input
                  type="text"
                  value={editForm.наемател}
                  onChange={e => setEditForm(f => ({ ...f, наемател: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Име на наемател"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Месечен наем (EUR €)</label>
                <input
                  type="number"
                  value={editForm.наем}
                  onChange={e => setEditForm(f => ({ ...f, наем: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пазарна стойност (EUR €)</label>
                <input
                  type="number"
                  value={editForm.market_val}
                  onChange={e => setEditForm(f => ({ ...f, market_val: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                  placeholder="Оставете празно за използване на покупна цена"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип имот</label>
                <select
                  value={editForm.тип}
                  onChange={e => setEditForm(f => ({ ...f, тип: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['1-стаен','2-стаен','3-стаен','Мезонет','Студио','Паркомясто','Гараж','Мазе'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Площ (м²)</label>
                <input
                  type="number"
                  value={editForm.площ}
                  onChange={e => setEditForm(f => ({ ...f, площ: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.5"
                  placeholder="кв. метра"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Покупна цена (EUR €)</label>
                <input
                  type="number"
                  value={editForm.покупна}
                  onChange={e => setEditForm(f => ({ ...f, покупна: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ремонт (EUR €)</label>
                <input
                  type="number"
                  value={editForm.ремонт}
                  onChange={e => setEditForm(f => ({ ...f, ремонт: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            {/* Fixed footer with buttons */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={closeEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Отказ
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {saving ? 'Запазва...' : 'Запази'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
