import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const fmt = n => Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0 })

const STATUS_BADGE = {
  active:   { text: '✓ Активен',  cls: 'bg-green-100 text-green-800 border-green-300' },
  expired:  { text: '⏰ Изтекъл', cls: 'bg-red-100 text-red-700 border-red-300' },
  inactive: { text: '⏸ Неактивен', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
}

const ROUTER_STATUS = {
  online:  { text: '🟢 Online', cls: 'text-green-700' },
  error:   { text: '🔴 Error',  cls: 'text-red-700'   },
  unknown: { text: '⚪ Unknown', cls: 'text-gray-500' },
}

export default function Internet({ API }) {
  const [tab, setTab] = useState('accounts')
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  return (
    <div className="fin-surface">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">🌐 Интернет</h2>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button onClick={() => setTab('accounts')}  className={`px-3 py-1.5 ${tab === 'accounts'  ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>👤 Акаунти</button>
          <button onClick={() => setTab('plans')}     className={`px-3 py-1.5 border-l border-gray-300 ${tab === 'plans'     ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>📋 Планове</button>
          <button onClick={() => setTab('routers')}   className={`px-3 py-1.5 border-l border-gray-300 ${tab === 'routers'   ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>📡 Рутери</button>
        </div>
      </div>

      {tab === 'accounts' && <AccountsTab API={API} showToast={showToast} />}
      {tab === 'plans'    && <PlansTab    API={API} showToast={showToast} />}
      {tab === 'routers'  && <RoutersTab  API={API} showToast={showToast} />}
    </div>
  )
}

function AccountsTab({ API, showToast }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/internet/accounts`).then(r => r.json()).then(d => { setAccounts(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [API])

  const syncAll = () => {
    setSyncing(true)
    apiFetch(`${API}/api/internet/sync-all`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { showToast(`Sync: ${d.stats.activated} активирани, ${d.stats.expired} изтекли, ${d.stats.errors} грешки`); load() })
      .finally(() => setSyncing(false))
  }

  const extend = (acc) => {
    const days = Number(prompt(`Удължи акаунта на ${acc.user_name || acc.user_username} с колко дни?`, '30'))
    if (!days || days <= 0) return
    apiFetch(`${API}/api/internet/accounts/${acc.id}/extend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    }).then(r => r.json()).then(d => {
      if (d.error) showToast(d.error, 'error')
      else { showToast(`Удължен до ${(d.valid_until || '').slice(0, 16).replace('T', ' ')}`); load() }
    })
  }

  const disable = (acc) => {
    if (!confirm(`Деактивирай интернета на ${acc.user_name || acc.user_username}?`)) return
    apiFetch(`${API}/api/internet/accounts/${acc.id}/disable`, { method: 'POST' })
      .then(r => r.json()).then(() => { showToast('Деактивиран'); load() })
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Зарежда...</div>

  // Статус-обобщение (интернет като отделен продукт)
  const now = Date.now()
  const isValid = a => a.valid_until && new Date(a.valid_until + (a.valid_until.endsWith('Z') ? '' : 'Z')).getTime() > now
  const working = accounts.filter(a => a.status === 'active' && isValid(a)).length
  const expired = accounts.filter(a => a.status === 'expired' || (a.status === 'active' && a.valid_until && !isValid(a))).length
  const waiting = accounts.filter(a => a.status === 'inactive' || !a.valid_until).length
  const KPIS = [
    { label: '🟢 Работят', value: working, cls: 'text-green-700' },
    { label: '⏳ Изчакват', value: waiting, cls: 'text-amber-600' },
    { label: '⏰ Изтекли', value: expired, cls: 'text-red-600' },
    { label: 'Σ Общо пуснати', value: accounts.length, cls: 'text-gray-800' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {KPIS.map(k => (
          <div key={k.label} className="bg-white rounded-xl shadow border border-gray-100 p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex justify-end">
        <button onClick={syncAll} disabled={syncing}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
          {syncing ? 'Sync-ва...' : '🔄 Sync всички рутери'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Наемател', 'Имот', 'Username', 'MAC', 'Статус', 'Валиден до', 'Платено', 'Действия'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {accounts.map(a => {
              const st = STATUS_BADGE[a.status] || { text: a.status, cls: '' }
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{a.user_name || a.user_username}</div>
                    {a.user_email && <div className="text-xs text-gray-500">{a.user_email}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px] truncate">{a.property_address || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.username}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{a.mac_address || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.text}</span></td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{a.valid_until ? a.valid_until.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700 whitespace-nowrap">{fmt(a.total_paid)} €</td>
                  <td className="px-3 py-2">
                    <button onClick={() => extend(a)} className="text-xs px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200 mr-1">+ Удължи</button>
                    <button onClick={() => disable(a)} className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200">⏸</button>
                  </td>
                </tr>
              )
            })}
            {accounts.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-400 py-8">Все още няма акаунти. Появяват се след първа заявка на наемател.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const PLAN_EMPTY = { name: '', description: '', duration_days: 30, price: '', speed_down_mbps: '', speed_up_mbps: '', active: 1, sort_order: 0 }

function PlansTab({ API, showToast }) {
  const [plans, setPlans] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(PLAN_EMPTY)

  const load = () => apiFetch(`${API}/api/internet/plans`).then(r => r.json()).then(setPlans)
  useEffect(load, [API])

  const startEdit = (p) => { setEditing(p.id); setForm({ ...p, speed_down_mbps: p.speed_down_mbps || '', speed_up_mbps: p.speed_up_mbps || '' }) }
  const startNew = () => { setEditing('new'); setForm(PLAN_EMPTY) }

  const save = async () => {
    if (!form.name.trim() || !form.duration_days || !form.price) { showToast('Име, дни и цена са задължителни', 'error'); return }
    const body = {
      ...form, name: form.name.trim(),
      duration_days: Number(form.duration_days), price: Number(form.price),
      speed_down_mbps: form.speed_down_mbps ? Number(form.speed_down_mbps) : null,
      speed_up_mbps: form.speed_up_mbps ? Number(form.speed_up_mbps) : null,
    }
    const url = editing === 'new' ? `${API}/api/internet/plans` : `${API}/api/internet/plans/${editing}`
    const method = editing === 'new' ? 'POST' : 'PUT'
    const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await r.json()
    if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
    setEditing(null); load(); showToast('Запазено')
  }
  const remove = async (p) => {
    if (!confirm(`Изтрий плана "${p.name}"?`)) return
    const r = await apiFetch(`${API}/api/internet/plans/${p.id}`, { method: 'DELETE' })
    const data = await r.json()
    showToast(data.deactivated ? data.message : 'Изтрит'); load()
  }

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">➕ Нов план</button>

      {editing && (
        <div className="bg-white border border-blue-300 rounded-xl p-5 shadow-md">
          <h3 className="font-bold text-gray-800 mb-3">{editing === 'new' ? 'Нов план' : `Редактирай "${form.name}"`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Име</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Продължителност (дни)</label>
              <input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Цена (€)</label>
              <input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Описание</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Down Mbps (опц.)</label>
              <input type="number" value={form.speed_down_mbps} onChange={e => setForm({ ...form, speed_down_mbps: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Up Mbps (опц.)</label>
              <input type="number" value={form.speed_up_mbps} onChange={e => setForm({ ...form, speed_up_mbps: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div className="md:col-span-4">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked ? 1 : 0 })} className="w-4 h-4" />
                Активен (видим в каталога)
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">Запази</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">Отказ</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>{['План', 'Дни', 'Цена', 'Скорост', 'Статус', 'Действия'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {plans.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800">{p.name}</div>
                  {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{p.duration_days} дни</td>
                <td className="px-3 py-2 font-medium text-blue-700 whitespace-nowrap">{fmt(p.price)} €</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{p.speed_down_mbps ? `${p.speed_down_mbps}/${p.speed_up_mbps || '?'} Mbps` : '—'}</td>
                <td className="px-3 py-2">{p.active ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">Активен</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border">Спрян</span>}</td>
                <td className="px-3 py-2">
                  <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 mr-1">✏️</button>
                  <button onClick={() => remove(p)} className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200">🗑</button>
                </td>
              </tr>
            ))}
            {plans.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">Няма дефинирани планове.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ROUTER_EMPTY = { property_id: '', name: '', model: 'MikroTik hAP ax²', host: '', api_port: 8728, api_user: 'admin', api_pass: '', use_tls: 0, notes: '' }

function RoutersTab({ API, showToast }) {
  const [routers, setRouters] = useState([])
  const [properties, setProperties] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(ROUTER_EMPTY)

  const load = () => {
    apiFetch(`${API}/api/internet/routers`).then(r => r.json()).then(setRouters)
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties)
  }
  useEffect(load, [API])

  const startNew = () => { setEditing('new'); setForm(ROUTER_EMPTY) }
  const startEdit = (r) => { setEditing(r.id); setForm({ ...r, api_pass: '' }) }

  const save = async () => {
    if (!form.property_id || !form.host) { showToast('Имот и host са задължителни', 'error'); return }
    const url = editing === 'new' ? `${API}/api/internet/routers` : `${API}/api/internet/routers/${editing}`
    const method = editing === 'new' ? 'POST' : 'PUT'
    // Don't blank password if not changed
    const body = { ...form }
    if (editing !== 'new' && !body.api_pass) delete body.api_pass
    const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await r.json()
    if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
    setEditing(null); load(); showToast('Запазено')
  }
  const remove = async (r) => {
    if (!confirm(`Изтрий рутера ${r.host}?`)) return
    await apiFetch(`${API}/api/internet/routers/${r.id}`, { method: 'DELETE' })
    showToast('Изтрит'); load()
  }
  const test = async (r) => {
    const res = await apiFetch(`${API}/api/internet/routers/${r.id}/test`, { method: 'POST' })
    const data = await res.json()
    showToast(data.message || (data.ok ? 'OK' : 'Грешка'), data.ok ? 'success' : 'error')
    load()
  }

  // Properties без рутер — кандидати за нов
  const usedPropIds = new Set(routers.map(r => r.property_id))
  const availableProps = properties.filter(p => !usedPropIds.has(p.id) || p.id === routers.find(r => r.id === editing)?.property_id)

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <strong>💡 Фаза 1 (сега)</strong> — само записваме рутерите в базата. Командите към тях ще се пращат реално след закупуване и активиране на провайдъра MikroTik (Фаза 2).
        Препоръчвам <strong>MikroTik hAP ax lite/ax²</strong> за всеки имот (~€80-100).
      </div>

      <button onClick={startNew} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">➕ Добави рутер</button>

      {editing && (
        <div className="bg-white border border-blue-300 rounded-xl p-5 shadow-md">
          <h3 className="font-bold text-gray-800 mb-3">{editing === 'new' ? 'Нов рутер' : `Редактирай ${form.host}`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Имот</label>
              <select value={form.property_id} onChange={e => setForm({ ...form, property_id: Number(e.target.value) })} className="w-full border rounded px-3 py-1.5">
                <option value="">— избери —</option>
                {availableProps.map(p => <option key={p.id} value={p.id}>{p['адрес']} ({p['тип']})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Име</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="напр. 'Гл.вход 1'" className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Модел</label>
              <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Host (публичен IP или Tailscale)</label>
              <input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="192.0.2.10 или router1.tail.ts.net" className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">API порт</label>
              <input type="number" value={form.api_port} onChange={e => setForm({ ...form, api_port: Number(e.target.value) })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">API user</label>
              <input value={form.api_user} onChange={e => setForm({ ...form, api_user: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">API парола</label>
              <input type="password" value={form.api_pass} onChange={e => setForm({ ...form, api_pass: e.target.value })} placeholder={editing !== 'new' ? '(оставете празно за непроменено)' : ''} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">TLS / api-ssl (порт 8729)</label>
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={!!form.use_tls} onChange={e => setForm({ ...form, use_tls: e.target.checked ? 1 : 0 })} className="w-4 h-4" />
                Използвай TLS
              </label>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-gray-500 font-medium">Бележки</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-3 py-1.5" />
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
            <tr>{['Имот', 'Име', 'Модел', 'Host:Port', 'Last seen', 'Статус', 'Действия'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {routers.map(r => {
              const st = ROUTER_STATUS[r.status] || ROUTER_STATUS.unknown
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs max-w-[200px] truncate">{r.property_address || '—'}</td>
                  <td className="px-3 py-2 text-sm">{r.name || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.model || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.host}:{r.api_port}{r.use_tls ? ' (TLS)' : ''}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.last_seen_at ? r.last_seen_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="px-3 py-2"><span className={`text-xs ${st.cls}`} title={r.last_error || ''}>{st.text}</span></td>
                  <td className="px-3 py-2">
                    <button onClick={() => test(r)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 mr-1">📡 Test</button>
                    <button onClick={() => startEdit(r)} className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded border mr-1">✏️</button>
                    <button onClick={() => remove(r)} className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200">🗑</button>
                  </td>
                </tr>
              )
            })}
            {routers.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">Все още няма добавени рутери.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
