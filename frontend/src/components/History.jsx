import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

const fmt = (n) => (n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtMonth = (m) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const months = ['Яну','Фев','Мар','Апр','Май','Юни','Юли','Авг','Сеп','Окт','Ное','Дек']
  return `${months[parseInt(mo)-1]} ${y.slice(2)}`
}

const APARTMENT_TYPES = new Set(['1-стаен','2-стаен','3-стаен','Мезонет','Студио'])

// ── Tenant History Panel ──────────────────────────────────────
function TenantHistory({ propertyId, API }) {
  const [history, setHistory] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ tenant_name:'', start_date:'', end_date:'', monthly_rent:'', deposit:'', conditions:'', notes:'' })
  const [saving, setSaving] = useState(false)

  const load = () => apiFetch(`${API}/api/properties/${propertyId}/tenants`)
    .then(r => r.json()).then(setHistory).catch(() => setHistory([]))

  useEffect(() => { if (propertyId) load() }, [propertyId])

  const save = () => {
    if (!form.tenant_name) return alert('Името на наемателя е задължително')
    setSaving(true)
    apiFetch(`${API}/api/properties/${propertyId}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); setAdding(false); setForm({ tenant_name:'', start_date:'', end_date:'', monthly_rent:'', deposit:'', conditions:'', notes:'' }); load() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  const del = (tid) => {
    if (!confirm('Изтриване на записа?')) return
    apiFetch(`${API}/api/properties/tenants/${tid}`, { method: 'DELETE' }).then(load)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-gray-700">История на наемателите</h4>
        <button onClick={() => setAdding(!adding)}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
          + Нов наемател
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Наемател *</label>
              <input type="text" value={form.tenant_name} onChange={e => setForm(f=>({...f,tenant_name:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Пълно ime"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">От дата</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f=>({...f,start_date:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">До дата</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f=>({...f,end_date:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Наем (€/мес)</label>
              <input type="number" value={form.monthly_rent} onChange={e => setForm(f=>({...f,monthly_rent:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                min="0" placeholder="0"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Депозит (€)</label>
              <input type="number" value={form.deposit} onChange={e => setForm(f=>({...f,deposit:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                min="0" placeholder="0"/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Условия на договора</label>
              <input type="text" value={form.conditions} onChange={e => setForm(f=>({...f,conditions:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                placeholder="напр. 1 год. договор, 1 мес. предизвестие"/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Бележки</label>
              <input type="text" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                placeholder="Допълнителна информация"/>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg">Отказ</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">
              {saving ? 'Запазва...' : 'Запази'}
            </button>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">
          Няма записана история на наематели
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className={`border rounded-xl p-3 text-sm ${!h.end_date ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-gray-800">
                    {!h.end_date && <span className="text-green-600 text-xs font-bold mr-2">● ТЕКУЩ</span>}
                    {h.tenant_name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {h.start_date || '—'} → {h.end_date || 'сега'}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="font-bold text-blue-700">{fmt(h.monthly_rent)} €/мес</div>
                  {h.deposit > 0 && <div className="text-xs text-gray-500">Депозит: {fmt(h.deposit)} €</div>}
                </div>
              </div>
              {h.conditions && <div className="text-xs text-gray-600 mt-1.5 bg-white/70 rounded px-2 py-1">📋 {h.conditions}</div>}
              {h.notes && <div className="text-xs text-gray-500 mt-1 italic">{h.notes}</div>}
              <button onClick={() => del(h.id)} className="text-xs text-red-400 hover:text-red-600 mt-1.5">× изтрий</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Property Monthly Chart ────────────────────────────────────
function PropertyChart({ property, API }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!property) return
    setLoading(true)
    apiFetch(`${API}/api/properties/${property.id}/monthly`)
      .then(r => r.json())
      .then(rows => {
        setData(rows.map(r => ({ ...r, месец: fmtMonth(r.месец), нетно: (r.наем || 0) - (r.разходи || 0) })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [property?.id])

  if (!property) return null
  if (loading) return <div className="py-8 text-center text-gray-400">Зарежда...</div>

  const totalRent = data.reduce((s, d) => s + (d.наем || 0), 0)
  const totalExp  = data.reduce((s, d) => s + (d.разходи || 0), 0)
  const avgNet    = data.length ? (totalRent - totalExp) / data.length : 0

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">Общо наем</div>
          <div className="text-xl font-bold text-green-700">{fmt(totalRent)} €</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">Общо разходи</div>
          <div className="text-xl font-bold text-red-600">{fmt(totalExp)} €</div>
        </div>
        <div className={`border rounded-xl p-3 text-center ${avgNet >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase">Средно нетно/мес</div>
          <div className={`text-xl font-bold ${avgNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmt(avgNet)} €</div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl">
          <div className="text-4xl mb-2">📊</div>
          <div>Няма импортирани транзакции за този имот.</div>
          <div className="text-sm mt-1">Импортирайте банково извлечение и свържете транзакциите с имота.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-700 mb-4">Наем vs Разходи по месеци</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="месец" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${fmt(v)}`}/>
              <Tooltip
                formatter={(value, name) => [`${fmt(value)} €`, name === 'наем' ? 'Наем' : name === 'разходи' ? 'Разходи' : 'Нетно']}
                labelStyle={{ fontWeight: 'bold' }}
              />
              <Legend formatter={n => n === 'наем' ? 'Наем' : n === 'разходи' ? 'Разходи' : 'Нетно'}/>
              <ReferenceLine y={0} stroke="#999"/>
              <Bar dataKey="наем" fill="#4ade80" radius={[3,3,0,0]}/>
              <Bar dataKey="разходи" fill="#f87171" radius={[3,3,0,0]}/>
              <Bar dataKey="нетно" fill="#60a5fa" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Main History Component ────────────────────────────────────
export default function History({ API }) {
  const [properties, setProperties] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [activeTab, setActiveTab] = useState('chart')

  useEffect(() => {
    apiFetch(`${API}/api/properties`)
      .then(r => r.json())
      .then(data => {
        setProperties(data)
        // Default: first apartment
        const first = data.find(p => APARTMENT_TYPES.has(p['тип'])) || data[0]
        if (first) setSelectedId(first.id)
      })
  }, [API])

  const selected = properties.find(p => p.id === selectedId)

  const apartments = properties.filter(p => APARTMENT_TYPES.has(p['тип']))
  const others = properties.filter(p => !APARTMENT_TYPES.has(p['тип']))

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-5">История на имотите</h2>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Left: property list */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {apartments.length > 0 && (
              <>
                <div className="px-3 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b">Апартаменти</div>
                {apartments.map(p => (
                  <button key={p.id} onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-3 py-2.5 border-b text-sm transition-colors ${
                      selectedId === p.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                    }`}>
                    <div className="font-medium truncate">{p['адрес']}</div>
                    <div className="text-xs text-gray-500">{p['тип']} · {p['наем'] ? `${(p['наем']||0).toLocaleString('bg-BG')} €` : '—'}</div>
                  </button>
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <div className="px-3 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b">Гаражи / Паркоместа</div>
                {others.map(p => (
                  <button key={p.id} onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-3 py-2.5 border-b text-sm transition-colors ${
                      selectedId === p.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                    }`}>
                    <div className="font-medium truncate">{p['адрес']}</div>
                    <div className="text-xs text-gray-500">{p['тип']} · {p['наем'] ? `${(p['наем']||0).toLocaleString('bg-BG')} €` : '—'}</div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right: content */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <div>
              {/* Header */}
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-4 shadow-sm">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selected['адрес']}</h3>
                    <div className="text-sm text-gray-500">{selected['тип']} · {selected['район']} · {selected['площ'] ? `${selected['площ']} м²` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-blue-700">{(selected['наем']||0).toLocaleString('bg-BG')} €/мес</div>
                    <div className="text-sm text-gray-500">Текущ наемател: <span className="font-medium text-gray-700">{selected['наемател'] || '—'}</span></div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
                {[['chart','📊 Графика'],['tenants','👥 Наематели']].map(([id,lbl]) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab===id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {activeTab === 'chart' && <PropertyChart property={selected} API={API}/>}
              {activeTab === 'tenants' && <TenantHistory propertyId={selected.id} API={API}/>}
            </div>
          ) : (
            <div className="py-16 text-center text-gray-400">Изберете имот от списъка</div>
          )}
        </div>
      </div>
    </div>
  )
}
