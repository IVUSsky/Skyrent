import { apiFetch } from '../api'
import React, { useState, useEffect, useCallback } from 'react'

const fmt = n => n != null ? Number(n).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmt1 = n => n != null ? Number(n).toLocaleString('bg-BG', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'

function StatusCard({ label, value, unit, icon, color = 'gray' }) {
  const colors = {
    green:  'bg-green-50 border-green-200 text-green-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    yellow: 'bg-amber-50 border-amber-200 text-amber-700',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{icon} {label}</div>
      <div className="text-2xl font-bold">{value} <span className="text-sm font-normal">{unit}</span></div>
    </div>
  )
}

function DeviceCard({ device, API, properties, onDelete, onTypeChange }) {
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [toggling, setToggling] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [reporting, setReporting]   = useState(false)
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [reportMsg, setReportMsg]     = useState(null)

  const loadStatus = useCallback(() => {
    setLoading(true)
    apiFetch(`${API}/api/smart/devices/${device.id}/status`)
      .then(r => r.json())
      .then(d => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [API, device.id])

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [loadStatus])

  const toggle = async (on) => {
    setToggling(true)
    setConfirmOff(false)
    await apiFetch(`${API}/api/smart/devices/${device.id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    })
    setTimeout(loadStatus, 1500)
    setToggling(false)
  }

  const sendReport = async () => {
    setReporting(true)
    setReportMsg(null)
    const r = await apiFetch(`${API}/api/smart/devices/${device.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: reportMonth }),
    }).then(r => r.json())
    setReporting(false)
    setReportMsg(r.ok ? `✓ Изпратен на ${r.sent_to} — ${r.monthly_kwh?.toFixed(2)} kWh` : `✗ ${r.error}`)
    setTimeout(() => setReportMsg(null), 6000)
  }

  const prop = properties.find(p => p.id === device.property_id)
  const isOn = status?.switch

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-bold text-gray-900 text-lg">{device.name}</div>
          <div className="text-sm text-gray-500">{prop?.адрес || '— без имот —'}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            loading ? 'bg-gray-100 text-gray-500' :
            isOn    ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {loading ? 'Зарежда...' : isOn ? '⚡ Включен' : '○ Изключен'}
          </span>
          <select defaultValue={device.type} onChange={e => onTypeChange(device.id, e.target.value)}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-500">
            <option value="breaker">Бушон</option>
            <option value="lock">Брава</option>
            <option value="router">Рутер</option>
          </select>
          <button onClick={() => onDelete(device.id)}
            className="text-gray-300 hover:text-red-400 text-lg transition-colors">×</button>
        </div>
      </div>

      {/* Live metrics */}
      {status && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatusCard label="Мощност"    value={fmt1(status.power_w)}   unit="W"   icon="⚡" color={status.power_w > 0 ? 'blue' : 'gray'} />
          <StatusCard label="Напрежение" value={fmt1(status.voltage_v)} unit="V"   icon="〰" color="gray" />
          <StatusCard label="Ток"        value={status.current_ma != null ? fmt1(status.current_ma / 1000) : '—'} unit="A" icon="↯" color="gray" />
          <StatusCard label="Консумация" value={fmt(status.energy_kwh)} unit="kWh" icon="📊" color="yellow" />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {confirmOff ? (
          <>
            <span className="text-sm text-red-600 flex-1 self-center">Сигурен ли си?</span>
            <button onClick={() => setConfirmOff(false)}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Не</button>
            <button onClick={() => toggle(false)} disabled={toggling}
              className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg">
              Изключи
            </button>
          </>
        ) : (
          <>
            <button onClick={() => toggle(true)} disabled={toggling || isOn}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                isOn ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
              }`}>
              ⚡ Включи
            </button>
            <button onClick={() => setConfirmOff(true)} disabled={toggling || !isOn}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                !isOn ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-100 hover:bg-red-200 text-red-700'
              }`}>
              ○ Изключи
            </button>
            <button onClick={loadStatus} title="Опресни"
              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 text-sm">
              ↻
            </button>
          </>
        )}
      </div>
      {/* Monthly report */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase">📧 Месечен отчет</span>
          <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <button onClick={sendReport} disabled={reporting}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
            {reporting ? 'Изпраща...' : 'Изпрати'}
          </button>
        </div>
        {reportMsg && (
          <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${reportMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {reportMsg}
          </div>
        )}
      </div>
    </div>
  )
}

