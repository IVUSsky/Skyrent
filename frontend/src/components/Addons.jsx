import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })

const STATUS_LABEL = {
  pending:  { text: '⏳ Чакаща',   cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  active:   { text: '✓ Активна',   cls: 'bg-green-100 text-green-800 border-green-300' },
  stopped:  { text: '⏹ Спряна',    cls: 'bg-gray-200 text-gray-700 border-gray-300' },
  rejected: { text: '✗ Отказана',  cls: 'bg-red-100 text-red-700 border-red-300' },
}

const EMPTY = { name: '', description: '', icon: '🛍️', monthly_price: '', deposit_amount: '', active: 1, sort_order: 0, property_scope: 'residential' }

const SCOPE_LABEL = {
  all:         { text: 'Всички имоти',  icon: '🏘️' },
  residential: { text: 'Жилищни',        icon: '🏠' },
  storage:     { text: 'Гараж / Мазе',   icon: '📦' },
}

export default function Addons({ API }) {
  const [tab, setTab] = useState('subs') // 'subs' | 'catalog'
  const [catalog, setCatalog] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // service id or 'new'
  const [form, setForm] = useState(EMPTY)
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = () => {
    setLoading(true)
    Promise.all([
      apiFetch(`${API}/api/addons/catalog`).then(r => r.json()),
      apiFetch(`${API}/api/addons/subscriptions`).then(r => r.json()),
    ]).then(([c, s]) => { setCatalog(c); setSubs(s); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [API])

  const startEdit = (svc) => {
    setEditing(svc.id)
    setForm({
      name: svc.name, description: svc.description || '', icon: svc.icon || '🛍️',
      monthly_price: svc.monthly_price, deposit_amount: svc.deposit_amount,
      active: svc.active, sort_order: svc.sort_order || 0,
      property_scope: svc.property_scope || 'all',
    })
  }
  const startNew = () => { setEditing('new'); setForm(EMPTY) }

  const save = async () => {
    if (!form.name?.trim()) { showToast('Името е задължително', 'error'); return }
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      icon: form.icon.trim() || '🛍️',
      monthly_price: Number(form.monthly_price) || 0,
      deposit_amount: Number(form.deposit_amount) || 0,
      active: form.active ? 1 : 0,
      sort_order: Number(form.sort_order) || 0,
      property_scope: form.property_scope || 'all',
    }
    const url = editing === 'new'
      ? `${API}/api/addons/catalog`
      : `${API}/api/addons/catalog/${editing}`
    const method = editing === 'new' ? 'POST' : 'PUT'
    try {
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await r.json()
      if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
      setEditing(null); load(); showToast('Запазено')
    } catch (e) { showToast('Сървърна грешка', 'error') }
  }

  const removeService = async (svc) => {
    if (!confirm(`Изтриване на услугата "${svc.name}"? (Ако има абонати — ще се деактивира.)`)) return
    try {
      const r = await apiFetch(`${API}/api/addons/catalog/${svc.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
      showToast(data.deactivated ? data.message : 'Изтрита'); load()
    } catch (e) { showToast('Сървърна грешка', 'error') }
  }

  const subAction = async (sub, action, prompt_notes = false) => {
    let notes = null
    if (prompt_notes) {
      notes = window.prompt('Бележка (по желание):', sub.admin_notes || '')
      if (notes === null) return
    }
    try {
      const r = await apiFetch(`${API}/api/addons/subscriptions/${sub.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, admin_notes: notes }),
      })
      const data = await r.json()
      if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
      showToast('Готово'); load()
    } catch (e) { showToast('Сървърна грешка', 'error') }
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Зарежда...</div>

  const pending = subs.filter(s => s.status === 'pending')
  const active  = subs.filter(s => s.status === 'active')
  const past    = subs.filter(s => s.status === 'stopped' || s.status === 'rejected')

  return (
    <div className="fin-surface">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">🛍️ Допълнителни услуги</h2>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button onClick={() => setTab('subs')}
            className={`px-3 py-1.5 ${tab === 'subs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            📋 Абонаменти {pending.length > 0 && <span className="ml-1 bg-yellow-300 text-yellow-900 px-1.5 rounded-full text-xs">{pending.length}</span>}
          </button>
          <button onClick={() => setTab('catalog')}
            className={`px-3 py-1.5 border-l border-gray-300 ${tab === 'catalog' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            ⚙️ Каталог ({catalog.length})
          </button>
        </div>
      </div>

      {tab === 'subs' && (
        <div className="space-y-5">
          {/* Pending */}
          {pending.length > 0 && (
            <section>
              <h3 className="font-bold text-yellow-700 mb-2">⏳ Нови заявки ({pending.length})</h3>
              <SubsTable rows={pending} onAction={subAction} />
            </section>
          )}
          {/* Active */}
          <section>
            <h3 className="font-bold text-green-700 mb-2">✓ Активни ({active.length})</h3>
            {active.length === 0
              ? <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">Няма активни абонаменти.</div>
              : <SubsTable rows={active} onAction={subAction} />}
          </section>
          {/* Past */}
          {past.length > 0 && (
            <section>
              <h3 className="font-bold text-gray-500 mb-2">История ({past.length})</h3>
              <SubsTable rows={past} onAction={subAction} compact />
            </section>
          )}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="space-y-4">
          <button onClick={startNew}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            ➕ Нова услуга
          </button>

          {editing && (
            <div className="bg-white border border-blue-300 rounded-xl p-5 shadow-md">
              <h3 className="font-bold text-gray-800 mb-3">{editing === 'new' ? 'Нова услуга' : `Редактирай ID ${editing}`}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 font-medium">Име</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Иконка (emoji)</label>
                  <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-500 font-medium">Описание</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Месечна цена €</label>
                  <input type="number" min="0" step="0.01" value={form.monthly_price} onChange={e => setForm({ ...form, monthly_price: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Депозит € (0 = няма)</label>
                  <input type="number" min="0" step="0.01" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Сортиране</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-500 font-medium block mb-1">За кои имоти е достъпна</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => setForm({ ...form, property_scope: k })}
                        className={`text-xs px-3 py-1.5 rounded-full border ${form.property_scope === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                        {v.icon} {v.text}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    "Жилищни" = апартамент/студио/къща/офис · "Гараж/Мазе" = складови имоти
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="text-sm text-gray-700 flex items-center gap-2">
                    <input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 accent-blue-600" />
                    Активна (видима за наематели)
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Запази</button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">Отказ</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['', 'Услуга', 'За имоти', 'Цена/мес', 'Депозит', 'Статус', 'Сорт.', 'Действия'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {catalog.map(svc => (
                  <tr key={svc.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-2xl">{svc.icon}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{svc.name}</div>
                      {svc.description && <div className="text-xs text-gray-500">{svc.description}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {(() => {
                        const sc = svc.property_scope || 'all'
                        const lab = SCOPE_LABEL[sc] || SCOPE_LABEL.all
                        const cls = sc === 'storage' ? 'bg-orange-50 text-orange-700 border-orange-200' : sc === 'residential' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                        return <span className={`px-2 py-0.5 rounded-full border ${cls}`}>{lab.icon} {lab.text}</span>
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-blue-700 whitespace-nowrap">{fmt(svc.monthly_price)} €</td>
                    <td className="px-3 py-2 text-right text-orange-700 whitespace-nowrap">{svc.deposit_amount > 0 ? `${fmt(svc.deposit_amount)} €` : '—'}</td>
                    <td className="px-3 py-2">
                      {svc.active
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">Активна</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border">Спряна</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{svc.sort_order}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => startEdit(svc)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 mr-1">✏️ Редактирай</button>
                      <button onClick={() => removeService(svc)} className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200">🗑️</button>
                    </td>
                  </tr>
                ))}
                {catalog.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">Няма дефинирани услуги.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SubsTable({ rows, onAction, compact }) {
  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Услуга', 'Наемател', 'Имот', 'Цена/мес', 'Депозит', 'Заявена', 'Статус', 'Действия'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(s => {
            const st = STATUS_LABEL[s.status] || { text: s.status, cls: 'bg-gray-100 text-gray-700 border-gray-200' }
            return (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="text-lg mr-1">{s.service_icon}</span>
                  <span className="font-medium text-gray-800">{s.service_name}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-medium text-gray-800">{s.user_name || s.user_username}</div>
                  {s.user_email && <div className="text-gray-500">{s.user_email}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px] truncate">{s.property_address || '—'}</td>
                <td className="px-3 py-2 text-right font-medium text-blue-700 whitespace-nowrap">{fmt(s.service_monthly_price)} €</td>
                <td className="px-3 py-2 text-right text-orange-700 whitespace-nowrap">
                  {s.service_deposit_amount > 0
                    ? <>
                        {fmt(s.service_deposit_amount)} €
                        {s.deposit_charged
                          ? <div className="text-[10px] text-green-700">{s.deposit_refunded ? '↩ върнат' : '✓ удържан'}</div>
                          : <div className="text-[10px] text-yellow-700">предстои</div>}
                      </>
                    : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{(s.requested_at || '').slice(0, 10)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.text}</span></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {s.status === 'pending' && (
                      <>
                        <button onClick={() => onAction(s, 'approve', true)} className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-medium">✓ Одобри</button>
                        <button onClick={() => onAction(s, 'reject', true)} className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300">✗ Отхвърли</button>
                      </>
                    )}
                    {s.status === 'active' && (
                      <>
                        <button onClick={() => onAction(s, 'stop', true)} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border">⏹ Спри</button>
                        {s.deposit_charged && !s.deposit_refunded && (
                          <button onClick={() => onAction(s, 'refund-deposit', false)} className="text-xs px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded border border-orange-200">↩ Върни депозит</button>
                        )}
                      </>
                    )}
                    {(s.status === 'stopped' || s.status === 'rejected') && !compact && (
                      <button onClick={() => onAction(s, 'reactivate', false)} className="text-xs px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200">↺ Активирай</button>
                    )}
                  </div>
                  {s.admin_notes && <div className="text-[10px] text-gray-500 italic mt-1 max-w-[180px]">📝 {s.admin_notes}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
