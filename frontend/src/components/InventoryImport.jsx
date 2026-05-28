import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api'

const CATEGORIES = [
  { id: 'мебели',          icon: '🛋️', label: 'Мебели' },
  { id: 'бяла техника',     icon: '🧊', label: 'Бяла техника' },
  { id: 'малки уреди',     icon: '☕', label: 'Малки уреди' },
  { id: 'вик',              icon: '🚿', label: 'ВиК' },
  { id: 'електро',          icon: '⚡', label: 'Електро' },
  { id: 'друго',            icon: '📦', label: 'Друго' },
]

export default function InventoryImport({ API, currentPropertyId, onClose, onImported }) {
  // step: 1=upload, 2=parsing, 3=validate, 4=submitting, 5=done
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [items, setItems] = useState([])
  const [properties, setProperties] = useState([])
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(d => setProperties(Array.isArray(d) ? d : []))
  }, [API])

  const parse = async () => {
    if (!file) { setErr('Изберете файл'); return }
    setErr(null); setStep(2)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch(`${API}/api/inventory/parse-invoice`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) {
        setErr(d.error || 'Грешка при разчитането')
        if (d.raw) console.log('Claude raw output:', d.raw)
        setStep(1)
        return
      }
      setParsed(d)
      // Pre-fill each item with currentPropertyId (admin can change per item)
      setItems(d.items.map(it => ({ ...it, property_id: currentPropertyId, category: it.category_suggested })))
      setStep(3)
    } catch (e) {
      setErr(e.message); setStep(1)
    }
  }

  const submit = async () => {
    const valid = items.filter(i => i.property_id && i.name)
    if (valid.length === 0) { setErr('Нито един артикул няма имот зададен'); return }
    setErr(null); setStep(4)
    try {
      const r = await apiFetch(`${API}/api/inventory/bulk-import`, {
        method: 'POST',
        body: JSON.stringify({
          supplier:       parsed.supplier,
          invoice_number: parsed.invoice_number,
          invoice_date:   parsed.invoice_date,
          currency:       parsed.currency,
          _temp_filename: parsed._temp_filename,
          _temp_original: parsed._temp_original,
          items:          valid,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Грешка при импорта'); setStep(3); return }
      setResult(d)
      setStep(5)
      if (onImported) onImported()
    } catch (e) { setErr(e.message); setStep(3) }
  }

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // Group items by property_id for visual segmentation
  const propertyMap = Object.fromEntries(properties.map(p => [p.id, p['адрес'] || `#${p.id}`]))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">📄 Импорт от фактура</h3>
            <p className="text-sm text-gray-500">
              {step === 1 && 'Качете PDF или снимка на фактурата — AI ще извлече артикулите'}
              {step === 2 && 'AI разчита фактурата...'}
              {step === 3 && 'Прегледайте и припишете всеки артикул на имот'}
              {step === 4 && 'Импортиране...'}
              {step === 5 && 'Готово!'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center bg-blue-50">
                <div className="text-5xl mb-2">📄</div>
                <p className="text-sm text-gray-700 mb-3">Качи фактура (PDF или JPG/PNG)</p>
                <input type="file" accept=".pdf,image/*"
                  onChange={e => setFile(e.target.files[0])}
                  className="text-sm" />
                {file && (
                  <p className="text-xs text-blue-700 mt-2">
                    Избрано: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                💡 <strong>Съвет:</strong> ясно сканирани фактури / receipts с видим текст на български / английски работят най-добре.
                За техника с гаранция — посочи периода в notes, ако не е в фактурата.
              </div>
            </div>
          )}

          {/* Step 2: Parsing */}
          {step === 2 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3 animate-pulse">🤖</div>
              <p className="text-sm text-gray-700">AI разчита фактурата...</p>
              <p className="text-xs text-gray-500 mt-1">Обикновено отнема 5-15 секунди</p>
            </div>
          )}

          {/* Step 3: Validate */}
          {step === 3 && parsed && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm grid grid-cols-3 gap-2">
                <div><span className="text-gray-500">Доставчик:</span> <strong>{parsed.supplier || '—'}</strong></div>
                <div><span className="text-gray-500">Фактура №:</span> <strong>{parsed.invoice_number || '—'}</strong></div>
                <div><span className="text-gray-500">Дата:</span> <strong>{parsed.invoice_date || '—'}</strong></div>
              </div>

              <div className="text-xs text-gray-600">
                Намерени артикули: <strong>{items.length}</strong>. За всеки избери имот ↓
              </div>

              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                      {/* Name + category */}
                      <div className="md:col-span-5">
                        <input type="text" value={it.name}
                          onChange={e => updateItem(idx, { name: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-medium" />
                        <div className="flex gap-1 mt-1">
                          <select value={it.category} onChange={e => updateItem(idx, { category: e.target.value })}
                            className="text-xs border border-gray-300 rounded px-1.5 py-0.5">
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                          </select>
                          {(it.brand || it.model) && (
                            <span className="text-xs text-gray-500 px-2 py-0.5 truncate">{it.brand} {it.model}</span>
                          )}
                          {it.unit_price && (
                            <span className="text-xs text-gray-500 px-2 py-0.5">€ {it.unit_price}</span>
                          )}
                        </div>
                      </div>

                      {/* Property assignment */}
                      <div className="md:col-span-5">
                        <label className="text-xs text-gray-500">Имот:</label>
                        <select value={it.property_id || ''}
                          onChange={e => updateItem(idx, { property_id: e.target.value ? Number(e.target.value) : null })}
                          className={`w-full border rounded px-2 py-1 text-sm ${!it.property_id ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
                          <option value="">— Избери имот —</option>
                          {properties.map(p => (
                            <option key={p.id} value={p.id}>{p['адрес']}</option>
                          ))}
                        </select>
                        {it.warranty_months && (
                          <div className="text-xs text-gray-500 mt-1">🛡️ Гаранция: {it.warranty_months} мес.</div>
                        )}
                      </div>

                      <div className="md:col-span-2 flex justify-end">
                        <button onClick={() => removeItem(idx)}
                          className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded">
                          ✕ Премахни
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {items.some(i => !i.property_id) && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs text-amber-800">
                  ⚠️ {items.filter(i => !i.property_id).length} артикул(а) без избран имот — те ще се пропуснат при импорта.
                </div>
              )}
            </div>
          )}

          {/* Step 4: Submitting */}
          {step === 4 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3 animate-pulse">⏳</div>
              <p className="text-sm text-gray-700">Импортиране на артикулите...</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && result && (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-lg font-semibold text-green-700 mb-1">Готово!</p>
              <p className="text-sm text-gray-600">Импортирани <strong>{result.created}</strong> артикула.</p>
              {result.created !== items.length && (
                <p className="text-xs text-amber-600 mt-1">{items.length - result.created} пропуснати (без имот)</p>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Фактурата е прикачена като receipt към всеки артикул.
              </p>
            </div>
          )}

          {err && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{err}</div>}
        </div>

        <div className="px-6 py-4 border-t flex justify-between gap-2">
          <div className="text-xs text-gray-400 flex items-center">
            Стъпка {step} от 5
          </div>
          <div className="flex gap-2">
            {step === 1 && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
                <button onClick={parse} disabled={!file}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
                  🤖 Разчети с AI
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">← Назад</button>
                <button onClick={submit}
                  className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg">
                  ✓ Импортирай {items.filter(i => i.property_id).length} артикула
                </button>
              </>
            )}
            {step === 5 && (
              <button onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                Затвори
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
