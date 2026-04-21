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

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(() => {
    setLoading(true)
    fetch(`${API}/api/properties/rent-status?month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [API, month])

  useEffect(() => { load() }, [load])

  const openContact = (prop) => {
    setEditingContact(prop.id)
    setMarkingPaid(null)
    setContactForm({ email: prop.email || '', телефон: prop['телефон'] || '' })
  }

  const saveContact = (propId) => {
    setSavingContact(true)
    fetch(`${API}/api/properties/${propId}`, {
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
    fetch(`${API}/api/properties/${propId}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, ...markForm, amount: Number(markForm.amount) || 0 }),
    })
      .then(r => r.json())
      .then(() => { setSavingMark(false); setMarkingPaid(null); load(); showToast('Плащането е записано') })
      .catch(e => { setSavingMark(false); showToast('Грешка: ' + e.message, 'error') })
  }

  const unmarkPaid = (propId) => {
    fetch(`${API}/api/properties/${propId}/mark-paid?month=${month}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(() => { load(); showToast('Плащането е премахнато') })
      .catch(e => showToast('Грешка: ' + e.message, 'error'))
  }

  const sendReminder = (prop) => {
    fetch(`${API}/api/email/reminder`, {
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
    fetch(`${API}/api/email/reminder-bulk`, {
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

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

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
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">Месец:</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={sendReminderAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg">
            📧 Изпрати напомняния до всички
          </button>
        </div>
      </div>

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
                  {prop.is_paid
                    ? <span className="text-green-700 font-bold">{(prop.paid_amount || 0).toLocaleString('bg-BG')} €</span>
                    : <span className="text-gray-300">—</span>
                  }
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
