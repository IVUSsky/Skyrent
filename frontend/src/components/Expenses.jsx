import { apiFetch } from '../api'
import React, { useState, useEffect, useRef, useCallback } from 'react'

const CATEGORIES = ['ток','вода','ремонт','застраховка','такса','счетоводство','друго','инвестиция']
const CURRENCIES  = ['BGN','EUR','USD']
const PAYER_IBAN  = 'BG75PRCB92301053911901'

const fmt = n => n != null && !isNaN(n)
  ? Number(n).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—'

function validateIBAN(iban) {
  if (!iban || iban.length < 15) return false
  const r = (iban.slice(4)+iban.slice(0,4)).toUpperCase().split('').map(c => {
    const n = c.charCodeAt(0); return n>=65&&n<=90 ? String(n-55) : c
  }).join('')
  let rem = 0
  for (const ch of r) rem = (rem*10+parseInt(ch,10))%97
  return rem === 1
}

const STATUS_LABEL = { pending:'⏳ Изчакване', processing:'⚡ AI...', done:'✅ Готово', error:'❌ Грешка' }
const STATUS_COLOR = {
  pending:'bg-gray-100 text-gray-600',
  processing:'bg-yellow-100 text-yellow-800',
  done:'bg-green-100 text-green-800',
  error:'bg-red-100 text-red-800'
}
const CAT_COLOR = {
  ток:'bg-yellow-50 border-yellow-200',
  вода:'bg-blue-50 border-blue-200',
  ремонт:'bg-orange-50 border-orange-200',
  застраховка:'bg-purple-50 border-purple-200',
  такса:'bg-gray-50 border-gray-200',
  счетоводство:'bg-indigo-50 border-indigo-200',
  друго:'bg-gray-50 border-gray-200',
}