function AddDeviceModal({ API, properties, onClose, onSaved }) {
  const [form, setForm] = useState({ tuya_device_id: '', name: '', property_id: '', type: 'breaker' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.tuya_device_id) return
    setSaving(true)
    await apiFetch(`${API}/api/smart/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, property_id: form.property_id || null }),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-gray-900 text-lg mb-4">Добави смарт устройство</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tuya Device ID</label>
            <input value={form.tuya_device_id} onChange={e => setForm(f => ({...f, tuya_device_id: e.target.value}))}
              placeholder="bf020e1acc3912ebf2gcp7"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Име</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              placeholder="Бушон Ап. 4а"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Имот</label>
            <select value={form.property_id} onChange={e => setForm(f => ({...f, property_id: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— без имот —</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.адрес}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Тип</label>
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="breaker">Предпазител / Бушон</option>
              <option value="lock">Смарт брава</option>
              <option value="router">Рутер / Интернет</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
          <button onClick={save} disabled={saving || !form.tuya_device_id}
            className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Запазва...' : 'Добави'}
          </button>
        </div>
      </div>
    </div>
  )
}

const UNLOCK_LABELS = {
  unlock_fingerprint: '👆 Пръстов отпечатък',
  unlock_password:    '🔢 Парола',
  unlock_card:        '💳 Карта',
  unlock_app:         '📱 Приложение',
  unlock_temporary:   '⏱ Временна парола',
  unlock_temp_pwd:    '⏱ Временна парола',
  unlock_key:         '🔑 Ключ',
  unlock_face:        '😊 Лице',
  alarm_lock:         '🚨 Аларма',
  open_inside:        '🚪 Отворена отвътре',
  close_inside:       '🚪 Затворена отвътре',
}

function LockCard({ device, API, properties, onDelete }) {
  const [tab, setTab]           = useState('records')
  const [records, setRecords]   = useState([])
  const [members, setMembers]   = useState([])
  const [lockStatus, setLockStatus] = useState(null)
  const [loadingRec, setLoadingRec] = useState(false)
  const [loadingMem, setLoadingMem] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // 'unlock' | 'lock'
  const [controlling, setControlling]     = useState(false)
  const [controlMsg, setControlMsg]       = useState(null)
  const [tempForm, setTempForm] = useState({ name: '', hours: 24 })
  const [tempResult, setTempResult] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const prop = properties.find(p => p.id === device.property_id)

  const loadStatus = useCallback(() => {
    apiFetch(`${API}/api/smart/devices/${device.id}/lock/status`)
      .then(r => r.json()).then(setLockStatus).catch(() => {})
  }, [API, device.id])

  const loadRecords = useCallback(() => {
    setLoadingRec(true)
    apiFetch(`${API}/api/smart/devices/${device.id}/lock/records`)
      .then(r => r.json()).then(d => { setRecords(d.records || []); setLoadingRec(false) })
      .catch(() => setLoadingRec(false))
  }, [API, device.id])

  const loadMembers = useCallback(() => {
    setLoadingMem(true)
    apiFetch(`${API}/api/smart/devices/${device.id}/lock/members`)
      .then(r => r.json()).then(d => { setMembers(d.members || []); setLoadingMem(false) })
      .catch(() => setLoadingMem(false))
  }, [API, device.id])

  useEffect(() => { loadRecords(); loadStatus() }, [loadRecords, loadStatus])
  useEffect(() => { if (tab === 'members') loadMembers() }, [tab, loadMembers])

  const control = async (unlock) => {
    setControlling(true); setConfirmAction(null); setControlMsg(null)
    const r = await apiFetch(`${API}/api/smart/devices/${device.id}/lock/control`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unlock }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setControlling(false)
    if (!r.ok) setControlMsg(`✗ ${r.error || r.result?.msg || 'Грешка'}`)
    else setControlMsg(unlock ? '✓ Командата за отключване е изпратена' : '✓ Командата за заключване е изпратена')
    setTimeout(() => { setControlMsg(null); loadStatus(); loadRecords() }, 3000)
  }

  const generateTemp = async () => {
    setGenerating(true); setTempResult(null)
    const now = Math.floor(Date.now() / 1000)
    const r = await apiFetch(`${API}/api/smart/devices/${device.id}/lock/temp-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tempForm.name || 'Временен код',
        effective_time: now,
        invalid_time: now + parseInt(tempForm.hours) * 3600,
      }),
    }).then(r => r.json())
    setGenerating(false)
    setTempResult(r)
  }

  const fmtTime = ts => {
    if (!ts) return '—'
    const d = new Date(typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts)
    return d.toLocaleString('bg-BG')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-bold text-gray-900 text-lg">🔐 {device.name}</div>
          <div className="text-sm text-gray-500">{prop?.адрес || '— без имот —'}</div>
        </div>
        <div className="flex items-center gap-2">
          {confirmDel ? (
            <>
              <button onClick={() => setConfirmDel(false)} className="text-xs px-2 py-1 bg-gray-100 rounded">Не</button>
              <button onClick={() => onDelete(device.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded">Премахни</button>
            </>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
          )}
        </div>
      </div>

      {/* Status + controls */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            lockStatus == null ? 'bg-gray-100 text-gray-500' :
            lockStatus.locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {lockStatus == null ? '⏳ Зарежда...' : lockStatus.locked ? '🔒 Заключена' : '🔓 Отключена'}
          </span>
          {lockStatus?.battery != null && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              lockStatus.battery > 30 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
            }`}>
              🔋 {lockStatus.battery}%
            </span>
          )}
          <button onClick={loadStatus} className="text-xs text-gray-400 hover:text-gray-600">↻</button>
        </div>

        {confirmAction ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-700 flex-1">
              {confirmAction === 'unlock' ? 'Отключи бравата?' : 'Заключи бравата?'}
            </span>
            <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg">Не</button>
            <button onClick={() => control(confirmAction === 'unlock')} disabled={controlling}
              className={`px-4 py-1.5 text-sm font-bold text-white rounded-lg ${confirmAction === 'unlock' ? 'bg-green-600' : 'bg-red-600'}`}>
              {controlling ? '...' : confirmAction === 'unlock' ? 'Отключи' : 'Заключи'}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmAction('unlock')} disabled={controlling}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm">
              🔓 Отключи
            </button>
            <button onClick={() => setConfirmAction('lock')} disabled={controlling}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm">
              🔒 Заключи
            </button>
          </div>
        )}
      </div>

      {controlMsg && (
        <div className={`text-xs px-3 py-1.5 rounded-lg mb-2 ${controlMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {controlMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
        {[['records','📋 История'],['temp','⏱ Временна парола'],['members','👥 Членове']].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${tab===id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Records tab */}
      {tab === 'records' && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Последни 30 дни</span>
            <button onClick={loadRecords} className="text-xs text-blue-600 hover:underline">↻ Обнови</button>
          </div>
          {loadingRec ? <div className="text-sm text-gray-400 py-4 text-center">Зарежда...</div> :
          records.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">Няма записи</div> :
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {records.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                <span className="text-gray-700">{UNLOCK_LABELS[r.code] || r.code}</span>
                <span className="text-xs text-gray-400">{fmtTime(r.event_time)}</span>
              </div>
            ))}
          </div>}
        </div>
      )}

      {/* Temp password tab */}
      {tab === 'temp' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Наименование</label>
            <input value={tempForm.name} onChange={e => setTempForm(f => ({...f, name: e.target.value}))}
              placeholder="Наемател / Техник / Гост"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Валидност (часове)</label>
            <select value={tempForm.hours} onChange={e => setTempForm(f => ({...f, hours: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="1">1 час</option>
              <option value="4">4 часа</option>
              <option value="8">8 часа</option>
              <option value="24">24 часа</option>
              <option value="72">3 дни</option>
              <option value="168">7 дни</option>
            </select>
          </div>
          <button onClick={generateTemp} disabled={generating}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50">
            {generating ? 'Генерира...' : '🔑 Генерирай временна парола'}
          </button>
          {tempResult && (
            <div className={`p-3 rounded-lg text-sm ${tempResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              {tempResult.ok
                ? <><strong>Код:</strong> {tempResult.result?.password || JSON.stringify(tempResult.result)}</>
                : `Грешка: ${tempResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Потребители</span>
            <button onClick={loadMembers} className="text-xs text-blue-600 hover:underline">↻ Обнови</button>
          </div>
          {loadingMem ? <div className="text-sm text-gray-400 py-4 text-center">Зарежда...</div> :
          members.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">Няма регистрирани членове</div> :
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                <div>
                  <div className="font-medium text-gray-800">{m.name || m.user_name || `Потребител ${i+1}`}</div>
                  <div className="text-xs text-gray-400">{m.type || m.unlock_type || ''}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 1 || m.enable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {m.status === 1 || m.enable ? 'Активен' : 'Неактивен'}
                </span>
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  )
}

export default function Smart({ API }) {
  const [devices, setDevices]     = useState([])
  const [properties, setProperties] = useState([])
  const [showAdd, setShowAdd]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = () => {
    apiFetch(`${API}/api/smart/devices`).then(r => r.json()).then(setDevices)
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties)
  }

  useEffect(() => { load() }, [])

  const changeType = (id, type) => {
    apiFetch(`${API}/api/smart/devices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).then(load)
  }

  const deleteDevice = (id) => {
    apiFetch(`${API}/api/smart/devices/${id}`, { method: 'DELETE' }).then(load)
    setConfirmDel(null)
  }

  return (
    <div className="space-y-6">
      {showAdd && <AddDeviceModal API={API} properties={properties} onClose={() => setShowAdd(false)} onSaved={load} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">⚡ Смарт устройства</h2>
          <p className="text-sm text-gray-500 mt-0.5">Управление и мониторинг на smart бушони по апартаменти</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
          + Добави устройство
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">⚡</div>
          <div className="font-semibold text-gray-600 mb-1">Няма добавени устройства</div>
          <div className="text-sm">Добави tongou бушон с неговия Tuya Device ID</div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {devices.map(dev =>
            dev.type === 'lock'
              ? <LockCard key={dev.id} device={dev} API={API} properties={properties} onDelete={id => setConfirmDel(id)} />
              : <DeviceCard key={dev.id} device={dev} API={API} properties={properties} onDelete={id => setConfirmDel(id)} onTypeChange={changeType} />
          )}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="font-bold text-gray-900 mb-2">Премахни устройство?</div>
            <div className="text-sm text-gray-500 mb-5">Устройството ще бъде премахнато от Skyrent (не от Smart Life).</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Не</button>
              <button onClick={() => deleteDevice(confirmDel)} className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg">Премахни</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
