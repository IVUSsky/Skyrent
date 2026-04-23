import { apiFetch } from '../api'
import React, { useState, useEffect, useCallback } from 'react'

const BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември']
function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `${BG_MONTHS[parseInt(m) - 1]} ${y}`
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('bg-BG')
}

export default function Invoices({ API, role }) {
  const defaultMonth = new Date().toISOString().slice(0, 7)

  // Filters & search
  const [filterMonth, setFilterMonth] = useState(defaultMonth)
  const [filterType, setFilterType]   = useState('')        // '' | 'invoice' | 'credit_note'
  const [search, setSearch]           = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [useMonthFilter, setUseMonthFilter] = useState(true)
  const [sort, setSort]       = useState('issued_at')
  const [sortDir, setSortDir] = useState('desc')

  // Data
  const [invoices, setInvoices]       = useState([])
  const [properties, setProperties]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)

  // Actions
  const [generating, setGenerating]   = useState(null)
  const [sending, setSending]         = useState(null)
  const [sendingKontrolisi, setSendingKontrolisi] = useState(null)
  const [kontrolisiEmail, setKontrolisiEmail] = useState('')

  // Modals
  const [recipientModal, setRecipientModal] = useState(null)
  const [recipientForm, setRecipientForm]   = useState({ name: '', address: '', eik: '', mol: '' })
  const [cnModal, setCnModal]               = useState(null)
  const [cnForm, setCnForm]                 = useState({ reason: '', notes: '' })
  const [editModal, setEditModal]           = useState(null)
  const [editForm, setEditForm]             = useState({})

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (useMonthFilter && filterMonth) p.set('month', filterMonth)
    if (filterType)   p.set('type', filterType)
    if (search)       p.set('q', search)
    if (!useMonthFilter && dateFrom) p.set('from', dateFrom)
    if (!useMonthFilter && dateTo)   p.set('to', dateTo)
    p.set('sort', sort)
    p.set('dir', sortDir)
    return p.toString()
  }, [filterMonth, filterType, search, dateFrom, dateTo, useMonthFilter, sort, sortDir])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`${API}/api/invoices?${buildQuery()}`).then(r => r.json()),
      apiFetch(`${API}/api/properties`).then(r => r.json()),
    ]).then(([inv, props]) => {
      setInvoices(Array.isArray(inv) ? inv : [])
      setProperties(props)
      setLoading(false)
    }).catch(e => { setLoading(false); showToast(e.message, 'error') })
  }, [API, buildQuery])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    apiFetch(`${API}/api/settings`).then(r => r.json()).then(d => {
      if (d.kontrolisi_email) setKontrolisiEmail(d.kontrolisi_email)
    }).catch(() => {})
  }, [API])

  const toggleSort = (col) => {
    if (sort === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setSortDir('desc') }
  }
  const SortIcon = ({ col }) => sort === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'

  // Properties eligible for invoicing
  const invoiceProps = properties.filter(p => p['статус'] === '✅' && p['наемател'])
  const enabledProps = invoiceProps.filter(p => p.invoice_enabled)

  // Check which props already have invoice for current month
  const invoiceMap = {}
  invoices.forEach(inv => {
    if (inv.type === 'invoice') invoiceMap[`${inv.property_id}_${inv.month}`] = inv
  })

  const toggleInvoiceEnabled = (propId, enabled) => {
    apiFetch(`${API}/api/properties/${propId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_enabled: enabled ? 1 : 0 }),
    }).then(() => load())
  }

  const openRecipient = (prop) => {
    let rec = {}
    try { rec = JSON.parse(prop.invoice_recipient || '{}') } catch {}
    setRecipientForm({ name: rec.name || prop['наемател'] || '', address: rec.address || '', eik: rec.eik || '', mol: rec.mol || '' })
    setRecipientModal(prop)
  }

  const saveRecipient = () => {
    apiFetch(`${API}/api/properties/${recipientModal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_recipient: JSON.stringify(recipientForm) }),
    }).then(() => { setRecipientModal(null); load(); showToast('Данните са запазени') })
  }

  const generate = (prop) => {
    setGenerating(prop.id)
    apiFetch(`${API}/api/invoices/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: prop.id, month: filterMonth }),
    })
      .then(r => r.json())
      .then(d => { setGenerating(null); d.ok ? (showToast(`Фактура ${d.invoice_number} генерирана`), load()) : showToast('Грешка: ' + d.error, 'error') })
      .catch(e => { setGenerating(null); showToast(e.message, 'error') })
  }

  const generateAll = () => {
    const toGenerate = enabledProps.filter(p => !invoiceMap[`${p.id}_${filterMonth}`])
    if (!toGenerate.length) { showToast('Всички фактури вече са генерирани'); return }
    toGenerate.forEach(p => generate(p))
  }

  const sendInvoice = (inv) => {
    setSending(inv.id)
    apiFetch(`${API}/api/invoices/${inv.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(d => { setSending(null); d.ok ? (showToast('Изпратена успешно'), load()) : showToast('Грешка: ' + d.error, 'error') })
      .catch(e => { setSending(null); showToast(e.message, 'error') })
  }

  const createCreditNote = () => {
    apiFetch(`${API}/api/invoices/${cnModal.id}/credit-note`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cnForm),
    })
      .then(r => r.json())
      .then(d => { if (d.ok) { setCnModal(null); showToast(`Кредитно известие ${d.invoice_number} генерирано`); load() } else showToast('Грешка: ' + d.error, 'error') })
      .catch(e => showToast(e.message, 'error'))
  }

  const deleteInvoice = (inv) => {
    if (!window.confirm(`Изтриване на ${inv.type === 'credit_note' ? 'кредитно известие' : 'фактура'} ${inv.invoice_number}?`)) return
    apiFetch(`${API}/api/invoices/${inv.id}`, { method: 'DELETE' })
      .then(() => { load(); showToast('Изтрито') })
  }

  const openEdit = (inv) => {
    setEditModal(inv)
    setEditForm({ amount: inv.amount, vat_rate: inv.vat_rate || 0, notes: inv.notes || '', payment_type: inv.payment_type || '', recipient_name: inv.recipient_name || '', recipient_address: inv.recipient_address || '', recipient_eik: inv.recipient_eik || '', recipient_mol: inv.recipient_mol || '' })
  }

  const saveEdit = () => {
    apiFetch(`${API}/api/invoices/${editModal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    }).then(r => r.json()).then(d => {
      if (d.ok) { setEditModal(null); showToast('Фактурата е обновена'); load() }
      else showToast('Грешка: ' + d.error, 'error')
    })
  }

  const sendKontrolisi = (inv) => {
    setSendingKontrolisi(inv.id)
    apiFetch(`${API}/api/invoices/${inv.id}/send-kontrolisi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(d => { setSendingKontrolisi(null); d.ok ? showToast('Изпратено към Kontrolisi') : showToast('Грешка: ' + d.error, 'error') })
      .catch(e => { setSendingKontrolisi(null); showToast(e.message, 'error') })
  }

  const exportCSV = () => {
    const p = new URLSearchParams()
    if (useMonthFilter && filterMonth) p.set('month', filterMonth)
    if (filterType) p.set('type', filterType)
    if (!useMonthFilter && dateFrom) p.set('from', dateFrom)
    if (!useMonthFilter && dateTo)   p.set('to', dateTo)
    window.open(`${API}/api/invoices/export/csv?${p.toString()}`)
  }

  // Summary totals
  const totalInvoices   = invoices.filter(i => i.type === 'invoice')
  const totalCreditNotes = invoices.filter(i => i.type === 'credit_note')
  const sumTotal  = totalInvoices.reduce((s, i) => s + (i.total || 0), 0)
  const sumCN     = totalCreditNotes.reduce((s, i) => s + (i.total || 0), 0)
  const sumNet    = sumTotal - sumCN

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">🧾 Фактури</h2>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
          📊 Експорт CSV (Controlisy)
        </button>
      </div>

      {/* Property settings panel */}
      <details className="mb-5">
        <summary className="cursor-pointer bg-white rounded-xl shadow border border-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 select-none">
          ⚙️ Настройки — кому се издава фактура ({enabledProps.length} активни)
        </summary>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl px-5 pb-4 pt-2 shadow">
          <div className="space-y-1 mt-2">
            {invoiceProps.map(prop => {
              let rec = {}
              try { rec = JSON.parse(prop.invoice_recipient || '{}') } catch {}
              return (
                <div key={prop.id} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0 flex-wrap">
                  <input type="checkbox" checked={!!prop.invoice_enabled}
                    onChange={e => toggleInvoiceEnabled(prop.id, e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium text-gray-800">{prop['адрес']}</span>
                    <span className="text-gray-400 ml-2 text-xs">{prop['наемател']}</span>
                    {prop.invoice_enabled && rec.name && (
                      <span className="text-blue-600 text-xs ml-2">→ {rec.name}{rec.eik ? ` (ЕИК: ${rec.eik})` : ''}</span>
                    )}
                  </div>
                  {prop.invoice_enabled && (
                    <button onClick={() => openRecipient(prop)}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded border border-gray-200">
                      👤 Получател
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </details>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Month vs date range toggle */}
          <div className="flex gap-2">
            <button onClick={() => setUseMonthFilter(true)}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${useMonthFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              По месец
            </button>
            <button onClick={() => setUseMonthFilter(false)}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${!useMonthFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              По период
            </button>
          </div>

          {useMonthFilter ? (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Месец:</label>
              <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">От:</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <label className="text-xs text-gray-500">До:</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {/* Type filter */}
          <div className="flex gap-1">
            {[['', 'Всички'], ['invoice', 'Фактури'], ['credit_note', 'Кредитни известия']].map(([val, label]) => (
              <button key={val} onClick={() => setFilterType(val)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${filterType === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Търси по №, получател..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Generate all */}
          {useMonthFilter && enabledProps.length > 0 && (
            <button onClick={generateAll}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap">
              + Генерирай всички
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-semibold uppercase">Фактури</div>
          <div className="text-xl font-bold text-blue-700">{fmtMoney(sumTotal)} €</div>
          <div className="text-xs text-gray-400">{totalInvoices.length} бр.</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-semibold uppercase">Кредитни известия</div>
          <div className="text-xl font-bold text-purple-700">-{fmtMoney(sumCN)} €</div>
          <div className="text-xs text-gray-400">{totalCreditNotes.length} бр.</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-semibold uppercase">Нетно</div>
          <div className="text-xl font-bold text-green-700">{fmtMoney(sumNet)} €</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 font-semibold uppercase">ДДС</div>
          <div className="text-xl font-bold text-gray-700">
            {fmtMoney(invoices.filter(i => i.type==='invoice').reduce((s,i) => s+(i.vat_amount||0),0) - totalCreditNotes.reduce((s,i) => s+(i.vat_amount||0),0))} €
          </div>
        </div>
      </div>

      {/* Generate buttons for enabled properties without invoice */}
      {useMonthFilter && enabledProps.filter(p => !invoiceMap[`${p.id}_${filterMonth}`]).length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-yellow-800 font-medium">Без фактура за {monthLabel(filterMonth)}:</span>
          {enabledProps.filter(p => !invoiceMap[`${p.id}_${filterMonth}`]).map(prop => (
            <button key={prop.id} onClick={() => generate(prop)} disabled={generating === prop.id}
              className="text-xs px-3 py-1 bg-white border border-yellow-300 text-yellow-800 hover:bg-yellow-100 rounded-lg disabled:opacity-50">
              {generating === prop.id ? '...' : `+ ${prop['адрес']}`}
            </button>
          ))}
        </div>
      )}

      {/* Invoices table */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">Зарежда...</div>
      ) : invoices.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <div className="text-4xl mb-2">🧾</div>
          <div>Няма фактури по зададените критерии.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    ['invoice_number', '№'],
                    ['', 'Тип'],
                    ['issued_at', 'Дата'],
                    ['recipient_name', 'Получател'],
                    ['', 'Имот / Месец'],
                    ['total', 'Данъчна осн.'],
                    ['total', 'ДДС'],
                    ['total', 'Общо'],
                    ['', 'Изпратена'],
                    ['', 'Действия'],
                  ].map(([col, label], idx) => (
                    <th key={idx}
                      onClick={col ? () => toggleSort(col) : undefined}
                      className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap ${col ? 'cursor-pointer hover:text-gray-700' : ''}`}>
                      {label}{col && <SortIcon col={col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv, i) => {
                  const prop = properties.find(p => p.id === inv.property_id)
                  const isCN = inv.type === 'credit_note'
                  const sign = isCN ? -1 : 1
                  return (
                    <tr key={inv.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50/30`}>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                        {inv.invoice_number}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isCN
                          ? <span className="inline-block bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">КИ</span>
                          : <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">Фактура</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(inv.issued_at)}</td>
                      <td className="px-3 py-2 text-xs text-gray-800 max-w-[130px] truncate" title={inv.recipient_name}>
                        {inv.recipient_name || inv.tenant_name}
                        {inv.recipient_eik && <div className="text-gray-400">ЕИК: {inv.recipient_eik}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <div className="truncate max-w-[120px]">{prop?.['адрес'] || `#${inv.property_id}`}</div>
                        <div className="text-gray-400">{monthLabel(inv.month)}</div>
                        {isCN && <div className="text-purple-600 text-xs">към фактура</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                        {fmtMoney(sign * inv.amount)} €
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                        {fmtMoney(sign * inv.vat_amount)} €
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap">
                        <span className={isCN ? 'text-purple-700' : 'text-gray-900'}>
                          {isCN ? '-' : ''}{fmtMoney(inv.total)} €
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {inv.sent_at
                          ? <span className="text-green-600">✅ {fmtDate(inv.sent_at)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <a href={`${API}/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded" title="Отвори PDF">
                            📄
                          </a>
                          {prop?.email && (
                            <button onClick={() => sendInvoice(inv)} disabled={sending === inv.id}
                              className="px-2 py-1 text-xs bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded disabled:opacity-50" title="Изпрати по имейл">
                              {sending === inv.id ? '...' : '📧'}
                            </button>
                          )}
                          <button onClick={() => openEdit(inv)}
                            className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded" title="Редактирай">
                            ✏️
                          </button>
                          {kontrolisiEmail && (
                            <button onClick={() => sendKontrolisi(inv)} disabled={sendingKontrolisi === inv.id}
                              className="px-2 py-1 text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 rounded disabled:opacity-50" title="Изпрати към Kontrolisi">
                              {sendingKontrolisi === inv.id ? '...' : '📊'}
                            </button>
                          )}
                          {!isCN && (
                            <button onClick={() => { setCnModal(inv); setCnForm({ reason: '', notes: '' }) }}
                              className="px-2 py-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded" title="Издай кредитно известие">
                              КИ
                            </button>
                          )}
                          {role !== 'broker' && (
                            <button onClick={() => deleteInvoice(inv)}
                              className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded" title="Изтрий">
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recipient modal */}
      {recipientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-gray-900">Данни на получателя</h3>
              <p className="text-sm text-gray-500">{recipientModal['адрес']} · {recipientModal['наемател']}</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {[
                { key: 'name',    label: 'Получател (фирма или физическо лице)', ph: recipientModal['наемател'] },
                { key: 'address', label: 'Адрес',                               ph: 'гр. София, ул. ...' },
                { key: 'eik',     label: 'ЕИК / ЕГН',                           ph: 'по желание' },
                { key: 'mol',     label: 'МОЛ',                                  ph: 'по желание' },
              ].map(({ key, label, ph }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" value={recipientForm[key]}
                    onChange={e => setRecipientForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={ph}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setRecipientModal(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
              <button onClick={saveRecipient} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Запази</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit note modal */}
      {cnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-gray-900">Кредитно известие</h3>
              <p className="text-sm text-gray-500">към фактура № {cnModal.invoice_number} · {fmtMoney(cnModal.total)} €</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Основание *</label>
                <input type="text" value={cnForm.reason}
                  onChange={e => setCnForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="напр. Грешно начислена сума, Прекратен договор..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Бележки</label>
                <input type="text" value={cnForm.notes}
                  onChange={e => setCnForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                Кредитното известие ще анулира изцяло фактура № {cnModal.invoice_number} за сумата от {fmtMoney(cnModal.total)} €
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setCnModal(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
              <button onClick={createCreditNote} disabled={!cnForm.reason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-lg">
                Издай КИ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Invoice Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">✏️ Редактирай фактура {editModal.invoice_number}</h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Сума (без ДДС)</label>
                  <input type="number" value={editForm.amount} min="0" step="0.01"
                    onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ДДС %</label>
                  <select value={editForm.vat_rate} onChange={e => setEditForm(f => ({ ...f, vat_rate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="0">0%</option>
                    <option value="20">20%</option>
                  </select>
                </div>
              </div>
              {[['recipient_name','Получател (фирма/лице)'],['recipient_address','Адрес на получателя'],['recipient_eik','ЕИК/ЕГН'],['recipient_mol','МОЛ'],['payment_type','Начин на плащане'],['notes','Бележки']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                  <input type="text" value={editForm[k]} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                Новата сума: <strong>{fmtMoney(Number(editForm.amount) * (1 + Number(editForm.vat_rate) / 100))} €</strong> (с ДДС)
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Отказ</button>
              <button onClick={saveEdit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                💾 Запази и регенерирай PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
