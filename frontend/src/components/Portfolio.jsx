import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'

const STATUS_COLORS = {
  '✅': 'bg-green-100 text-green-800',
  '🔶': 'bg-yellow-100 text-yellow-800',
  '❌': 'bg-red-100 text-red-800',
}

const EMPTY_FORM = { адрес:'', район:'', статус:'✅', наем:0, наемател:'', площ:'', тип:'2-стаен', покупна:0, ремонт:0, market_val:'' }

const fmt = (n) => (n || 0).toLocaleString('bg-BG')

export default function Portfolio({ API }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingProp, setEditingProp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_FORM)

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/properties`)
      .then(r => r.json())
      .then(data => { setProperties(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const openEdit = (prop) => {
    setEditingProp(prop)
    setEditForm({
      адрес: prop['адрес'] || '',
      район: prop['район'] || '',
      наем: prop['наем'] || 0,
      наемател: prop['наемател'] || '',
      статус: prop['статус'] || '✅',
      market_val: prop.market_val || '',
      тип: prop['тип'] || '2-стаен',
      площ: prop['площ'] || '',
      покупна: prop['покупна'] || 0,
      ремонт: prop['ремонт'] || 0,
      абонат_ток:  prop['абонат_ток']  || '',
      абонат_вода: prop['абонат_вода'] || '',
      абонат_тец:  prop['абонат_тец']  || '',
      абонат_вход: prop['абонат_вход'] || '',
    })
  }

  const closeEdit = () => { setEditingProp(null); setEditForm({}) }

  const saveNew = () => {
    if (!newForm.адрес) return alert('Адресът е задължителен')
    setSaving(true)
    apiFetch(`${API}/api/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        адрес: newForm.адрес,
        район: newForm.район,
        статус: newForm.статус,
        наем: Number(newForm.наем) || 0,
        наемател: newForm.наемател,
        площ: newForm.площ !== '' ? Number(newForm.площ) : null,
        тип: newForm.тип,
        покупна: Number(newForm.покупна) || 0,
        ремонт: Number(newForm.ремонт) || 0,
        market_val: newForm.market_val !== '' ? Number(newForm.market_val) : null,
      }),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); setAddingNew(false); setNewForm(EMPTY_FORM); load() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  const saveEdit = () => {
    setSaving(true)
    console.log('Saving property:', editingProp.id, JSON.stringify(editForm))
    apiFetch(`${API}/api/properties/${editingProp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        адрес: editForm.адрес,
        район: editForm.район,
        наем: Number(editForm.наем) || 0,
        наемател: editForm.наемател,
        статус: editForm.статус,
        market_val: editForm.market_val !== '' ? Number(editForm.market_val) : null,
        тип: editForm.тип,
        площ: editForm.площ !== '' ? Number(editForm.площ) : null,
        покупна: editForm.покупна !== '' ? Number(editForm.покупна) : null,
        ремонт: editForm.ремонт !== '' ? Number(editForm.ремонт) : null,
        абонат_ток:  editForm.абонат_ток  || null,
        абонат_вода: editForm.абонат_вода || null,
        абонат_тец:  editForm.абонат_тец  || null,
        абонат_вход: editForm.абонат_вход || null,
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
        <div className="flex items-center gap-3">
        <button
          onClick={() => { setAddingNew(true); setNewForm(EMPTY_FORM) }}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          + Добави имот
        </button>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-gray-500">Общ месечен наем: </span>
          <span className="font-bold text-blue-700 text-base">{fmt(totalRent)} €</span>
        </div>
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

      {/* Add New Property Modal */}
      {addingNew && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Добави нов имот</h3>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              {[
                { label: 'Адрес *', key: 'адрес', type: 'text', placeholder: 'ул. Примерна 1, ап.5' },
                { label: 'Район', key: 'район', type: 'text', placeholder: 'напр. Младост 1' },
                { label: 'Наемател', key: 'наемател', type: 'text', placeholder: 'Име на наемател' },
                { label: 'Месечен наем (EUR €)', key: 'наем', type: 'number' },
                { label: 'Площ (м²)', key: 'площ', type: 'number', placeholder: 'кв. метра' },
                { label: 'Покупна цена (EUR €)', key: 'покупна', type: 'number' },
                { label: 'Ремонт (EUR €)', key: 'ремонт', type: 'number' },
                { label: 'Пазарна стойност (EUR €)', key: 'market_val', type: 'number', placeholder: 'По избор' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={newForm[key]}
                    onChange={e => setNewForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder || ''}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    min={type === 'number' ? '0' : undefined}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип имот</label>
                <select value={newForm.тип} onChange={e => setNewForm(f => ({ ...f, тип: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                  {['1-стаен','2-стаен','3-стаен','Мезонет','Студио','Паркомясто','Гараж','Мазе','Друго'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select value={newForm.статус} onChange={e => setNewForm(f => ({ ...f, статус: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                  <option value="✅">✅ Активен</option>
                  <option value="🔶">🔶 В процес</option>
                  <option value="❌">❌ Неактивен</option>
                </select>
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setAddingNew(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Отказ
              </button>
              <button onClick={saveNew} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
                {saving ? 'Запазва...' : 'Добави'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input
                  type="text"
                  value={editForm.адрес}
                  onChange={e => setEditForm(f => ({ ...f, адрес: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Адрес на имота"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Район</label>
                <input
                  type="text"
                  value={editForm.район}
                  onChange={e => setEditForm(f => ({ ...f, район: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Район"
                />
              </div>
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

              {/* Utility account numbers */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">Абонатни номера</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '⚡ Ток', key: 'абонат_ток' },
                    { label: '💧 Вода', key: 'абонат_вода' },
                    { label: '🔥 ТЕЦ', key: 'абонат_тец' },
                    { label: '🏢 Входна такса', key: 'абонат_вход' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input
                        type="text"
                        value={editForm[key] || ''}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder="—"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
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