// ── Autocomplete input ────────────────────────────────────────
function AutocompleteInput({ value, onChange, suggestions, onSelect, placeholder, className }) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter(s =>
    s.name.toLowerCase().includes((value||'').toLowerCase()) && (value||'').length >= 2
  ).slice(0,6)

  return (
    <div className="relative">
      <input
        type="text"
        value={value||''}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-blue-300 rounded-b-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(s => (
            <div
              key={s.id}
              onMouseDown={() => { onSelect(s); setOpen(false) }}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
            >
              <div className="font-semibold text-blue-800">{s.name}</div>
              <div className="text-xs text-gray-500 font-mono">{s.iban} · {s.bic||'—'} · {s.currency||'BGN'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invoice Card ──────────────────────────────────────────────
function InvoiceCard({ inv, properties, counterparties, API, onChange, onDelete, selected, onSelect }) {
  const [form, setForm] = useState({
    supplier_name: inv.supplier_name||'',
    supplier_iban: inv.supplier_iban||'',
    supplier_bic:  inv.supplier_bic||'',
    amount:        inv.amount||'',
    currency:      inv.currency||'BGN',
    reason:        inv.reason||'',
    property_id:   inv.property_id||'',
    expense_category: inv.expense_category||'',
    месец:         inv.месец||'',
    paid:          !!inv.paid,
  })
  const [saving, setSaving] = useState(false)

  // Re-sync form when AI extraction completes (inv updates from parent)
  useEffect(() => {
    setForm(f => ({
      ...f,
      supplier_name: inv.supplier_name || f.supplier_name,
      supplier_iban: inv.supplier_iban || f.supplier_iban,
      supplier_bic:  inv.supplier_bic  || f.supplier_bic,
      amount:        inv.amount        != null ? inv.amount : f.amount,
      currency:      inv.currency      || f.currency,
      reason:        inv.reason        || f.reason,
      paid:          !!inv.paid,
    }))
  }, [inv.status, inv.supplier_name, inv.supplier_iban, inv.amount])

  const upd = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const save = () => {
    setSaving(true)
    apiFetch(`${API}/api/expenses/${inv.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount)||0, property_id: form.property_id||null }),
    }).then(() => { setSaving(false); onChange() }).catch(() => setSaving(false))
  }

  const togglePaid = () => {
    const newPaid = !form.paid
    upd('paid', newPaid)
    apiFetch(`${API}/api/expenses/${inv.id}/paid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: newPaid, paid_date: newPaid ? new Date().toISOString().slice(0,10) : null }),
    }).then(() => onChange())
  }

  const ibanOK = form.supplier_iban ? validateIBAN(form.supplier_iban) : null
  const ibanStyle = ibanOK === true ? 'border-green-400' : ibanOK === false ? 'border-red-400' : ''
  const catStyle  = CAT_COLOR[form.expense_category] || 'bg-white border-gray-200'

  return (
    <div className={`rounded-xl border-2 p-4 mb-3 transition-all ${catStyle} ${selected ? 'ring-2 ring-blue-400' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <input type="checkbox" checked={selected} onChange={e => onSelect(inv.id, e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 flex-shrink-0"/>
          <span className="text-sm font-semibold text-gray-700 truncate">
            {inv.payment_type === 'в брой' ? '💵' : inv.payment_type === 'касова бележка' ? '🧾' : inv.payment_type === 'банков_импорт' ? '🏦' : '📄'} {inv.filename}
          </span>
          {inv.payment_type && inv.payment_type !== 'фактура' && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
              inv.payment_type === 'в брой' ? 'bg-green-100 text-green-700' :
              inv.payment_type === 'касова бележка' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            }`}>{inv.payment_type}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status]||STATUS_COLOR.pending}`}>
            {STATUS_LABEL[inv.status]||inv.status}
          </span>
          {inv.ai_notes && <span className="text-xs text-orange-600 max-w-[160px] truncate" title={inv.ai_notes}>ℹ {inv.ai_notes}</span>}
          <button onClick={() => onDelete(inv.id)} className="text-red-400 hover:text-red-600 ml-1 text-lg leading-none">×</button>
        </div>
      </div>

      {/* Invoice metadata row (from AI extraction) */}
      {(inv.invoice_number || inv.invoice_date || inv.amount_no_vat != null || inv.vat_amount != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 bg-white/60 rounded px-2 py-1.5 mb-2 border border-gray-100">
          {(inv.invoice_number || inv.invoice_date) && (
            <span>
              📋 <span className="font-medium">Фактура №:</span>{' '}
              {inv.invoice_number || '—'}
              {inv.invoice_date && <> от <span className="font-medium">{inv.invoice_date}</span></>}
            </span>
          )}
          {inv.supplier_eik && (
            <span>ЕИК: <span className="font-medium font-mono">{inv.supplier_eik}</span></span>
          )}
          {(inv.amount_no_vat != null || inv.vat_amount != null) && (
            <span>
              Без ДДС: <span className="font-medium">{fmt(inv.amount_no_vat)}</span>
              {' | '}ДДС: <span className="font-medium">{fmt(inv.vat_amount)}</span>
              {' | '}ОБЩО: <span className="font-semibold text-gray-800">{fmt(inv.amount)}</span>
            </span>
          )}
        </div>
      )}

      {/* Fields grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Supplier - full width */}
        <div className="col-span-2 md:col-span-4">
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Доставчик</label>
          <AutocompleteInput
            value={form.supplier_name}
            onChange={v => upd('supplier_name', v)}
            suggestions={counterparties}
            onSelect={cp => setForm(f => ({ ...f, supplier_name: cp.name, supplier_iban: cp.iban, supplier_bic: cp.bic||'', currency: cp.currency||'BGN' }))}
            placeholder="Firma OOD / Company Ltd"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* IBAN */}
        <div className="col-span-2">
          <label className="block text-gray-500 uppercase font-bold mb-0.5">
            IBAN {ibanOK === true ? '✅' : ibanOK === false ? '❌' : ''}
          </label>
          <input type="text" value={form.supplier_iban}
            onChange={e => upd('supplier_iban', e.target.value.toUpperCase().replace(/\s/g,''))}
            className={`w-full border rounded px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${ibanStyle||'border-gray-300'}`}
            placeholder="BG72UNCR..."/>
          {ibanOK === false && (
            <div className="mt-1 px-2 py-1 bg-red-50 border border-red-300 rounded text-xs text-red-700 font-medium">
              ⚠ IBAN невалиден — моля проверете ръчно
            </div>
          )}
        </div>

        {/* BIC */}
        <div>
          <label className="block text-gray-500 uppercase font-bold mb-0.5">BIC</label>
          <input type="text" value={form.supplier_bic}
            onChange={e => upd('supplier_bic', e.target.value.toUpperCase())}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="UNCRBGSF"/>
        </div>

        {/* Amount + Currency */}
        <div>
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Сума</label>
          <div className="flex gap-1">
            <input type="number" step="0.01" min="0" value={form.amount}
              onChange={e => upd('amount', e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="0.00"/>
            <select value={form.currency} onChange={e => upd('currency', e.target.value)}
              className="border border-gray-300 rounded px-1 py-1.5 text-xs focus:outline-none">
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Категория</label>
          <select value={form.expense_category} onChange={e => upd('expense_category', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none">
            <option value="">— изберете —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Property */}
        <div>
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Имот</label>
          <select value={form.property_id} onChange={e => upd('property_id', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none">
            <option value="">— общ разход —</option>
            {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
          </select>
        </div>

        {/* Month */}
        <div>
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Месец</label>
          <input type="month" value={form.месец}
            onChange={e => upd('месец', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none"/>
        </div>

        {/* Reason - full width */}
        <div className="col-span-2 md:col-span-4">
          <label className="block text-gray-500 uppercase font-bold mb-0.5">Основание (латиница, до 90 знака)</label>
          <input type="text" maxLength={90} value={form.reason}
            onChange={e => upd('reason', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Invoice No ..."/>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input type="checkbox" checked={form.paid} onChange={togglePaid}
            className="w-4 h-4 rounded text-green-600"/>
          <span className={form.paid ? 'text-green-700 font-semibold' : 'text-gray-500'}>
            {form.paid ? '✓ Платена' : 'Неплатена'}
          </span>
        </label>
        {inv.xml_exported ? <span className="text-xs text-blue-500">📥 XML</span> : null}
        <div className="ml-auto">
          <button onClick={save} disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Запазва...' : 'Запази'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── XML Export Modal ──────────────────────────────────────────
function XmlModal({ invoices, selectedIds, onClose, API }) {
  const [payerIban, setPayerIban] = useState(PAYER_IBAN)
  const [execDate, setExecDate]   = useState(new Date().toISOString().slice(0,10))
  const [format, setFormat]       = useState('BISERA6')
  const [ids, setIds]             = useState(selectedIds.length ? selectedIds : invoices.map(i => i.id))
  const [exporting, setExporting] = useState(false)

  const toggle = id => setIds(prev => prev.includes(id) ? prev.filter(x => x!==id) : [...prev, id])

  const doExport = async () => {
    if (!ids.length) return
    setExporting(true)
    try {
      const resp = await apiFetch(`${API}/api/expenses/export-xml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, payer_iban: payerIban, exec_date: execDate, format }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `SKAYCAP_${format}_${execDate.replace(/-/g,'')}.xml`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClose(true)
    } catch(e) { alert('Грешка: ' + e.message) }
    finally { setExporting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-900 text-lg">📥 Експорт XML — ISO 20022</h3>
          <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Сметка на Скай Кепитъл (наредител)</label>
            <input type="text" value={payerIban} onChange={e => setPayerIban(e.target.value.toUpperCase().replace(/\s/g,''))}
              className="w-full border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Дата на изпълнение</label>
              <input type="date" value={execDate} onChange={e => setExecDate(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none"/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Формат</label>
              <div className="flex border rounded overflow-hidden">
                {['BISERA6','SEPA'].map(f => (
                  <button key={f} onClick={() => setFormat(f)}
                    className={`px-4 py-2 text-sm font-bold ${format===f ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Включени фактури ({ids.length})</label>
            <div className="max-h-48 overflow-y-auto border rounded divide-y">
              {invoices.map(inv => (
                <label key={inv.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={ids.includes(inv.id)} onChange={() => toggle(inv.id)}
                    className="w-4 h-4 rounded text-blue-600"/>
                  <span className="text-sm flex-1 truncate">{inv.supplier_name||inv.filename}</span>
                  <span className="text-xs text-gray-500 font-mono">{fmt(inv.amount)} {inv.currency}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
            <strong>Общо:</strong> {invoices.filter(i => ids.includes(i.id)).reduce((s,i) => s+(i.amount||0),0).toFixed(2)} (смесени валути)
            · <strong>{ids.length}</strong> плащания
          </div>
        </div>

        <div className="px-6 py-4 border-t flex gap-3 justify-end">
          <button onClick={() => onClose(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Отказ</button>
          <button onClick={doExport} disabled={exporting || !ids.length}
            className="px-5 py-2 text-sm font-bold text-white bg-blue-700 rounded hover:bg-blue-800 disabled:opacity-50">
            {exporting ? 'Генерира...' : '📥 Изтегли XML'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Counterparties subtab ─────────────────────────────────────
function CounterpartiesTab({ API }) {
  const [cps, setCps]   = useState([])
  const [form, setForm] = useState({ name:'', iban:'', bic:'', currency:'BGN' })
  const [search, setSearch] = useState('')

  const load = () => apiFetch(`${API}/api/counterparties`).then(r => r.json()).then(setCps)
  useEffect(() => { load() }, [])

  const add = () => {
    if (!form.name || !form.iban) return
    apiFetch(`${API}/api/counterparties`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)
    }).then(() => { setForm({ name:'', iban:'', bic:'', currency:'BGN' }); load() })
  }

  const del = id => apiFetch(`${API}/api/counterparties/${id}`, { method:'DELETE' }).then(load)

  const filtered = cps.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.iban.includes(search.toUpperCase())
  )

  const ibanValid = form.iban ? validateIBAN(form.iban) : null

  return (
    <div>
      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Наименование</label>
            <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Фирма ООД"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              IBAN {ibanValid===true?'✅':ibanValid===false?'❌':''}
            </label>
            <input type="text" value={form.iban}
              onChange={e => setForm(f=>({...f,iban:e.target.value.toUpperCase().replace(/\s/g,'')}))}
              className={`w-full border rounded px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${ibanValid===false?'border-red-400':ibanValid===true?'border-green-400':'border-gray-300'}`}
              placeholder="BG72UNCR..."/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">BIC</label>
            <input type="text" value={form.bic} onChange={e => setForm(f=>({...f,bic:e.target.value.toUpperCase()}))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              placeholder="UNCRBGSF"/>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Валута</label>
              <select value={form.currency} onChange={e => setForm(f=>({...f,currency:e.target.value}))}
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm">
                {CURRENCIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={add}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-700 rounded hover:bg-blue-800">
              + Добави
            </button>
          </div>
        </div>
      </div>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Търси по наименование или IBAN..."
        className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Наименование','IBAN','BIC','Валута','IBAN ✓',''].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(cp => (
              <tr key={cp.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{cp.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">{cp.iban}</td>
                <td className="px-4 py-2 text-gray-500">{cp.bic||'—'}</td>
                <td className="px-4 py-2 text-gray-500">{cp.currency||'BGN'}</td>
                <td className="px-4 py-2 text-center">
                  {validateIBAN(cp.iban) ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-500">✗</span>}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => del(cp.id)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Няма контрагенти.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Analysis subtab ───────────────────────────────────────────
function AnalysisTab({ API }) {
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [month, setMonth]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showInvestList, setShowInvestList] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const q = month ? `?month=${month}` : ''
    Promise.all([
      apiFetch(`${API}/api/expenses/summary${q}`).then(r => r.json()),
      apiFetch(`${API}/api/import/monthly`).then(r => r.json()).catch(() => []),
    ]).then(([s, mo]) => {
      setSummary(s)
      setMonthly(mo)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [month, API])

  useEffect(() => { load() }, [load])

  if (loading || !summary) return <div className="py-12 text-center text-gray-400">Зарежда...</div>

  // Bank expenses from monthly data
  const filteredMonthly = month ? monthly.filter(m => m.месец === month) : monthly
  const bankExpensesTotal = filteredMonthly.reduce((s, m) => s + Math.abs(m.разход_total || 0), 0)
  const bankByMonth = [...filteredMonthly].sort((a,b) => a.месец < b.месец ? 1 : -1).slice(0, 12)
  const maxBankMonth = Math.max(...bankByMonth.map(m => Math.abs(m.разход_total||0)), 1)

  // Operational by category (cash invoices)
  const cats = (summary.by_category||[]).reduce((acc, r) => {
    const cat = r.expense_category || '—'
    if (!acc[cat]) acc[cat] = {}
    acc[cat][r.currency] = (acc[cat][r.currency]||0) + (r.total||0)
    return acc
  }, {})
  const allCatsSorted = Object.entries(cats).sort((a,b) =>
    ((b[1].BGN||0)+(b[1].EUR||0)) - ((a[1].BGN||0)+(a[1].EUR||0))
  )
  const maxVal = Math.max(...allCatsSorted.map(([,v]) => (v.BGN||0)+(v.EUR||0)), 1)

  // By property
  const propMap = (summary.by_property||[]).reduce((acc, r) => {
    const key = r.property_id
    if (!acc[key]) acc[key] = { адрес: r['адрес'], BGN:0, EUR:0, count:0 }
    acc[key][r.currency] = (acc[key][r.currency]||0) + (r.total||0)
    acc[key].count += r.count
    return acc
  }, {})

  const invest = summary.invest || { total_bgn:0, total_eur:0, count:0, items:[] }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Месец:</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none"/>
        {month && <button onClick={() => setMonth('')} className="text-xs text-gray-400 hover:text-gray-600">× всички</button>}
      </div>

      {/* ── Банкови разходи ── */}
      {monthly.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="text-lg">🏦</span> Банкови разходи {month ? `(${month})` : '(всички месеци)'}
            <span className="text-xs font-normal text-gray-400">— от банкови транзакции</span>
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border rounded-xl p-4 bg-red-50 border-red-200">
              <div className="text-xs font-semibold text-gray-500 uppercase">Общо разходи</div>
              <div className="text-2xl font-bold text-red-700">{fmt(bankExpensesTotal)} €</div>
              <div className="text-xs text-gray-400">{filteredMonthly.length} месеца</div>
            </div>
            <div className="border rounded-xl p-4 bg-red-50 border-red-200">
              <div className="text-xs font-semibold text-gray-500 uppercase">Средно/месец</div>
              <div className="text-2xl font-bold text-red-700">
                {filteredMonthly.length > 0 ? fmt(bankExpensesTotal / filteredMonthly.length) : '—'} €
              </div>
            </div>
          </div>
          {bankByMonth.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
              <h4 className="font-semibold text-gray-700 text-sm mb-3">По месец</h4>
              <div className="space-y-2">
                {bankByMonth.map(m => {
                  const val = Math.abs(m.разход_total || 0)
                  const pct = Math.round(val / maxBankMonth * 100)
                  return (
                    <div key={m.месец} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-gray-500 text-right flex-shrink-0">{m.месец}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div className="h-4 rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }}/>
                      </div>
                      <div className="w-24 text-xs font-semibold text-red-700 text-right flex-shrink-0">{fmt(val)} €</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Оперативни разходи ── */}
      <div>
        <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-lg">💵</span> Касови разходи {month ? `(${month})` : '(всички)'}
          <span className="text-xs font-normal text-gray-400">— в брой / касова бележка</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label:'Общо BGN',  value: fmt(summary.total_bgn),  color:'text-red-700',   bg:'bg-red-50 border-red-200' },
            { label:'Общо EUR',  value: fmt(summary.total_eur),  color:'text-orange-700',bg:'bg-orange-50 border-orange-200' },
            { label:'Фактури',   value: summary.count||0,         color:'text-blue-700',  bg:'bg-blue-50 border-blue-200' },
            { label:'Платени',   value: `${summary.paid_count||0} / ${summary.count||0}`, color:'text-green-700', bg:'bg-green-50 border-green-200' },
          ].map(c => (
            <div key={c.label} className={`border rounded-xl p-4 ${c.bg}`}>
              <div className="text-xs font-semibold text-gray-500 uppercase">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Bar chart by category */}
        {allCatsSorted.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <h4 className="font-semibold text-gray-700 mb-3 text-sm">По категория</h4>
            <div className="space-y-3">
              {allCatsSorted.map(([cat, vals]) => {
                const total = (vals.BGN||0) + (vals.EUR||0)
                const pct   = Math.round(total / maxVal * 100)
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-gray-600 capitalize text-right flex-shrink-0">{cat}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }}/>
                    </div>
                    <div className="w-36 text-xs text-gray-700 flex-shrink-0">
                      {vals.BGN ? <span className="mr-2">{fmt(vals.BGN)} BGN</span> : null}
                      {vals.EUR ? <span>{fmt(vals.EUR)} EUR</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* By property */}
        {Object.keys(propMap).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b">
              <h4 className="font-semibold text-gray-700 text-sm">По имот</h4>
            </div>
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Имот</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">BGN</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">EUR</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Бр.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(propMap).map(([pid, d]) => (
                  <tr key={pid} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{d['адрес'] || `Имот #${pid}`}</td>
                    <td className="px-4 py-2 text-right text-red-700">{d.BGN ? fmt(d.BGN) : '—'}</td>
                    <td className="px-4 py-2 text-right text-orange-700">{d.EUR ? fmt(d.EUR) : '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Инвестиционни разходи ── */}
      <div>
        <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-lg">📈</span> Инвестиционни разходи
          <span className="text-xs font-normal text-gray-400">— еднократни, не влизат в месечните</span>
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="border rounded-xl p-4 bg-indigo-50 border-indigo-200">
            <div className="text-xs font-semibold text-gray-500 uppercase">Общо BGN</div>
            <div className="text-2xl font-bold text-indigo-700">{fmt(invest.total_bgn)}</div>
          </div>
          <div className="border rounded-xl p-4 bg-indigo-50 border-indigo-200">
            <div className="text-xs font-semibold text-gray-500 uppercase">Общо EUR</div>
            <div className="text-2xl font-bold text-indigo-700">{fmt(invest.total_eur)}</div>
          </div>
          <div className="border rounded-xl p-4 bg-indigo-50 border-indigo-200">
            <div className="text-xs font-semibold text-gray-500 uppercase">Записи</div>
            <div className="text-2xl font-bold text-indigo-700">{invest.count||0}</div>
          </div>
        </div>

        {invest.items?.length > 0 && (
          <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setShowInvestList(v => !v)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-indigo-50 transition-colors"
            >
              <span className="font-semibold text-gray-700 text-sm">Списък на инвестициите ({invest.items.length})</span>
              <span className="text-gray-400 text-sm">{showInvestList ? '▲' : '▼'}</span>
            </button>
            {showInvestList && (
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Описание</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Доставчик</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Имот</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Месец</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Сума</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Платено</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invest.items.map(item => (
                    <tr key={item.id} className="hover:bg-indigo-50">
                      <td className="px-4 py-2 font-medium text-gray-800">{item.reason || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{item.supplier_name || '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{item['адрес'] || (item.property_id ? `#${item.property_id}` : '—')}</td>
                      <td className="px-4 py-2 text-gray-500">{item.месец || '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-indigo-700">{fmt(item.amount)} {item.currency}</td>
                      <td className="px-4 py-2 text-center">{item.paid ? '✅' : '⏳'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {invest.items?.length === 0 && (
          <div className="text-sm text-gray-400 italic px-1">
            Няма записани инвестиции. Задай категория "инвестиция" на фактура, за да се появи тук.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function Expenses({ API }) {
  const [subTab, setSubTab]         = useState('invoices')
  const [invoices, setInvoices]     = useState([])
  const [properties, setProperties] = useState([])
  const [counterparties, setCPs]    = useState([])
  const [loading, setLoading]       = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterCat, setFilterCat]   = useState('')
  const [filterPaid, setFilterPaid] = useState('')
  const [selected, setSelected]     = useState([])
  const [xmlModal, setXmlModal]     = useState(false)
  const [manualModal, setManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({ supplier_name:'', amount:'', currency:'EUR', reason:'', property_id:'', expense_category:'друго', месец: new Date().toISOString().slice(0,7), payment_type:'в брой', notes:'' })
  const [manualSaving, setManualSaving] = useState(false)
  const [dragging, setDragging]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearResult, setClearResult] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [searchAmount, setSearchAmount] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const fileRef = useRef()

  const loadInvoices = useCallback(() => {
    const params = new URLSearchParams()
    if (filterMonth) params.set('month', filterMonth)
    if (filterCat)   params.set('category', filterCat)
    if (filterPaid)  params.set('paid', filterPaid)
    return apiFetch(`${API}/api/expenses?${params}`).then(r => r.json()).then(setInvoices)
  }, [API, filterMonth, filterCat, filterPaid])

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/properties`).then(r => r.json()),
      apiFetch(`${API}/api/counterparties`).then(r => r.json()),
    ]).then(([pr, cp]) => { setProperties(pr); setCPs(cp) })
  }, [API])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  const reloadCPs = () => apiFetch(`${API}/api/counterparties`).then(r => r.json()).then(setCPs)

  // Upload files
  const uploadFiles = async (files) => {
    if (!files.length) return
    setUploading(true)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    try {
      const r = await apiFetch(`${API}/api/expenses/upload`, { method: 'POST', body: fd })
      await r.json()
      await loadInvoices()
    } catch(e) { alert('Upload error: ' + e.message) }
    setUploading(false)
  }

  const handleDrop = e => {
    e.preventDefault(); setDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  // AI extraction
  const extractAI = async () => {
    const ids = invoices.filter(i => i.status === 'pending').map(i => i.id)
    if (!ids.length) { alert('Няма нови фактури за извличане'); return }
    setExtracting(true)
    try {
      const r = await apiFetch(`${API}/api/expenses/extract-ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      await loadInvoices(); await reloadCPs()
    } catch(e) { alert('AI грешка: ' + e.message) }
    setExtracting(false)
  }

  const convertBgnToEur = async () => {
    // First do a dry-run to show count
    if (!confirm('Всички фактури преди 2026-01 в лева (BGN) ще се конвертират в евро (EUR) по курс 1.95583.\n\nПродължи?')) return
    setConverting(true)
    try {
      const r = await apiFetch(`${API}/api/expenses/convert-bgn-eur`, { method: 'POST' })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      await loadInvoices()
      alert(`✅ Конвертирани: ${data.updated} фактури от BGN → EUR (курс 1.95583)`)
    } catch(e) { alert('Грешка: ' + e.message) }
    setConverting(false)
  }

  const clearUploaded = async () => {
    setClearConfirm(false)
    try {
      const r = await apiFetch(`${API}/api/expenses/clear-uploaded`, { method: 'POST' })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      await loadInvoices()
      setClearResult(`✅ Изтрити: ${data.deleted} фактури`)
      setTimeout(() => setClearResult(null), 4000)
    } catch(e) { setClearResult('❌ Грешка: ' + e.message); setTimeout(() => setClearResult(null), 5000) }
  }

  const deleteInvoice = async (id) => {
    if (!confirm('Изтриване на фактурата?')) return
    await apiFetch(`${API}/api/expenses/${id}`, { method: 'DELETE' })
    setSelected(s => s.filter(x => x !== id))
    loadInvoices()
  }

  const toggleSelect = (id, checked) => {
    setSelected(s => checked ? [...s, id] : s.filter(x => x !== id))
  }

  const saveManual = () => {
    if (!manualForm.amount) return alert('Сумата е задължителна')
    setManualSaving(true)
    apiFetch(`${API}/api/expenses/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...manualForm, amount: Number(manualForm.amount), property_id: manualForm.property_id || null }),
    })
      .then(r => r.json())
      .then(() => { setManualSaving(false); setManualModal(false); loadInvoices() })
      .catch(e => { setManualSaving(false); alert('Грешка: ' + e.message) })
  }

  // Client-side filtering
  const filteredInvoices = invoices.filter(inv => {
    if (searchText) {
      const q = searchText.toLowerCase()
      if (!(inv.supplier_name||'').toLowerCase().includes(q) &&
          !(inv.reason||'').toLowerCase().includes(q) &&
          !(inv.filename||'').toLowerCase().includes(q)) return false
    }
    if (searchAmount) {
      const amt = parseFloat(searchAmount)
      if (!isNaN(amt) && Math.abs((inv.amount||0) - amt) > 0.01) return false
    }
    return true
  })

  // Summary totals
  const totalBGN = invoices.filter(i => i.currency === 'BGN').reduce((s,i) => s+(i.amount||0), 0)
  const totalEUR = invoices.filter(i => i.currency === 'EUR').reduce((s,i) => s+(i.amount||0), 0)
  const paidCount = invoices.filter(i => i.paid).length

  const pendingIds = invoices.filter(i => i.status === 'pending').map(i => i.id)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-gray-800">💸 Разходи</h2>
        {/* Sub-tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['invoices','📄 Фактури'],['counterparties','🏢 Контрагенти'],['analysis','📊 Анализ']].map(([id,lbl]) => (
            <button key={id} onClick={() => setSubTab(id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab===id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── ФАКТУРИ ── */}
      {subTab === 'invoices' && (
        <div>
          {/* Toolbar */}
          <div className="flex gap-2 flex-wrap items-center mb-4">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"/>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm">
              <option value="">Всички категории</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm">
              <option value="">Всички</option>
              <option value="true">Платени</option>
              <option value="false">Неплатени</option>
            </select>
            <div className="ml-auto flex gap-2 flex-wrap">
              <button onClick={() => fileRef.current.click()} disabled={uploading}
                className="px-3 py-1.5 text-sm font-semibold bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50">
                {uploading ? '⏳ Качва...' : '📤 Качи'}
              </button>
              <input ref={fileRef} type="file" multiple accept=".pdf,image/*" className="hidden"
                onChange={e => { uploadFiles(Array.from(e.target.files)); e.target.value='' }}/>
              <button onClick={extractAI} disabled={extracting || !pendingIds.length}
                className="px-3 py-1.5 text-sm font-semibold bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50">
                {extracting ? '⚡ Извлича...' : `⚡ AI (${pendingIds.length})`}
              </button>
              <button onClick={() => setXmlModal(true)} disabled={!invoices.length}
                className="px-3 py-1.5 text-sm font-semibold bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
                📥 XML
              </button>
              <button onClick={() => setManualModal(true)}
                className="px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded hover:bg-green-700">
                💵 В брой / Касова
              </button>
              <button onClick={convertBgnToEur} disabled={converting}
                title="Конвертира всички фактури преди 2026-01 от BGN в EUR по курс 1.95583"
                className="px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
                {converting ? '⏳...' : '🔄 BGN→EUR'}
              </button>
              {clearConfirm ? (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-red-700 font-semibold">Сигурен?</span>
                  <button onClick={clearUploaded} className="px-2 py-1 text-xs font-bold bg-red-700 text-white rounded hover:bg-red-800">Да</button>
                  <button onClick={() => setClearConfirm(false)} className="px-2 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Не</button>
                </span>
              ) : (
                <button onClick={() => setClearConfirm(true)}
                  title="Изтрива всички качени PDF фактури. Запазва касовите и инвестиционните записи."
                  className="px-3 py-1.5 text-sm font-semibold bg-red-700 text-white rounded hover:bg-red-800">
                  🗑 Изчисти PDF
                </button>
              )}
            </div>
          </div>

          {/* Drag & drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer mb-4 transition-all
              ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}`}
          >
            <div className="text-2xl mb-0.5">📄</div>
            <div className="text-sm text-gray-500">
              <strong className="text-blue-700">Плъзнете PDF/изображения тук</strong> или кликнете за избор
            </div>
          </div>

          {/* Clear result notification */}
          {clearResult && (
            <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${clearResult.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {clearResult}
            </div>
          )}

          {/* Search row */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              type="text"
              placeholder="🔍 Доставчик / основание / файл..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <input
              type="number"
              placeholder="Сума..."
              value={searchAmount}
              onChange={e => setSearchAmount(e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              step="0.01" min="0"
            />
            {(searchText || searchAmount) && (
              <button onClick={() => { setSearchText(''); setSearchAmount('') }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2">× изчисти</button>
            )}
          </div>

          {/* Summary bar */}
          {invoices.length > 0 && (
            <div className="flex gap-4 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-3 mb-3 text-sm shadow-sm">
              <span className="font-semibold text-gray-700">
                {filteredInvoices.length}{filteredInvoices.length !== invoices.length ? ` / ${invoices.length}` : ''} фактури
              </span>
              <span className="text-gray-400">|</span>
              {totalBGN > 0 && <span className="text-red-700 font-medium">BGN: {fmt(totalBGN)}</span>}
              {totalEUR > 0 && <span className="text-orange-700 font-medium">EUR: {fmt(totalEUR)}</span>}
              <span className="text-gray-400">|</span>
              <span className={paidCount === invoices.length ? 'text-green-700' : 'text-gray-600'}>
                {paidCount} платени / {invoices.length - paidCount} неплатени
              </span>
              {selected.length > 0 && <span className="ml-auto text-blue-600 font-medium">{selected.length} избрани</span>}
            </div>
          )}

          {/* Invoice list */}
          {invoices.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">📂</div>
              <div>Няма фактури. Качете PDF файлове горе.</div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Няма резултати за търсенето.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-6"><input type="checkbox" className="w-4 h-4 rounded"
                      onChange={e => setSelected(e.target.checked ? filteredInvoices.map(i=>i.id) : [])}/></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Статус</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Доставчик</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Сума</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Категория</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Месец</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Платена</th>
                    <th className="px-3 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.map(inv => {
                    const isOpen = expandedId === inv.id
                    const catBg = CAT_COLOR[inv.expense_category]
                      ? CAT_COLOR[inv.expense_category].replace('bg-','').split(' ')[0]
                      : ''
                    return (
                      <React.Fragment key={inv.id}>
                        <tr
                          onClick={() => setExpandedId(isOpen ? null : inv.id)}
                          className={`cursor-pointer transition-colors ${isOpen ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.includes(inv.id)}
                              onChange={e => toggleSelect(inv.id, e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600"/>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLOR[inv.status]||STATUS_COLOR.pending}`}>
                              {STATUS_LABEL[inv.status]||inv.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800 truncate max-w-[200px]">
                              {inv.supplier_name || <span className="text-gray-400 italic">{inv.filename}</span>}
                            </div>
                            {inv.reason && <div className="text-xs text-gray-400 truncate max-w-[200px]">{inv.reason}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {inv.amount ? <span className="text-gray-800">{fmt(inv.amount)} <span className="text-xs text-gray-500">{inv.currency}</span></span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {inv.expense_category
                              ? <span className={`text-xs px-2 py-0.5 rounded border capitalize ${CAT_COLOR[inv.expense_category]||'bg-gray-50 border-gray-200'}`}>{inv.expense_category}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{inv.месец||'—'}</td>
                          <td className="px-3 py-2 text-center">
                            {inv.paid ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                            <button onClick={() => deleteInvoice(inv.id)} className="text-red-300 hover:text-red-600 text-lg leading-none">×</button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="px-4 py-3 bg-blue-50 border-t border-blue-100">
                              <InvoiceCard
                                inv={inv}
                                properties={properties}
                                counterparties={counterparties}
                                API={API}
                                onChange={() => { loadInvoices(); reloadCPs() }}
                                onDelete={deleteInvoice}
                                selected={selected.includes(inv.id)}
                                onSelect={toggleSelect}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── КОНТРАГЕНТИ ── */}
      {subTab === 'counterparties' && <CounterpartiesTab API={API} />}

      {/* ── АНАЛИЗ ── */}
      {subTab === 'analysis' && <AnalysisTab API={API} />}

      {/* Manual Cash/Receipt Modal */}
      {manualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-gray-900 text-lg">Добави разход</h3>
              <button onClick={() => setManualModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              {/* Payment type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип разход *</label>
                <div className="flex gap-2">
                  {['в брой', 'касова бележка'].map(t => (
                    <button key={t} onClick={() => setManualForm(f => ({ ...f, payment_type: t }))}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${
                        manualForm.payment_type === t
                          ? t === 'в брой' ? 'border-green-500 bg-green-50 text-green-700' : 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {t === 'в брой' ? '💵 В брой' : '🧾 Касова бележка'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Доставчик / Описание</label>
                <input type="text" value={manualForm.supplier_name}
                  onChange={e => setManualForm(f => ({ ...f, supplier_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="напр. Строителен магазин"/>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Сума *</label>
                  <input type="number" step="0.01" min="0" value={manualForm.amount}
                    onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0.00"/>
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Валута</label>
                  <select value={manualForm.currency} onChange={e => setManualForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select value={manualForm.expense_category} onChange={e => setManualForm(f => ({ ...f, expense_category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Имот</label>
                <select value={manualForm.property_id} onChange={e => setManualForm(f => ({ ...f, property_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">— общ разход —</option>
                  {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Месец</label>
                <input type="month" value={manualForm.месец} onChange={e => setManualForm(f => ({ ...f, месец: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Основание / Бележки</label>
                <input type="text" value={manualForm.reason} onChange={e => setManualForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="напр. Боя за стая, ремонт баня..."/>
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setManualModal(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
              <button onClick={saveManual} disabled={manualSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
                {manualSaving ? 'Запазва...' : 'Добави разход'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* XML Modal */}
      {xmlModal && (
        <XmlModal
          invoices={invoices.filter(i => i.status === 'done' || i.amount)}
          selectedIds={selected}
          API={API}
          onClose={refresh => { setXmlModal(false); if(refresh) loadInvoices() }}
        />
      )}
    </div>
  )
}
