import { useState, useEffect } from 'react'
import { apiFetch } from '../api'

// Библиотека с прочетени/клонирани RFID/NFC чипове за вход (входни врати,
// общи части и т.н.) — само каталог/данни. Самото четене/клониране на чип
// става локално през Proxmark3 bridge на http://127.0.0.1:8765 (отделна
// страница, само на машината с устройството — виж бележката по-долу).
const CHIP_TYPES = ['MIFARE Classic 1K', 'MIFARE Classic 4K', 'MIFARE Ultralight', 'EM410x (125kHz)', 'HID Prox (125kHz)', 'Друг']
const EMPTY = { property_id: '', label: '', chip_type: 'MIFARE Classic 1K', uid: '', notes: '' }

export default function AccessChips({ API }) {
  const [chips, setChips] = useState([])
  const [properties, setProperties] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [form, setForm] = useState(EMPTY)
  const [confirmDel, setConfirmDel] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = () => {
    apiFetch(`${API}/api/access-chips`).then(r => r.json()).then(setChips)
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties)
  }
  useEffect(load, [API])

  const startNew = () => { setEditing('new'); setForm(EMPTY) }
  const startEdit = (c) => { setEditing(c.id); setForm({ ...c, property_id: c.property_id || '' }) }

  const save = async () => {
    if (!form.label.trim() || !form.uid.trim()) { showToast('Локация и UID са задължителни', 'error'); return }
    const url = editing === 'new' ? `${API}/api/access-chips` : `${API}/api/access-chips/${editing}`
    const method = editing === 'new' ? 'POST' : 'PUT'
    const r = await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, property_id: form.property_id || null }),
    })
    if (!r.ok) { const d = await r.json(); showToast(d.error || 'Грешка', 'error'); return }
    showToast(editing === 'new' ? 'Добавен' : 'Запазен')
    setEditing(null); load()
  }

  const remove = async (c) => {
    await apiFetch(`${API}/api/access-chips/${c.id}`, { method: 'DELETE' })
    setConfirmDel(null); load(); showToast('Изтрит')
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🔑 Чипове за вход</h2>
          <p className="text-sm text-gray-500 mt-1">Библиотека с UID-и на входни чипове (входни врати, общи части).</p>
        </div>
        <button onClick={startNew} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">+ Нов запис</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        Четенето/клонирането на чип става локално през Proxmark3 — отвори{' '}
        <code className="bg-white px-1 rounded">http://127.0.0.1:8765</code> на машината, на която е свързано устройството.
        Прочетения UID добави тук ръчно, за да остане в архива.
      </div>

      {editing && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-3">{editing === 'new' ? 'Нов чип' : 'Редакция'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 font-medium">Локация *</label>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="напр. Входна врата — Стелар ап.64, Кръстова вада" className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Имот (опционално)</label>
              <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value })} className="w-full border rounded px-3 py-1.5">
                <option value="">— без връзка —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.адрес}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">UID *</label>
              <input value={form.uid} onChange={e => setForm({ ...form, uid: e.target.value.toUpperCase() })}
                placeholder="14D9821E" className="w-full border rounded px-3 py-1.5 font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Тип чип</label>
              <select value={form.chip_type} onChange={e => setForm({ ...form, chip_type: e.target.value })} className="w-full border rounded px-3 py-1.5">
                {CHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Бележки</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2} placeholder="напр. ключове FFFFFFFFFFFF за всички сектори, dump файл: ..." className="w-full border rounded px-3 py-1.5" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">Запази</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">Отказ</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>{['Локация', 'Имот', 'UID', 'Тип', 'Бележки', 'Дата', 'Действия'].map(h =>
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {chips.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm max-w-[220px]">{c.label}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">{c.property_address || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs font-semibold">{c.uid}</td>
                <td className="px-3 py-2 text-xs">{c.chip_type}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[220px] truncate" title={c.notes}>{c.notes || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.created_at ? c.created_at.slice(0, 10) : '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => startEdit(c)} className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded mr-1">✏️</button>
                  {confirmDel === c.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button onClick={() => remove(c)} className="text-xs px-2 py-1 bg-red-600 text-white rounded">Изтрий</button>
                      <button onClick={() => setConfirmDel(null)} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded border">Не</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDel(c.id)} className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200">🗑</button>
                  )}
                </td>
              </tr>
            ))}
            {chips.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">Няма записани чипове.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
