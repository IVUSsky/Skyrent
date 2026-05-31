import { apiFetch } from '../api'
import React, { useState, useEffect, useCallback } from 'react'

const fmt = (n) => (n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември']

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `${BG_MONTHS[parseInt(m) - 1]} ${y}`
}

const PAYMENT_TYPE_LABELS = {
  'брой':        '💵 В брой',
  'друга_сметка': '🏦 Друга сметка',
  'банков':      '🏛️ Банков импорт',
}

export default function Tenants({ API }) {
  const today = new Date()
  const defaultMonth = today.toISOString().slice(0, 7)

  const [view, setView]   = useState('month') // 'month' | 'year'
  const [year, setYear]   = useState(today.getFullYear())
  const [matrix, setMatrix] = useState(null)
  const [matrixLoading, setMatrixLoading] = useState(false)

  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Contact editing
  const [editingContact, setEditingContact] = useState(null)
  const [contactForm, setContactForm] = useState({ email: '', телефон: '' })
  const [savingContact, setSavingContact] = useState(false)

  // Manual payment marking
  const [markingPaid, setMarkingPaid] = useState(null) // property id
  const [markForm, setMarkForm] = useState({ amount: '', payment_type: 'брой', notes: '' })
  const [savingMark, setSavingMark] = useState(false)

  const [toast, setToast] = useState(null)
  const [diag, setDiag]   = useState(null)
  const [showDiag, setShowDiag] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(() => {
    setLoading(true)
    apiFetch(`${API}/api/properties/rent-status?month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
    apiFetch(`${API}/api/properties/rent-diagnostics?month=${month}`)
      .then(r => r.json())
      .then(setDiag)
      .catch(() => setDiag(null))
  }, [API, month])

  useEffect(() => { load() }, [load])

  const loadMatrix = useCallback(() => {
    setMatrixLoading(true)
    apiFetch(`${API}/api/properties/rent-matrix?year=${year}`)
      .then(r => r.json())
      .then(d => { setMatrix(d); setMatrixLoading(false) })
      .catch(() => setMatrixLoading(false))
  }, [API, year])

  useEffect(() => { if (view === 'year') loadMatrix() }, [view, loadMatrix])

  const jumpToMonth = (ym) => {
    setMonth(ym)
    setView('month')
  }

  const acceptPrepaid = (prop) => {
    apiFetch(`${API}/api/properties/${prop.property_id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month,
        amount: prop.expected,
        payment_type: 'друга_сметка',
        notes: `Платил предварително на ${prop.дата} (банков превод ${prop.сума}€)`,
      }),
    })
      .then(r => r.json())
      .then(() => { load(); showToast(`✅ ${prop.адрес} — маркиран като платен`) })
      .catch(e => showToast('Грешка: ' + e.message, 'error'))
  }

  const openContact = (prop) => {
    setEditingContact(prop.id)
    setMarkingPaid(null)
    setContactForm({ email: prop.email || '', телефон: prop['телефон'] || '' })
  }

  const saveContact = (propId) => {
    setSavingContact(true)
    apiFetch(`${API}/api/properties/${propId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    })
      .then(r => r.json())
      .then(() => { setSavingContact(false); setEditingContact(null); load(); showToast('Контактите са запазени') })
      .catch(e => { setSavingContact(false); showToast('Грешка: ' + e.message, 'error') })
  }

  const openMarkPaid = (prop) => {
    setMarkingPaid(prop.id)
    setEditingContact(null)
    setMarkForm({ amount: prop['наем'] || '', payment_type: 'брой', notes: '' })
  }

  const saveMarkPaid = (propId) => {
    setSavingMark(true)
    apiFetch(`${API}/api/properties/${propId}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, ...markForm, amount: Number(markForm.amount) || 0 }),
    })
      .then(r => r.json())
      .then(() => { setSavingMark(false); setMarkingPaid(null); load(); showToast('Плащането е записано') })
      .catch(e => { setSavingMark(false); showToast('Грешка: ' + e.message, 'error') })
  }

  const unmarkPaid = (propId) => {
    apiFetch(`${API}/api/properties/${propId}/mark-paid?month=${month}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(() => { load(); showToast('Плащането е премахнато') })
      .catch(e => showToast('Грешка: ' + e.message, 'error'))
  }

  const sendReminder = (prop) => {
    apiFetch(`${API}/api/email/reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: prop.email,
        tenant_name: prop['наемател'],
        property_address: prop['адрес'],
        amount: fmt(prop['наем']),
        month_label: monthLabel(month),
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) showToast(`Напомняне изпратено до ${prop['наемател']}`)
        else showToast('Грешка: ' + (d.error || 'неизвестна'), 'error')
      })
      .catch(e => showToast('Грешка: ' + e.message, 'error'))
  }

  const sendReminderAll = () => {
    const unpaidWithEmail = (data?.properties || []).filter(p => !p.is_paid && p.email)
    if (!unpaidWithEmail.length) { showToast('Няма наематели с email адрес', 'error'); return }
    apiFetch(`${API}/api/email/reminder-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month_label: monthLabel(month),
        tenants: unpaidWithEmail.map(p => ({
          email: p.email,
          name: p['наемател'],
          address: p['адрес'],
          amount: fmt(p['наем']),
        })),
      }),
    })
      .then(r => r.json())
      .then(d => {
        const ok = (d.results || []).filter(r => r.ok).length
        const fail = (d.results || []).filter(r => !r.ok).length
        showToast(`Изпратени: ${ok}${fail ? `, неуспешни: ${fail}` : ''}`, fail ? 'error' : 'success')
      })
      .catch(e => showToast('Грешка: ' + e.message, 'error'))
  }

  const sendSmsReminder = (prop) => {
    const text = encodeURIComponent(`Здравейте, ${prop['наемател']}. Напомняме за наема за ${monthLabel(month)} — ${fmt(prop['наем'])} €. Моля, наредете плащането. Sky Capital`)
    window.open(`sms:${prop['телефон']}?body=${text}`)
  }

  if (view === 'month' && loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (view === 'month' && error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  const props = data?.properties || []
  const paid = props.filter(p => p.is_paid)
  const unpaid = props.filter(p => !p.is_paid)
  const totalExpected = props.reduce((s, p) => s + (p['наем'] || 0), 0)
  const totalPaid = props.reduce((s, p) => s + (p.paid_amount || 0), 0)

  const tableProps = {
    API, month,
    onEdit: openContact, onReminder: sendReminder, onSms: sendSmsReminder,
    editingContact, contactForm, setContactForm,
    onSaveContact: saveContact, onCancelContact: () => setEditingContact(null), savingContact,
    markingPaid, markForm, setMarkForm,
    onOpenMarkPaid: openMarkPaid, onSaveMarkPaid: saveMarkPaid,
    onCancelMarkPaid: () => setMarkingPaid(null), savingMark,
    onUnmark: unmarkPaid,
  }

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">Наематели — плащания</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => setView('month')}
              className={`px-3 py-1.5 ${view === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              📅 По месец
            </button>
            <button onClick={() => setView('year')}
              className={`px-3 py-1.5 border-l border-gray-300 ${view === 'year' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              🗓️ Цяла година
            </button>
          </div>

          {view === 'month' ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">Месец:</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">Година:</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[today.getFullYear() + 1, today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2, today.getFullYear() - 3].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {view === 'month' && (
            <button
              onClick={sendReminderAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg">
              📧 Изпрати напомняния до всички
            </button>
          )}
        </div>
      </div>

      {view === 'year' && (
        <YearMatrix matrix={matrix} loading={matrixLoading} onCellClick={jumpToMonth} />
      )}

      {view === 'month' && (<>


      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Очакван наем</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{fmt(totalExpected)} €</div>
          <div className="text-xs text-gray-500">{props.length} наематели</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Платили</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{fmt(totalPaid)} €</div>
          <div className="text-xs text-gray-500">{paid.length} наематели</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Не са платили</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{fmt(totalExpected - totalPaid)} €</div>
          <div className="text-xs text-gray-500">{unpaid.length} наематели</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Събираемост</div>
          <div className="text-2xl font-bold text-gray-700 mt-1">
            {totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0}%
          </div>
          <div className="text-xs text-gray-500">за {monthLabel(month)}</div>
        </div>
      </div>

      {/* Diagnostics */}
      {diag && (diag.summary.duplicates_count + diag.summary.prepaid_count + diag.summary.unassigned_count + diag.summary.miscategorized_count) > 0 && (
        <div className="mb-6 border border-amber-300 bg-amber-50 rounded-xl overflow-hidden">
          <button onClick={() => setShowDiag(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-amber-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔍</span>
              <span className="font-semibold text-amber-800">Диагностика — {monthLabel(month)}</span>
              <span className="text-xs text-amber-700">
                {diag.summary.duplicates_count > 0    && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ {diag.summary.duplicates_count} възможен дубликат</span>}
                {diag.summary.prepaid_count > 0       && <span className="ml-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700">⏪ {diag.summary.prepaid_count} платил предварително</span>}
                {diag.summary.unassigned_count > 0    && <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">❓ {diag.summary.unassigned_count} неприсвоени</span>}
                {diag.summary.miscategorized_count > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">🔀 {diag.summary.miscategorized_count} сбъркана категория</span>}
              </span>
            </div>
            <span className="text-amber-600 text-sm">{showDiag ? '▲ Скрий' : '▼ Покажи'}</span>
          </button>

          {showDiag && (
            <div className="px-5 pb-5 space-y-4">
              {/* Duplicates */}
              {diag.duplicates.length > 0 && (
                <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-sm font-semibold text-red-800">
                    ⚠ Възможен дубликат — {diag.duplicates.length} имот(а) с ≥2 плащания за този месец
                  </div>
                  <div className="divide-y divide-gray-100 text-sm">
                    {diag.duplicates.map(d => (
                      <div key={d.property_id} className="px-3 py-2">
                        <div className="flex justify-between items-baseline">
                          <div>
                            <span className="font-medium text-gray-800">{d.адрес}</span>
                            <span className="text-gray-500 text-xs ml-2">{d.наемател}</span>
                          </div>
                          <div className="text-xs">
                            Очакван: <strong>{fmt(d.expected)} €</strong>
                            <span className="mx-2">·</span>
                            Платено: <strong className={d.over_expected ? 'text-red-700' : 'text-gray-700'}>
                              {d.total.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </strong>
                            <span className="ml-1 text-gray-400">({d.tx_count} тx)</span>
                          </div>
                        </div>
                        <div className="mt-1 ml-3 text-xs text-gray-600 space-y-0.5">
                          {d.txs.map(t => (
                            <div key={t.id}>
                              • <span className="text-gray-500">{t.дата}</span>{' '}
                              <strong>{t.сума.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €</strong>
                              {' — '}<span className="text-gray-500">{t.контрагент}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prepaid */}
              {diag.prepaid.length > 0 && (
                <div className="bg-white border border-green-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-green-50 border-b border-green-200 text-sm font-semibold text-green-800">
                    ⏪ Платил предварително — {diag.prepaid.length} имот(а) платили в {diag.prevMonth} за {month}
                  </div>
                  <div className="divide-y divide-gray-100 text-sm">
                    {diag.prepaid.map(p => (
                      <div key={p.property_id} className="px-3 py-2 flex justify-between items-center">
                        <div>
                          <div>
                            <span className="font-medium text-gray-800">{p.адрес}</span>
                            <span className="text-gray-500 text-xs ml-2">{p.наемател}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Платен на <strong>{p.дата}</strong> — {p.сума.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                            <span className="text-gray-400 ml-1">(очакван {fmt(p.expected)} €)</span>
                          </div>
                        </div>
                        <button onClick={() => acceptPrepaid(p)}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap">
                          ✅ Маркирай платил
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unassigned */}
              {diag.unassigned.length > 0 && (
                <div className="bg-white border border-yellow-300 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-300 text-sm font-semibold text-yellow-800">
                    ❓ Неприсвоени — {diag.unassigned.length} наемни транзакции без имот
                  </div>
                  <div className="divide-y divide-gray-100 text-sm">
                    {diag.unassigned.map(t => (
                      <div key={t.id} className="px-3 py-2 text-xs">
                        <span className="text-gray-500">{t.дата}</span>{' '}
                        <strong className="text-gray-700">{t.сума.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €</strong>
                        {' — '}<strong className="text-gray-800">{t.контрагент}</strong>
                        <div className="text-gray-500 truncate">{t.основание}</div>
                      </div>
                    ))}
                    <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
                      💡 Открий ги в Tab Импорт и им присвой имот.
                    </div>
                  </div>
                </div>
              )}

              {/* Miscategorized */}
              {diag.miscategorized.length > 0 && (
                <div className="bg-white border border-orange-300 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-orange-50 border-b border-orange-300 text-sm font-semibold text-orange-800">
                    🔀 Възможно сбъркана категория — {diag.miscategorized.length} тx от контрагент който прилича на наемател
                  </div>
                  <div className="divide-y divide-gray-100 text-sm">
                    {diag.miscategorized.map(t => (
                      <div key={t.tx_id} className="px-3 py-2 text-xs">
                        <span className="text-gray-500">{t.дата}</span>{' '}
                        <strong className="text-gray-700">{t.сума.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €</strong>
                        {' — '}<strong className="text-gray-800">{t.контрагент}</strong>
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t.категория}</span>
                        <div className="text-gray-500 truncate">{t.основание}</div>
                        <div className="text-blue-600 mt-0.5">→ Препоръка: имот <strong>{t.suggest_адрес}</strong> (промени категорията на "наем" в Tab Импорт)</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {unpaid.length > 0 && (
        <div className="mb-6">
          <h3 className="text-base font-bold text-red-700 mb-3 flex items-center gap-2">
            ❌ Не са платили ({unpaid.length})
          </h3>
          <TenantTable rows={unpaid} {...tableProps} />
        </div>
      )}

      {paid.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
            ✅ Платили ({paid.length})
          </h3>
          <TenantTable rows={paid} {...tableProps} />
        </div>
      )}

      {props.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🏠</div>
          <div>Няма активни имоти с наематели.</div>
        </div>
      )}
      </>)}
    </div>
  )
}

function TenantTable({
  rows,
  onEdit, onReminder, onSms,
  editingContact, contactForm, setContactForm, onSaveContact, onCancelContact, savingContact,
  markingPaid, markForm, setMarkForm, onOpenMarkPaid, onSaveMarkPaid, onCancelMarkPaid, savingMark,
  onUnmark,
}) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Имот', 'Наемател', 'Очакван (€)', 'Платено (€)', 'Начин', 'Email / Тел.', 'Действия'].map(h => (
              <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((prop, i) => (
            <React.Fragment key={prop.id}>
              <tr className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {/* Имот */}
                <td className="px-3 py-3 text-xs max-w-[160px]">
                  <div className="font-medium text-gray-800 truncate">{prop['адрес']}</div>
                  <div className="text-gray-400">{prop['район']}</div>
                </td>

                {/* Наемател */}
                <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{prop['наемател']}</td>

                {/* Очакван наем */}
                <td className="px-3 py-3 text-right font-medium text-blue-700 whitespace-nowrap">
                  {(prop['наем'] || 0).toLocaleString('bg-BG')} €
                </td>

                {/* Платено */}
                <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                  {prop.is_paid ? (
                    <div className="flex flex-col items-end">
                      <span className="text-green-700 font-bold">{(prop.paid_amount || 0).toLocaleString('bg-BG')} €</span>
                      {prop.tx_count >= 2 && (
                        <span
                          className="mt-0.5 text-[10px] text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full cursor-help"
                          title={
                            (prop.bank_txs || [])
                              .map(t => `${t.дата}: ${Number(t.сума).toLocaleString('bg-BG',{minimumFractionDigits:2})} €  (${t.контрагент})`)
                              .join('\n')
                          }>
                          ⚠ {prop.tx_count} плащания
                        </span>
                      )}
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>

                {/* Начин на плащане */}
                <td className="px-3 py-3 whitespace-nowrap">
                  {prop.manual_payment
                    ? <span className="inline-block bg-purple-50 text-purple-700 border border-purple-200 text-xs px-2 py-0.5 rounded-full">
                        {prop.manual_payment.payment_type === 'брой' ? '💵 В брой' : '🏦 Друга сметка'}
                      </span>
                    : prop.is_paid
                      ? <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded-full">🏛️ Банков импорт</span>
                      : <span className="inline-block bg-red-50 text-red-700 border border-red-200 text-xs px-2 py-0.5 rounded-full">❌ Не е платил</span>
                  }
                </td>

                {/* Email / Тел. */}
                <td className="px-3 py-3 text-xs max-w-[180px]">
                  {editingContact === prop.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="email@example.com"
                        className="border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="tel"
                        value={contactForm.телефон}
                        onChange={e => setContactForm(f => ({ ...f, телефон: e.target.value }))}
                        placeholder="+359..."
                        className="border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className={prop.email ? 'text-gray-700' : 'text-gray-300 italic'}>{prop.email || '—'}</div>
                      <div className={prop['телефон'] ? 'text-gray-700' : 'text-gray-300 italic'}>{prop['телефон'] || '—'}</div>
                    </div>
                  )}
                </td>

                {/* Действия */}
                <td className="px-3 py-3 min-w-[180px]">
                  {editingContact === prop.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => onSaveContact(prop.id)} disabled={savingContact}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                        {savingContact ? '...' : 'Запази'}
                      </button>
                      <button onClick={onCancelContact}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                        Отказ
                      </button>
                    </div>
                  ) : markingPaid === prop.id ? (
                    <div className="space-y-1 min-w-[200px]">
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={markForm.amount}
                          onChange={e => setMarkForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="Сума €"
                          className="w-20 border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                          min="0" step="0.01"
                        />
                        <select
                          value={markForm.payment_type}
                          onChange={e => setMarkForm(f => ({ ...f, payment_type: e.target.value }))}
                          className="border border-green-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value="брой">💵 В брой</option>
                          <option value="друга_сметка">🏦 Друга сметка</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={markForm.notes}
                        onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Бележка (по желание)"
                        className="w-full border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => onSaveMarkPaid(prop.id)} disabled={savingMark}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                          {savingMark ? '...' : '✅ Запази'}
                        </button>
                        <button onClick={onCancelMarkPaid}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                          Отказ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {/* Mark as paid (manual) — only for non-bank-paid */}
                      {!prop.is_paid && (
                        <button onClick={() => onOpenMarkPaid(prop)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 border border-green-300 text-green-700 rounded hover:bg-green-100 whitespace-nowrap font-medium">
                          ✅ Маркирай платил
                        </button>
                      )}
                      {/* Unmark manual payment */}
                      {prop.manual_payment && (
                        <button onClick={() => onUnmark(prop.id)}
                          title="Премахни ръчното маркиране"
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-50 border border-gray-300 text-gray-600 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 whitespace-nowrap">
                          ↩️ Отмени
                        </button>
                      )}
                      {/* Edit contact */}
                      <button onClick={() => onEdit(prop)}
                        title="Редактирай контакти"
                        className="p-1 text-gray-400 hover:text-blue-600 rounded">
                        ✏️
                      </button>
                      {/* Email reminder */}
                      {!prop.is_paid && prop.email && (
                        <button onClick={() => onReminder(prop)}
                          title="Изпрати напомняне по имейл"
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded hover:bg-orange-100 whitespace-nowrap">
                          📧
                        </button>
                      )}
                      {/* SMS reminder */}
                      {!prop.is_paid && prop['телефон'] && (
                        <button onClick={() => onSms(prop)}
                          title="Изпрати SMS напомняне"
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 whitespace-nowrap">
                          💬
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Year matrix ────────────────────────────────────────────────
const MONTH_SHORT = ['Яну','Фев','Мар','Апр','Май','Юни','Юли','Авг','Сеп','Окт','Ное','Дек']

function YearMatrix({ matrix, loading, onCellClick }) {
  if (loading)  return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (!matrix)  return <div className="py-12 text-center text-gray-400">Няма данни.</div>
  if (!matrix.properties.length) return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-400">
      <div className="text-3xl mb-2">🏠</div>
      <div>Няма активни имоти с наематели.</div>
    </div>
  )

  const cellClass = (c) => {
    if (c.is_future) return 'bg-gray-50 text-gray-300'
    if (c.is_paid) return c.manual ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
    return 'bg-red-50 text-red-700'
  }
  const cellIcon = (c) => {
    if (c.is_future) return '·'
    if (c.is_paid)   return c.manual ? '💵' : '✓'
    return '✗'
  }

  const { summary } = matrix
  const collectibilityPct = Math.round((summary.collectibility || 0) * 100)

  // Per-month totals across all properties
  const monthTotals = Array.from({ length: 12 }, (_, i) => {
    const ym = `${matrix.year}-${String(i + 1).padStart(2, '0')}`
    let paid = 0, unpaid = 0, isFuture = false
    matrix.properties.forEach(p => {
      const c = p.cells[i]
      if (c.is_future) { isFuture = true; return }
      if (c.is_paid) paid++; else unpaid++
    })
    return { ym, paid, unpaid, isFuture }
  })

  return (
    <div>
      {/* Year summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Очакван за {matrix.year}</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{summary.totalExpected.toLocaleString('bg-BG', { maximumFractionDigits: 0 })} €</div>
          <div className="text-xs text-gray-500">до момента</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Събрано</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{summary.totalCollected.toLocaleString('bg-BG', { maximumFractionDigits: 0 })} €</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Неплатени месеци</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{summary.totalUnpaidCells}</div>
          <div className="text-xs text-gray-500">общо имот×месец</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Събираемост</div>
          <div className="text-2xl font-bold text-gray-700 mt-1">{collectibilityPct}%</div>
          <div className="text-xs text-gray-500">{matrix.year}</div>
        </div>
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider z-10 border-r">Имот / Наемател</th>
              {MONTH_SHORT.map((m, i) => (
                <th key={m} className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider ${matrix.currentMonth === `${matrix.year}-${String(i + 1).padStart(2, '0')}` ? 'text-blue-700 bg-blue-50' : 'text-gray-500'}`}>
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Платено / Очакван</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrix.properties.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="sticky left-0 px-3 py-2 border-r text-xs max-w-[200px]"
                  style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <div className="font-medium text-gray-800 truncate">{p.адрес}</div>
                  <div className="text-gray-400 truncate">{p.наемател}</div>
                  <div className="text-blue-600 mt-0.5">{fmt(p.наем)} €/мес</div>
                </td>
                {p.cells.map((c) => (
                  <td key={c.месец} className="px-1 py-1 text-center">
                    <button
                      onClick={() => !c.is_future && onCellClick(c.месец)}
                      disabled={c.is_future}
                      title={
                        c.is_future ? 'Бъдещ месец'
                        : c.is_paid
                          ? `${c.месец}: ${c.paid_amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €${c.tx_count > 1 ? ` (${c.tx_count} тx)` : ''}${c.manual ? ' [ръчно]' : ''}`
                          : `${c.месец}: НЕПЛАТЕН (очакван ${fmt(p.наем)} €)`
                      }
                      className={`w-8 h-7 rounded text-xs font-bold ${cellClass(c)} ${c.is_future ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-blue-400'} ${c.tx_count > 1 ? 'ring-1 ring-amber-400' : ''}`}>
                      {cellIcon(c)}
                    </button>
                  </td>
                ))}
                <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                  <div className="font-bold text-green-700">{p.collected.toLocaleString('bg-BG', { maximumFractionDigits: 0 })} €</div>
                  <div className="text-gray-500">от {p.expected.toLocaleString('bg-BG', { maximumFractionDigits: 0 })} €</div>
                  {p.unpaid_months > 0 && (
                    <div className="text-red-600 mt-0.5">⚠ {p.unpaid_months} неплат.</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td className="sticky left-0 bg-gray-50 px-3 py-2 border-r text-xs font-bold text-gray-600 uppercase tracking-wider">Общо по месец</td>
              {monthTotals.map(m => (
                <td key={m.ym} className="px-1 py-2 text-center text-xs">
                  {m.isFuture ? <span className="text-gray-300">—</span> : (
                    <div>
                      <div className="text-green-700 font-bold">{m.paid}</div>
                      {m.unpaid > 0 && <div className="text-red-600">−{m.unpaid}</div>}
                    </div>
                  )}
                </td>
              ))}
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-5 h-5 bg-green-100 text-green-700 rounded text-center font-bold">✓</span> Платил (банков превод)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-5 h-5 bg-purple-100 text-purple-700 rounded text-center">💵</span> Ръчно маркиран (брой / друга сметка)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-5 h-5 bg-red-50 text-red-700 rounded text-center font-bold">✗</span> Неплатен</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-5 h-5 bg-green-100 ring-1 ring-amber-400 rounded text-center text-green-700 font-bold">✓</span> ≥2 транзакции (възможен дубликат)</span>
        <span className="ml-auto text-gray-400">💡 Кликни клетка → отвори месеца за детайл</span>
      </div>
    </div>
  )
}
