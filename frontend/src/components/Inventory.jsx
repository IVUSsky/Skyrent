import React, { useState, useEffect } from 'react'
import { apiFetch, authUrl } from '../api'
import InventoryImport from './InventoryImport'

const CATEGORIES = [
  { id: 'мебели',          icon: '🛋️', label: 'Мебели' },
  { id: 'бяла техника',     icon: '🧊', label: 'Бяла техника' },
  { id: 'малки уреди',     icon: '☕', label: 'Малки уреди' },
  { id: 'вик',              icon: '🚿', label: 'ВиК' },
  { id: 'електро',          icon: '⚡', label: 'Електро' },
  { id: 'друго',            icon: '📦', label: 'Друго' },
]

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('bg-BG') } catch { return d }
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Inventory({ API, property, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)  // null | item | 'new'
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/inventory/property/${property.id}`)
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [property.id])

  const deleteItem = (item) => {
    if (!window.confirm(`Изтриване на "${item.name}"?\n\nВсички свързани файлове ще бъдат изтрити.`)) return
    apiFetch(`${API}/api/inventory/${item.id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(() => { load(); showToast('Изтрито') })
  }

  // Group items by category
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(it => it.category === cat.id),
  })).filter(g => g.items.length > 0)
  const ungrouped = items.filter(it => !CATEGORIES.find(c => c.id === it.category))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">🛋️ Обзавеждане</h3>
            <p className="text-sm text-gray-500">{property['адрес']}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setImporting(true)}
              className="px-3 py-1.5 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
              🤖 Импорт от фактура
            </button>
            <button onClick={() => setEditing('new')}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              + Добави
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              ✕ Затвори
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-6 mt-3 px-4 py-2 rounded-lg text-sm ${toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {toast.msg}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12">Зареждане...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-2">🛋️</div>
              <div>Все още няма добавени артикули за този имот.</div>
              <div className="text-sm mt-2">Натиснете "+ Добави" за да започнете.</div>
            </div>
          ) : (
            <>
              {grouped.map(group => (
                <div key={group.id} className="mb-6">
                  <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <span>{group.icon}</span> {group.label}
                    <span className="text-xs text-gray-400 font-normal">({group.items.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {group.items.map(item => (
                      <InventoryRow key={item.id} item={item} API={API}
                        onEdit={() => setEditing(item)}
                        onDelete={() => deleteItem(item)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {ungrouped.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">📦 Друго</h4>
                  <div className="space-y-2">
                    {ungrouped.map(item => (
                      <InventoryRow key={item.id} item={item} API={API}
                        onEdit={() => setEditing(item)}
                        onDelete={() => deleteItem(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit / New modal */}
      {editing && (
        <ItemEditor API={API} property={property} item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); showToast('Запазено') }}
        />
      )}

      {/* Import from invoice wizard */}
      {importing && (
        <InventoryImport API={API} currentPropertyId={property.id}
          onClose={() => setImporting(false)}
          onImported={() => { load(); showToast('Импортирано от фактура') }}
        />
      )}
    </div>
  )
}

function InventoryRow({ item, API, onEdit, onDelete }) {
  const firstPhoto = item.photos?.[0]
  return (
    <div className="flex gap-3 bg-gray-50 hover:bg-gray-100 rounded-lg p-3">
      <div className="w-16 h-16 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
        {firstPhoto ? (
          <img src={authUrl(`${API}/api/inventory/files/${firstPhoto.id}`)}
               alt={item.name}
               className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl text-gray-300">📷</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 truncate">{item.name}</div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
          {item.brand  && <span>{item.brand} {item.model}</span>}
          {item.serial_number && <span>S/N: {item.serial_number}</span>}
        </div>
        <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
          {item.purchase_date && <span>Купено: {fmtDate(item.purchase_date)}</span>}
          {item.warranty_end && <span>🛡️ Гаранция до: {fmtDate(item.warranty_end)}</span>}
          {item.photos?.length > 0 && <span>📷 {item.photos.length}</span>}
          {item.manuals?.length > 0 && <span>📘 {item.manuals.length}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onEdit}
          className="px-2 py-1 text-xs bg-white border border-gray-300 hover:bg-blue-50 hover:border-blue-300 text-gray-700 rounded">
          ✏️
        </button>
        <button onClick={onDelete}
          className="px-2 py-1 text-xs bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 text-red-600 rounded">
          🗑️
        </button>
      </div>
    </div>
  )
}

function ItemEditor({ API, property, item, onClose, onSaved }) {
  const isNew = !item
  const [form, setForm] = useState({
    category: item?.category || 'мебели',
    name: item?.name || '',
    brand: item?.brand || '',
    model: item?.model || '',
    serial_number: item?.serial_number || '',
    purchase_date: item?.purchase_date || '',
    purchase_price: item?.purchase_price || '',
    warranty_end: item?.warranty_end || '',
    notes: item?.notes || '',
    common_problems: item?.common_problems || '',
  })
  const [files, setFiles] = useState(item?.files || [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    if (!form.name.trim()) { setErr('Името е задължително'); return }
    setSaving(true); setErr(null)
    try {
      const url = isNew
        ? `${API}/api/inventory/property/${property.id}`
        : `${API}/api/inventory/${item.id}`
      const r = await apiFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Грешка'); setSaving(false); return }
      setSaving(false)
      onSaved()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const uploadFile = async (file, type) => {
    if (isNew) { setErr('Първо запазете артикула, после качете файлове.'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', type)
    try {
      const r = await apiFetch(`${API}/api/inventory/${item.id}/files`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Грешка')
      // Refresh local file list
      const refreshed = await apiFetch(`${API}/api/inventory/${item.id}`).then(r => r.json())
      setFiles(refreshed.files || [])
      setUploading(false)
    } catch (e) {
      setErr(e.message); setUploading(false)
    }
  }

  const deleteFile = async (fileId) => {
    if (!window.confirm('Изтриване на файла?')) return
    await apiFetch(`${API}/api/inventory/files/${fileId}`, { method: 'DELETE' })
    setFiles(files.filter(f => f.id !== fileId))
  }

  const photos  = files.filter(f => f.type === 'photo')
  const manuals = files.filter(f => f.type === 'manual')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">
            {isNew ? '➕ Нов артикул' : `✏️ Редактирай: ${item.name}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Категория</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Име *</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="напр. Пералня Bosch, Диван"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Марка</label>
              <input type="text" value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="напр. Bosch"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Модел</label>
              <input type="text" value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="напр. WAU24S65BY"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Сериен номер</label>
              <input type="text" value={form.serial_number}
                onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Дата на покупка</label>
              <input type="date" value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Цена (EUR)</label>
              <input type="number" step="0.01" value={form.purchase_price}
                onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">🛡️ Гаранция до</label>
              <input type="date" value={form.warranty_end}
                onChange={e => setForm(f => ({ ...f, warranty_end: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Бележки</label>
              <textarea rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="напр. Лимит на пране 7 кг"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">⚠️ Чести проблеми и решения</label>
              <textarea rows={3} value={form.common_problems}
                onChange={e => setForm(f => ({ ...f, common_problems: e.target.value }))}
                placeholder="напр. Ако пералнята не центрофугира — провери дали барабана е претоварен. Ако вратата не се отваря — изчакай 3 минути след края на цикъл."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y" />
              <p className="text-xs text-gray-500 mt-1">Tенантите ще виждат този текст в портала.</p>
            </div>
          </div>

          {/* Files section — only after item is saved */}
          {!isNew && (
            <>
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📷 Снимки ({photos.length})</h4>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {photos.map(p => (
                    <div key={p.id} className="relative group">
                      <img src={authUrl(`${API}/api/inventory/files/${p.id}`)}
                           className="w-full h-24 object-cover rounded border border-gray-200"
                           alt={p.original_name} />
                      <button onClick={() => deleteFile(p.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full opacity-0 group-hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
                <input type="file" accept="image/*" multiple
                  onChange={e => { for (const f of e.target.files) uploadFile(f, 'photo'); e.target.value = '' }}
                  className="text-xs" disabled={uploading} />
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📘 Ръководства за употреба ({manuals.length})</h4>
                <div className="space-y-1 mb-2">
                  {manuals.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-sm">
                      <a href={authUrl(`${API}/api/inventory/files/${m.id}`)} target="_blank" rel="noreferrer"
                         className="text-blue-600 hover:underline truncate flex-1">
                        📘 {m.original_name || m.filename}
                      </a>
                      <button onClick={() => deleteFile(m.id)}
                        className="text-red-500 hover:text-red-700 text-xs ml-2">✕</button>
                    </div>
                  ))}
                </div>
                <input type="file" accept=".pdf,.doc,.docx,image/*"
                  onChange={e => { for (const f of e.target.files) uploadFile(f, 'manual'); e.target.value = '' }}
                  className="text-xs" disabled={uploading} />
              </div>
            </>
          )}

          {err && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{err}</div>}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
            {saving ? 'Запазва...' : isNew ? 'Запази и продължи' : 'Запази промените'}
          </button>
        </div>
      </div>
    </div>
  )
}
