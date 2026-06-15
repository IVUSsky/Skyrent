import { apiFetch } from '../api'
import React, { useState, useEffect } from 'react'

const fmt = (n) => n != null && !isNaN(n)
  ? Number(n).toLocaleString('bg-BG', { maximumFractionDigits: 0 }) : '—'

// Концентрационен риск — какъв дял от наема идва от топ-3 наематели.
// Самостоятелен (собствен fetch на /api/properties) → лесно се вмъква навсякъде.
export default function ConcentrationRisk({ API = '' }) {
  const [properties, setProperties] = useState(null)
  useEffect(() => {
    apiFetch(`${API}/api/properties`).then(r => r.json())
      .then(p => setProperties(Array.isArray(p) ? p : []))
      .catch(() => setProperties([]))
  }, [API])
  if (!properties) return null

  const tenantRents = {}
  properties.filter(p => p['статус'] === '✅' && p['наем'] > 0).forEach(p => {
    const t = p['наемател'] || 'Неизвестен'
    tenantRents[t] = (tenantRents[t] || 0) + (p['наем'] || 0)
  })
  const totalActiveRent = Object.values(tenantRents).reduce((s, v) => s + v, 0)
  const sortedTenants = Object.entries(tenantRents).sort((a, b) => b[1] - a[1])
  if (!sortedTenants.length) return null
  const top3Rent = sortedTenants.slice(0, 3).reduce((s, [, v]) => s + v, 0)
  const top3Pct = totalActiveRent > 0 ? top3Rent / totalActiveRent : 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-gray-600 mb-2">Концентрационен риск (Топ 3 наематели)</div>
      <div className="text-xl font-bold text-gray-800 mb-2">{(top3Pct * 100).toFixed(1)}% от наема</div>
      <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
        <div className={`h-3 rounded-full ${top3Pct <= 0.3 ? 'bg-green-500' : top3Pct <= 0.5 ? 'bg-yellow-400' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, top3Pct * 100)}%` }} />
      </div>
      <div className="space-y-1">
        {sortedTenants.slice(0, 3).map(([tenant, rent]) => (
          <div key={tenant} className="flex justify-between text-xs text-gray-600">
            <span className="truncate max-w-[220px]">{tenant}</span>
            <span className="font-medium">{fmt(rent)} € ({totalActiveRent > 0 ? ((rent / totalActiveRent) * 100).toFixed(1) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
