import { useState, useEffect } from 'react'
import { apiFetch, authUrl } from '../api'

const STATUS_BADGE = {
  online:  { text: '🟢 Online', cls: 'text-green-700' },
  error:   { text: '🔴 Error',  cls: 'text-red-700'   },
  unknown: { text: '⚪ Unknown', cls: 'text-gray-500' },
}

const EMPTY = { property_id: '', router_id: '', name: '', model: 'Reolink D340W', local_ip: '', forwarded_port: '', camera_user: 'admin', camera_pass: '' }

export default function Cameras({ API }) {
  const [cameras, setCameras] = useState([])
  const [properties, setProperties] = useState([])
  const [routers, setRouters] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [form, setForm] = useState(EMPTY)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = () => {
    apiFetch(`${API}/api/cameras`).then(r => r.json()).then(setCameras)
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties)
    apiFetch(`${API}/api/internet/routers`).then(r => r.json()).then(setRouters)
  }
  useEffect(load, [API])

  const startNew = () => { setEditing('new'); setForm(EMPTY) }
  const startEdit = (c) => { setEditing(c.id); setForm({ ...EMPTY, ...c, camera_pass: '' }) }

  const save = async () => {
    if (!form.property_id || !form.name.trim()) { showToast('Имот и име са задължителни', 'error'); return }
    const url = editing === 'new' ? `${API}/api/cameras` : `${API}/api/cameras/${editing}`
    const method = editing === 'new' ? 'POST' : 'PUT'
    // Don't blank password if not changed
    const body = { ...form, property_id: form.property_id || null, router_id: form.router_id || null }
    if (editing !== 'new' && !body.camera_pass) delete body.camera_pass
    const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await r.json()
    if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
    showToast(editing === 'new' ? 'Добавена' : 'Запазена')
    setEditing(null); load()
  }

  const remove = async (c) => {
    setConfirmDel(null)
    await apiFetch(`${API}/api/cameras/${c.id}`, { method: 'DELETE' })
    load(); showToast('Изтрита')
  }

  const test = async (c) => {
    setBusyId(c.id)
    try {
      const r = await apiFetch(`${API}/api/cameras/${c.id}/test`, { method: 'POST' })
      const data = await r.json()
      showToast(data.message || (data.ok ? 'OK' : 'Грешка'), data.ok ? 'success' : 'error')
      load()
    } finally { setBusyId(null) }
  }

  const setupForward = async (c) => {
    setBusyId(c.id)
    try {
      const r = await apiFetch(`${API}/api/cameras/${c.id}/setup-forward`, { method: 'POST' })
      const data = await r.json()
      showToast(data.message || (data.ok ? 'OK' : 'Грешка'), data.ok ? 'success' : 'error')
      load()
    } finally { setBusyId(null) }
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
          <h2 className="text-xl font-bold text-gray-800">📹 Камери</h2>
          <p className="text-sm text-gray-500 mt-1">IP камери / видео звънци, свързани през рутер на имота (port forward).</p>
        </div>
        <button onClick={startNew} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">+ Нова камера</button>
      </div>

      {editing && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-3">{editing === 'new' ? 'Нова камера' : 'Редакция'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 font-medium">Имот *</label>
              <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value })} className="w-full border rounded px-3 py-1.5">
                <option value="">— избери —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.адрес}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Рутер (опционално)</label>
              <select value={form.router_id} onChange={e => setForm({ ...form, router_id: e.target.value })} className="w-full border rounded px-3 py-1.5">
                <option value="">— без връзка —</option>
                {routers.map(r => <option key={r.id} value={r.id}>{r.name || r.host} ({r.host})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Име *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="напр. Входна врата" className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Модел</label>
              <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Локален IP</label>
              <input value={form.local_ip} onChange={e => setForm({ ...form, local_ip: e.target.value })}
                placeholder="192.168.88.50" className="w-full border rounded px-3 py-1.5 font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Forwarded порт</label>
              <input type="number" value={form.forwarded_port} onChange={e => setForm({ ...form, forwarded_port: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Потребител</label>
              <input value={form.camera_user} onChange={e => setForm({ ...form, camera_user: e.target.value })} className="w-full border rounded px-3 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Парола</label>
              <input type="password" value={form.camera_pass} onChange={e => setForm({ ...form, camera_pass: e.target.value })}
                placeholder={editing !== 'new' ? '(оставете празно за непроменена)' : ''} className="w-full border rounded px-3 py-1.5" />
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
            <tr>{['Имот', 'Рутер', 'Порт', 'Статус', 'Last seen', 'Действия'].map(h =>
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cameras.map(c => {
              const st = STATUS_BADGE[c.status] || STATUS_BADGE.unknown
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm max-w-[200px]">
                    <div className="font-medium text-gray-800">{c.name}</div>
                    <div className="text-xs text-gray-500 truncate">{c.property_address || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">{c.router_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.forwarded_port || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs ${st.cls}`} title={c.last_error || ''}>{st.text}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{c.last_seen_at ? c.last_seen_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button disabled={busyId === c.id} onClick={() => test(c)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 mr-1 disabled:opacity-50">📡 Test</button>
                    <button disabled={busyId === c.id} onClick={() => setupForward(c)} className="text-xs px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 mr-1 disabled:opacity-50">🔧 Forward</button>
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
              )
            })}
            {cameras.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">Няма регистрирани камери.</td></tr>}
          </tbody>
        </table>
      </div>

      <EventsFeed API={API} cameras={cameras} />
    </div>
  )
}

function EventsFeed({ API, cameras }) {
  const [cameraId, setCameraId] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)

  // По подразбиране — първата камера в списъка
  useEffect(() => {
    if (!cameraId && cameras.length > 0) setCameraId(String(cameras[0].id))
  }, [cameras]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cameraId) { setEvents([]); return }
    setLoading(true)
    apiFetch(`${API}/api/cameras/${cameraId}/events`).then(r => r.json()).then(d => { setEvents(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [API, cameraId])

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">🎬 Последни събития</h3>
        <select value={cameraId} onChange={e => setCameraId(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
          <option value="">— избери камера —</option>
          {cameras.map(c => <option key={c.id} value={c.id}>{c.name} ({c.property_address || '—'})</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Зарежда...</div>
      ) : events.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Няма събития за тази камера.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {events.map(ev => (
            <div key={ev.id} className="border border-gray-100 rounded-lg overflow-hidden">
              {ev.snapshot_path ? (
                <img src={authUrl(`${API}/api/cameras/events/${ev.id}/snapshot`)} alt="" className="w-full h-32 object-cover bg-gray-100" />
              ) : (
                <div className="w-full h-32 bg-gray-50 flex items-center justify-center text-2xl">{ev.kind === 'identified' ? '👤' : '🚶'}</div>
              )}
              <div className="p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm">{ev.kind === 'identified' ? '👤' : '🚶'}</span>
                  {ev.detected_user_name ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300 truncate max-w-[110px]">{ev.detected_user_name}</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-300">Неидентифициран</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-gray-400">{ev.created_at ? ev.created_at.slice(0, 16).replace('T', ' ') : '—'}</span>
                  {ev.confidence != null && <span className="text-[10px] text-gray-500">{Math.round(ev.confidence * (ev.confidence <= 1 ? 100 : 1))}%</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
