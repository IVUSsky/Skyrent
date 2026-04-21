import React, { useState, useEffect } from 'react'

const APARTMENT_TYPES = new Set(['1-стаен', '2-стаен', '3-стаен', 'Мезонет'])
const GARAGE_TYPES = new Set(['Гараж'])
const PARKING_TYPES = new Set(['Паркомясто'])

const fmt = (n) => (n || 0).toLocaleString('bg-BG')

const STATUS_COLORS = {
  '✅': 'bg-green-100 text-green-800',
  '🔶': 'bg-yellow-100 text-yellow-800',
  '❌': 'bg-red-100 text-red-800',
}

const TYPE_GROUPS = [
  { key: 'all', label: 'Всички', types: null },
  { key: 'apartment', label: 'Апартаменти', types: APARTMENT_TYPES },
  { key: 'garage', label: 'Гаражи', types: GARAGE_TYPES },
  { key: 'parking', label: 'Паркоместа', types: PARKING_TYPES },
]

export default function List({ API }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeGroup, setActiveGroup] = useState('all')
  const [calcPrice, setCalcPrice] = useState('')

  useEffect(() => {
    fetch(`${API}/api/properties`)
      .then(r => r.json())
      .then(data => { setProperties(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const activeProps = properties.filter(p => p['статус'] === '✅')

  const apartments = activeProps.filter(p => APARTMENT_TYPES.has(p['тип']))
  const garages = activeProps.filter(p => GARAGE_TYPES.has(p['тип']))
  const parkings = activeProps.filter(p => PARKING_TYPES.has(p['тип']))

  const kpiCards = [
    {
      label: 'Апартаменти',
      count: apartments.length,
      rent: apartments.reduce((s, p) => s + (p['наем'] || 0), 0),
      color: 'blue',
      icon: '🏢',
    },
    {
      label: 'Гаражи',
      count: garages.length,
      rent: garages.reduce((s, p) => s + (p['наем'] || 0), 0),
      color: 'green',
      icon: '🚗',
    },
    {
      label: 'Паркоместа',
      count: parkings.length,
      rent: parkings.reduce((s, p) => s + (p['наем'] || 0), 0),
      color: 'purple',
      icon: '🅿️',
    },
  ]

  const colorMap = {
    blue: { card: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-600' },
    green: { card: 'bg-green-50 border-green-200', text: 'text-green-700', badge: 'bg-green-600' },
    purple: { card: 'bg-purple-50 border-purple-200', text: 'text-purple-700', badge: 'bg-purple-600' },
  }

  const currentGroup = TYPE_GROUPS.find(g => g.key === activeGroup)
  const filtered = currentGroup?.types
    ? properties.filter(p => currentGroup.types.has(p['тип']))
    : properties

  const avgRentPerSqm = filtered.filter(p => p['статус'] === '✅' && p['наем'] > 0 && p['площ'] > 0)
  const avgRent = avgRentPerSqm.length > 0
    ? avgRentPerSqm.reduce((s, p) => s + p['наем'] / p['площ'], 0) / avgRentPerSqm.length
    : 0

  const calcGrossYield = calcPrice && Number(calcPrice) > 0
    ? ((avgRent * 12 * (filtered[0]?.['площ'] || 60)) / Number(calcPrice) * 100).toFixed(2)
    : null

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Списък имоти</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {kpiCards.map(card => {
          const c = colorMap[card.color]
          return (
            <div key={card.label} className={`border rounded-xl p-4 ${c.card}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{card.icon}</span>
                <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${c.badge}`}>
                  {card.count} активни
                </span>
              </div>
              <div className="text-base font-semibold text-gray-700">{card.label}</div>
              <div className={`text-xl font-bold mt-1 ${c.text}`}>{fmt(card.rent)} €/мес</div>
              <div className="text-xs text-gray-500 mt-0.5">{fmt(card.rent * 12)} €/год</div>
            </div>
          )
        })}
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {TYPE_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveGroup(g.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeGroup === g.key
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {g.label}
            <span className="ml-2 text-xs opacity-75">
              ({(g.types ? properties.filter(p => g.types.has(p['тип'])) : properties).length})
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Адрес', 'Район', 'Тип', 'Статус', 'Наемател', 'Наем (EUR €)', 'Площ м²', 'Наем/м²'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p, i) => {
                const rentPerSqm = p['наем'] && p['площ'] ? (p['наем'] / p['площ']).toFixed(1) : '—'
                return (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{p.id}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{p['адрес']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['район']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['тип']}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p['статус']] || 'bg-gray-100 text-gray-600'}`}>
                        {p['статус']}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{p['наемател']}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{p['наем'] ? fmt(p['наем']) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p['площ']}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">{rentPerSqm !== '—' ? `${rentPerSqm} €` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Yield Calculator */}
      <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
        <h3 className="text-base font-bold text-gray-800 mb-3">Калкулатор на доходност</h3>
        <p className="text-sm text-gray-500 mb-3">
          Базиран на средния наем/м² за избрания тип: <strong>{avgRent.toFixed(2)} €/м²</strong>
        </p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Покупна цена (EUR €)</label>
            <input
              type="number"
              value={calcPrice}
              onChange={e => setCalcPrice(e.target.value)}
              placeholder="напр. 80000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {calcGrossYield && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-xs text-gray-500">Брутна доходност</div>
              <div className="text-2xl font-bold text-green-700">{calcGrossYield}%</div>
              <div className="text-xs text-gray-400">нетна ~{(calcGrossYield * 0.9).toFixed(2)}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
