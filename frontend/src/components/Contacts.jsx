import React, { useEffect, useState } from 'react'
import { apiFetch, authUrl } from '../api'

// Контактна книга (tenant_directory) — управление + експорт за външни мейл
// инструменти (Resend/Brevo/Gmail/Mailchimp). CRUD през /api/contracts/parties.

const FIELDS = [
  ['name', 'Име *'], ['email', 'Имейл'], ['phone', 'Телефон'], ['address', 'Адрес'],
  ['egn', 'ЕГН / ЕИК'], ['notes', 'Бележки'],
]
const empty = () => Object.fromEntries(FIELDS.map(([k]) => [k, '']))

export default function Contacts({ API = '' }) {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)   // null | {} (add/edit)
  const [err, setErr] = useState(null)

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/contracts/parties`).then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const save = () => {
    if (!form.name?.trim()) { setErr('Името е задължително'); return }
    const editing = !!form.id
    const url = editing ? `${API}/api/contracts/parties/${form.id}` : `${API}/api/contracts/parties`
    apiFetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) { setErr(d.error || 'Грешка'); return } setForm(null); setErr(null); load() })
      .catch(() => setErr('Грешка при връзка'))
  }
  const del = (id) => {
    if (!window.confirm('Изтриване на контакта?')) return
    apiFetch(`${API}/api/contracts/parties/${id}`, { method: 'DELETE' }).then(() => load())
  }

  const withEmail = rows.filter(r => r.email && r.email.trim()).length
  const filtered = rows.filter(r => {
    if (!q.trim()) return true
    const s = q.toLowerCase()
    return [r.name, r.email, r.phone, r.address].some(v => v && String(v).toLowerCase().includes(s))
  })

  return (
    <div className="fin-surface p-6 max-w-5xl mx-auto">
      <div className="iv-mast mb-5">
        <div>
          <div className="iv-mast-eyebrow">Комуникация</div>
          <h1 className="iv-mast-title">📇 Контакти</h1>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Единна книга с контакти — наематели, собственици, потенциални клиенти. Свали я като CSV или vCard,
        за да я ползваш с външни мейл инструменти (Resend, Brevo, Gmail, Mailchimp).
      </p>

      {/* Лента: търсене + експорт + добави */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Търси по име, имейл, телефон…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <a href={authUrl(`${API}/api/contracts/parties/export.csv`)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap">⬇ CSV</a>
        <a href={authUrl(`${API}/api/contracts/parties/export.vcf`)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap">⬇ vCard</a>
        <button onClick={() => { setForm(empty()); setErr(null) }}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap">+ Контакт</button>
      </div>

      <div className="text-xs text-gray-400 mb-3">{rows.length} контакта · {withEmail} с имейл</div>

      {loading ? <div className="text-gray-400 py-8 text-center text-sm">Зарежда…</div>
        : filtered.length === 0
          ? <div className="text-gray-400 py-8 text-center text-sm">{rows.length ? 'Няма съвпадения.' : 'Още няма контакти. Добави първия или ги внеси от договорите.'}</div>
          : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Име</th>
                    <th className="text-left px-3 py-2">Имейл</th>
                    <th className="text-left px-3 py-2">Телефон</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.email || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{r.phone || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => { setForm({ ...r }); setErr(null) }} className="text-indigo-600 hover:underline mr-3">Редактирай</button>
                        <button onClick={() => del(r.id)} className="text-red-500 hover:underline">Изтрий</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {/* Add/Edit модал */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-4">{form.id ? 'Редактирай контакт' : 'Нов контакт'}</h3>
            <div className="space-y-3">
              {FIELDS.map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  {k === 'notes'
                    ? <textarea value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    : <input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />}
                </div>
              ))}
            </div>
            {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Отказ</button>
              <button onClick={save} className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg">Запази</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
