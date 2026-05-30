import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Banner показващ фактури с партиден номер но без обвързан имот.
 * Позволява избор на имот → save partiden в properties.utility_accounts → retroactive link.
 *
 * Props:
 *   onChange — callback след успешен mapping (за refresh на parent invoice list)
 */
export default function UnmappedInvoicesBanner({ onChange }) {
  const [unmapped, setUnmapped] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})  // { invoiceId: propertyId }
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      apiFetch(`${API}/api/expenses/unmapped-invoices`).then(r => r.ok ? r.json() : { unmapped: [] }),
      apiFetch(`${API}/api/properties`).then(r => r.ok ? r.json() : []),
    ]).then(([um, props]) => {
      setUnmapped(um.unmapped || [])
      setProperties(Array.isArray(props) ? props : (props.properties || []))
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Extract partiden + utility from ai_notes
  // Pattern in ai_notes: "Партиден 4000457500 (топлофикация) — нужен mapping"
  const parseAiNote = (notes) => {
    if (!notes) return { partiden: '', utility: '' }
    const m = notes.match(/Партиден\s+(\S+)\s*\((\S+)\)/)
    return m ? { partiden: m[1], utility: m[2] } : { partiden: '', utility: '' }
  }

  const mapInvoice = async (invId) => {
    const propId = selected[invId]
    if (!propId) return
    const inv = unmapped.find(u => u.id === invId)
    if (!inv) return
    const { partiden, utility } = parseAiNote(inv.ai_notes)
    if (!partiden || !utility) {
      setToast({ type: 'error', text: 'Не мога да извлека партиден № от записа' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    setSaving(invId)
    try {
      const r = await apiFetch(`${API}/api/expenses/${invId}/map-property`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propId, utility_type: utility, utility_account_id: partiden }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Грешка ' + r.status)
      const propName = properties.find(p => p.id === propId)?.адрес || `Имот ${propId}`
      setToast({
        type: 'success',
        text: `✓ Свързан с ${propName}. Retroactive: ${j.retroactive_linked} други фактури също свързани.`
      })
      setTimeout(() => setToast(null), 4000)
      load()
      if (onChange) onChange()
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return null
  if (!unmapped.length) return null

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4">
      {toast && (
        <div className={`mb-2 px-3 py-2 rounded text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {toast.text}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📍</span>
        <h3 className="font-bold text-amber-900">
          {unmapped.length} {unmapped.length === 1 ? 'фактура чака' : 'фактури чакат'} обвързване с имот
        </h3>
      </div>
      <p className="text-xs text-amber-800 mb-3">
        Изберете имот за всеки нов партиден номер — следващите фактури от него ще се обвързват автоматично.
      </p>
      <div className="space-y-2">
        {unmapped.map(inv => {
          const { partiden, utility } = parseAiNote(inv.ai_notes)
          return (
            <div key={inv.id} className="bg-white rounded p-2 flex items-center gap-2 flex-wrap text-sm">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-gray-800">{inv.supplier_name || '(без име)'}</div>
                <div className="text-xs text-gray-500">
                  Партиден <span className="font-mono font-semibold">{partiden}</span>
                  {utility && <span> · {utility}</span>}
                  {inv.invoice_date && <span> · {inv.invoice_date}</span>}
                  {inv.amount != null && <span> · {Number(inv.amount).toFixed(2)} {inv.currency}</span>}
                </div>
              </div>
              <select
                value={selected[inv.id] || ''}
                onChange={e => setSelected({ ...selected, [inv.id]: parseInt(e.target.value) || '' })}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">— избери имот —</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.адрес || `Имот ${p.id}`}
                  </option>
                ))}
              </select>
              <button
                onClick={() => mapInvoice(inv.id)}
                disabled={!selected[inv.id] || saving === inv.id}
                className="px-3 py-1 text-xs font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {saving === inv.id ? '⏳ Записва...' : '🔗 Свържи'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
