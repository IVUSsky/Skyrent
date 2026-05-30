import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const API = import.meta.env.VITE_API_URL || ''

const UTILITY_COLORS = {
  'топлофикация': '#ef4444',  // red
  'ток':          '#f59e0b',  // amber
  'вода':         '#3b82f6',  // blue
  'газ':          '#10b981',  // emerald
  'друго':        '#8b5cf6',  // violet
}

const UTILITY_ICONS = {
  'топлофикация': '🔥',
  'ток':          '⚡',
  'вода':         '💧',
  'газ':          '🔥',
  'друго':        '📄',
}

/**
 * Reusable utility consumption history chart for a single property.
 * Used in Properties admin view AND Tenant portal.
 *
 * Props:
 *   propertyId    — required
 *   showAmounts   — true to show cost (BGN/EUR); false for kWh-only (tenant view)
 *   compact       — true for tenant-app compact display
 */
export default function UtilityHistoryChart({ propertyId, showAmounts = true, compact = false }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!propertyId) return
    setLoading(true)
    apiFetch(`${API}/api/expenses/properties/${propertyId}/utility-history`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Грешка ' + r.status)))
      .then(d => {
        setHistory(d.history || [])
        setError(null)
      })
      .catch(e => { setError(e.message); setHistory([]) })
      .finally(() => setLoading(false))
  }, [propertyId])

  if (loading) return <div className="text-sm text-gray-500 p-4">Зарежда данни...</div>
  if (error)   return <div className="text-sm text-red-600 p-4">⚠ {error}</div>
  if (!history.length) return (
    <div className="text-sm text-gray-500 p-4 text-center bg-gray-50 rounded">
      Все още няма данни за консумация. Качете фактура (XML) от e-invoice.bg за този имот.
    </div>
  )

  // Group by utility_type
  const byType = {}
  for (const h of history) {
    if (!byType[h.utility_type]) byType[h.utility_type] = []
    byType[h.utility_type].push(h)
  }
  const utilityTypes = Object.keys(byType).sort()

  return (
    <div className="space-y-6">
      {utilityTypes.map(ut => (
        <UtilitySection
          key={ut}
          utility={ut}
          records={byType[ut]}
          color={UTILITY_COLORS[ut] || '#6b7280'}
          icon={UTILITY_ICONS[ut] || '📄'}
          showAmounts={showAmounts}
          compact={compact}
        />
      ))}
    </div>
  )
}

function UtilitySection({ utility, records, color, icon, showAmounts, compact }) {
  // records are already sorted DESC by period — reverse for chart (oldest first)
  const chartData = records.slice().reverse().map(r => {
    const cd = r.consumption_data || {}
    return {
      period: r.period,
      amount: r.amount || 0,
      currency: r.currency,
      // For топлофикация: combine heating + hot water personal energy
      consumption: (cd.personal_property_heating || 0) + (cd.personal_property_hot_water || 0) + (cd.personal_building_installation || 0),
      heating: cd.personal_property_heating || 0,
      hot_water_kwh: cd.personal_property_hot_water || 0,
      hot_water_m3: cd.property_hot_water_quantity_m3 || 0,
      building: cd.personal_building_installation || 0,
      degree_days: cd.degree_days || 0,
      avg_temp: cd.avg_outside_temp,
    }
  })

  // Aggregates
  const totalAmount = records.reduce((s, r) => s + (r.amount || 0), 0)
  const currency = records[0]?.currency || 'EUR'
  const totalKwh = chartData.reduce((s, d) => s + d.consumption, 0)
  const monthsCount = chartData.length

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold capitalize flex items-center gap-2">
          <span style={{ fontSize: '1.4em' }}>{icon}</span>
          {utility}
        </h3>
        <div className="flex gap-4 text-sm">
          <div><span className="text-gray-500">{monthsCount} месеца</span></div>
          {showAmounts && (
            <div>
              <span className="text-gray-500">общо: </span>
              <span className="font-semibold">{totalAmount.toFixed(2)} {currency}</span>
            </div>
          )}
          {totalKwh > 0 && (
            <div>
              <span className="text-gray-500">общо: </span>
              <span className="font-semibold">{totalKwh.toFixed(1)} kWh</span>
            </div>
          )}
        </div>
      </div>

      {/* Consumption chart */}
      {totalKwh > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">Месечна консумация (kWh)</div>
          <ResponsiveContainer width="100%" height={compact ? 180 : 220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: '12px' }}
                formatter={(v, n) => [Number(v).toFixed(1) + ' kWh', n]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="heating" stackId="a" name="Отопление имот" fill={color} />
              <Bar dataKey="hot_water_kwh" stackId="a" name="Топла вода" fill="#60a5fa" />
              <Bar dataKey="building" stackId="a" name="Сградна инсталация" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cost chart (only if showAmounts) */}
      {showAmounts && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">Месечна сума ({currency})</div>
          <ResponsiveContainer width="100%" height={compact ? 150 : 180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: '12px' }}
                formatter={(v) => [Number(v).toFixed(2) + ' ' + currency, 'сума']}
              />
              <Line type="monotone" dataKey="amount" stroke={color} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent records table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Месец</th>
              {showAmounts && <th className="px-2 py-1 text-right">Сума</th>}
              <th className="px-2 py-1 text-right">Имот kWh</th>
              <th className="px-2 py-1 text-right">Гр.дни</th>
              <th className="px-2 py-1 text-right">Темп.</th>
            </tr>
          </thead>
          <tbody>
            {chartData.slice().reverse().slice(0, compact ? 6 : 12).map((r, i) => (
              <tr key={r.period} className={i % 2 ? 'bg-gray-50' : ''}>
                <td className="px-2 py-1 font-medium">{r.period}</td>
                {showAmounts && (
                  <td className="px-2 py-1 text-right font-semibold">
                    {r.amount.toFixed(2)} {r.currency}
                  </td>
                )}
                <td className="px-2 py-1 text-right">{r.consumption.toFixed(1)}</td>
                <td className="px-2 py-1 text-right text-gray-500">{r.degree_days || '—'}</td>
                <td className="px-2 py-1 text-right text-gray-500">
                  {r.avg_temp != null ? `${r.avg_temp}°C` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
