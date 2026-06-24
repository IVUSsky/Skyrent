import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

// Собственици на имоти (Agency · capability multi_owner). Агенцията управлява
// чужди портфейли — тук дефинира собствениците и вижда колко имота държи всеки.
// Свързването имот→собственик става от формата на имота (таб Имоти).

const EMPTY = { name: '', egn_eik: '', email: '', phone: '', iban: '', notes: '' }

export default function Owners({ API = '' }) {
  const [owners, setOwners] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = () => apiFetch(`${API}/api/owners`).then(r => r.json()).then(d => setOwners(Array.isArray(d) ? d : [])).catch(() => setOwners([]))
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const reset = () => { setForm(EMPTY); setEditId(null); setErr(null) }

  const save = () => {
    if (!form.name.trim()) { setErr('Името е задължително'); return }
    setSaving(true); setErr(null)
    const url = editId ? `${API}/api/owners/${editId}` : `${API}/api/owners`
    apiFetch(url, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(r => r.json()).then(d => {
        setSaving(false)
        if (d.id || d.ok) { reset(); load() }
        else setErr(d.error || 'Грешка')
      }).catch(() => { setSaving(false); setErr('Грешка при запис') })
  }

  const edit = (o) => { setEditId(o.id); setForm({ name: o.name || '', egn_eik: o.egn_eik || '', email: o.email || '', phone: o.phone || '', iban: o.iban || '', notes: o.notes || '' }); setErr(null) }
  const del = (id) => apiFetch(`${API}/api/owners/${id}`, { method: 'DELETE' }).then(() => { setConfirmDel(null); load() }).catch(() => {})

  const F = [
    ['name', 'Име / фирма *', 'Петър Иванов'], ['egn_eik', 'ЕГН / ЕИК', '7501011234'],
    ['email', 'Имейл', 'p@firma.bg'], ['phone', 'Телефон', '+359 ...'],
    ['iban', 'IBAN (за изплащане)', 'BG80...'], ['notes', 'Бележки', ''],
  ]

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800">👤 Собственици</h2>
        <p className="text-sm text-gray-500">Собствениците, чиито имоти управляваш. Свържи имот със собственик от таб <b>Имоти</b>.</p>
      </div>

      {/* Add / edit form */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <h3 className="text-base font-bold text-gray-800 mb-3">{editId ? 'Редакция на собственик' : 'Нов собственик'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {F.map(([k, label, ph]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
        </div>
        {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
            {saving ? 'Запазва...' : (editId ? 'Запази промените' : '+ Добави собственик')}
          </button>
          {editId && <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Отказ</button>}
        </div>
      </div>

      {/* List */}
      {owners == null ? <div className="text-gray-400 py-8 text-center">Зареждане...</div>
        : owners.length === 0 ? <div className="text-gray-400 py-8 text-center">Още няма собственици. Добави първия отгоре.</div>
        : (
          <div className="space-y-2">
            {owners.map(o => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-800">{o.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[o.egn_eik, o.email, o.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">{o.property_count} имот{o.property_count === 1 ? '' : 'а'}</span>
                <button onClick={() => edit(o)} className="shrink-0 text-sm text-gray-500 hover:text-gray-800 px-2">✏️</button>
                {confirmDel === o.id
                  ? <span className="shrink-0 flex gap-1">
                      <button onClick={() => del(o.id)} className="text-xs font-semibold text-white bg-red-600 rounded px-2 py-1">Изтрий</button>
                      <button onClick={() => setConfirmDel(null)} className="text-xs text-gray-500 px-1">Не</button>
                    </span>
                  : <button onClick={() => setConfirmDel(o.id)} className="shrink-0 text-sm text-gray-400 hover:text-red-600 px-2">🗑</button>}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
