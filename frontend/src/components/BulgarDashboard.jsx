// Bulgar Capital — позиция (главница + годишна доходност) с тримесечни
// дивиденти. Главна метрика: главница / текуща стойност / дивиденти YTD /
// следващ очакван дивидент. Retro-импорт от bank transactions по keyword.

import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'

const fmt = (n, d=2) => Number(n||0).toLocaleString('bg-BG', { minimumFractionDigits:d, maximumFractionDigits:d })
const fmt0 = n => Number(n||0).toLocaleString('bg-BG', { minimumFractionDigits:0, maximumFractionDigits:0 })

export default function BulgarDashboard({ API }) {
  const [summary, setSummary]       = useState(null)
  const [positions, setPositions]   = useState([])
  const [txByPos, setTxByPos]       = useState({})
  const [showPos, setShowPos]       = useState(false)
  const [editing, setEditing]       = useState(null)
  const [showTx, setShowTx]         = useState(null) // {position_id}
  const [showRetro, setShowRetro]   = useState(null)

  const load = useCallback(() => {
    apiFetch(`${API}/api/investments/bulgar/summary`).then(r => r.json()).then(setSummary).catch(() => {})
    apiFetch(`${API}/api/investments/bulgar/positions`).then(r => r.json()).then(p => {
      setPositions(p || [])
      // Load transactions for each position
      Promise.all((p || []).map(pos =>
        apiFetch(`${API}/api/investments/bulgar/transactions?position_id=${pos.id}`)
          .then(r => r.json())
          .then(txs => [pos.id, txs])
      )).then(pairs => setTxByPos(Object.fromEntries(pairs)))
    }).catch(() => {})
  }, [API])

  useEffect(() => { load() }, [load])

  const removePos = (id) => {
    if (!confirm('Изтрий позицията и всичките ѝ транзакции?')) return
    apiFetch(`${API}/api/investments/bulgar/positions/${id}`, { method: 'DELETE' })
      .then(() => load())
  }
  const removeTx = (id) => {
    if (!confirm('Изтрий транзакцията?')) return
    apiFetch(`${API}/api/investments/bulgar/transactions/${id}`, { method: 'DELETE' })
      .then(() => load())
  }

  const s = summary || {}

  return (
    <div className="space-y-4">
      {/* Header + add button */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {s.позиции || 0} активни позиции · YTD дивиденти: <b className="text-emerald-700">{fmt(s.дивиденти_ytd_eur || 0)} EUR</b> ({s.дивиденти_ytd_брой || 0})
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(null); setShowPos(true) }}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium">
            + Нова позиция
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Главница" value={s.главница_eur} suffix=" EUR" color="text-gray-800"/>
        <Kpi label="Натрупана лихва" value={s.натрупана_лихва_eur} suffix=" EUR" color="text-emerald-700"/>
        <Kpi label="Текуща стойност" value={s.текуща_стойност_eur} suffix=" EUR" color="text-purple-700"/>
        <Kpi label="Получени дивиденти" value={s.дивиденти_общо_eur} suffix=" EUR" color="text-blue-700"/>
      </div>

      {/* Positions list */}
      {!positions.length && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Няма позиции. Кликни <b>+ Нова позиция</b> и въведи влог + годишна доходност.
        </div>
      )}

      {positions.map(pos => (
        <div key={pos.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{pos.име}</h3>
              <div className="text-xs text-gray-500 mt-0.5">
                Влог {pos.дата_влог} · {fmt0(pos.главница_orig)} {pos.валута_orig}
                {pos.валута_orig === 'BGN' && ` (~${fmt0(pos.главница_eur)} EUR)`}
                {pos.лихва_pct != null && ` · ${pos.лихва_pct}% годишно`}
                {` · период ${pos.период_месеци || 3} мес`}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTx({ position_id: pos.id, position_name: pos.име })}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium">
                + Дивидент
              </button>
              <button onClick={() => setShowRetro(pos)}
                      className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                ⚡ Импорт от банка
              </button>
              <button onClick={() => { setEditing(pos); setShowPos(true) }}
                      className="px-3 py-1 text-gray-500 hover:text-gray-800 text-xs">✎</button>
              <button onClick={() => removePos(pos.id)}
                      className="px-3 py-1 text-gray-300 hover:text-rose-600 text-sm">✕</button>
            </div>
          </div>

          {/* Position KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-3">
            <Stat label="Главница" value={`${fmt(pos.главница_текуща_eur)} EUR`}/>
            <Stat label="Натрупана лихва" value={`${fmt(pos.натрупана_лихва_eur)} EUR`} color="text-emerald-700"/>
            <Stat label="Стойност днес" value={`${fmt(pos.текуща_стойност_eur)} EUR`} color="text-purple-700" bold/>
            <Stat label="Очакван дивидент" value={pos.очакван_дивидент_eur != null ? `${fmt(pos.очакван_дивидент_eur)} EUR` : '—'}/>
            <Stat label="Следващ" value={pos.следващ_дивидент_дата || '—'}/>
          </div>

          {/* Transaction list */}
          {(txByPos[pos.id] || []).length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">Транзакции</div>
              <table className="w-full text-sm">
                <tbody>
                  {(txByPos[pos.id] || []).map(t => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 text-gray-600 text-xs">{t.дата}</td>
                      <td className="py-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          t.тип === 'дивидент' ? 'bg-emerald-50 text-emerald-700' :
                          t.тип === 'влог'     ? 'bg-blue-50 text-blue-700' :
                          t.тип === 'теглене'  ? 'bg-amber-50 text-amber-700' :
                                                  'bg-gray-50 text-gray-600'}`}>
                          {t.тип}
                        </span>
                      </td>
                      <td className={`py-1.5 text-right font-medium ${t.тип === 'дивидент' ? 'text-emerald-700' : t.тип === 'теглене' ? 'text-rose-700' : 'text-gray-800'}`}>
                        {t.тип === 'теглене' ? '−' : t.тип === 'дивидент' ? '+' : ''}{fmt(t.сума)} {t.валута}
                      </td>
                      <td className="py-1.5 text-gray-500 text-xs max-w-[300px] truncate pl-3" title={t.бележка}>
                        {t.бележка}
                        {t.bank_tx_id && <span className="ml-1 text-blue-500" title="От банка">⚡</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => removeTx(t.id)} className="text-gray-300 hover:text-rose-600">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {showPos && (
        <PositionForm API={API} initial={editing}
                      onClose={() => { setShowPos(false); setEditing(null) }}
                      onSaved={() => { setShowPos(false); setEditing(null); load() }}/>
      )}
      {showTx && (
        <TxForm API={API} positionId={showTx.position_id} positionName={showTx.position_name}
                onClose={() => setShowTx(null)}
                onSaved={() => { setShowTx(null); load() }}/>
      )}
      {showRetro && (
        <RetroImport API={API} position={showRetro}
                     onClose={() => setShowRetro(null)}
                     onDone={() => { setShowRetro(null); load() }}/>
      )}
    </div>
  )
}

function Kpi({ label, value, suffix = '', color = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-xs font-bold text-gray-500 uppercase mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{fmt0(value)}{suffix}</div>
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-700', bold = false }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-400 uppercase">{label}</div>
      <div className={`${bold ? 'font-bold' : 'font-medium'} ${color}`}>{value}</div>
    </div>
  )
}

function PositionForm({ API, initial, onClose, onSaved }) {
  const isEdit = !!initial
  const [form, setForm] = useState(initial ? {
    име: initial.име || '',
    дата_влог: initial.дата_влог || '',
    главница_orig: initial.главница_orig || '',
    валута_orig: initial.валута_orig || 'BGN',
    лихва_pct: initial.лихва_pct ?? '',
    период_месеци: initial.период_месеци || 3,
    бележка: initial.бележка || '',
  } : {
    име: 'Дялов влог Bulgar Capital',
    дата_влог: new Date().toISOString().slice(0,10),
    главница_orig: '10000',
    валута_orig: 'BGN',
    лихва_pct: '',
    период_месеци: 3,
    бележка: '',
  })

  const submit = () => {
    if (!form.име || !form.дата_влог || !form.главница_orig) return
    const url  = isEdit ? `${API}/api/investments/bulgar/positions/${initial.id}` : `${API}/api/investments/bulgar/positions`
    const method = isEdit ? 'PUT' : 'POST'
    apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        главница_orig: Number(form.главница_orig),
        лихва_pct: form.лихва_pct === '' ? null : Number(form.лихва_pct),
        период_месеци: Number(form.период_месеци),
      }),
    }).then(r => r.json()).then(() => onSaved())
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {isEdit ? '✎ Редактирай позиция' : '+ Нова Bulgar Capital позиция'}
        </h3>
        <div className="space-y-3">
          <Field label="Име">
            <input type="text" value={form.име} onChange={e => setForm(f => ({...f, име: e.target.value}))}
                   className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus/>
          </Field>
          <Field label="Дата на влог">
            <input type="date" value={form.дата_влог} onChange={e => setForm(f => ({...f, дата_влог: e.target.value}))}
                   className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="Главница">
                <input type="number" step="0.01" value={form.главница_orig}
                       onChange={e => setForm(f => ({...f, главница_orig: e.target.value}))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
            </div>
            <Field label="Валута">
              <select value={form.валута_orig} onChange={e => setForm(f => ({...f, валута_orig: e.target.value}))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                <option>BGN</option>
                <option>EUR</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Годишна доходност (%)">
              <input type="number" step="0.01" placeholder="напр. 6.5" value={form.лихва_pct}
                     onChange={e => setForm(f => ({...f, лихва_pct: e.target.value}))}
                     className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
            </Field>
            <Field label="Период дивиденти (месеци)">
              <select value={form.период_месеци} onChange={e => setForm(f => ({...f, период_месеци: e.target.value}))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                <option value={1}>1 — месечно</option>
                <option value={3}>3 — тримесечно</option>
                <option value={6}>6 — полугодишно</option>
                <option value={12}>12 — годишно</option>
              </select>
            </Field>
          </div>
          <Field label="Бележка">
            <input type="text" value={form.бележка} onChange={e => setForm(f => ({...f, бележка: e.target.value}))}
                   className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </Field>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
          <button onClick={submit} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium">
            Запази
          </button>
        </div>
      </div>
    </div>
  )
}

function TxForm({ API, positionId, positionName, onClose, onSaved }) {
  const [form, setForm] = useState({
    position_id: positionId,
    дата: new Date().toISOString().slice(0,10),
    тип: 'дивидент',
    сума: '',
    валута: 'EUR',
    бележка: '',
  })
  const submit = () => {
    if (!form.сума) return
    apiFetch(`${API}/api/investments/bulgar/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, сума: Number(form.сума) }),
    }).then(r => r.json()).then(() => onSaved())
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">+ Транзакция за {positionName}</h3>
        <div className="space-y-3">
          <Field label="Дата">
            <input type="date" value={form.дата} onChange={e => setForm(f => ({...f, дата: e.target.value}))}
                   className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </Field>
          <Field label="Тип">
            <select value={form.тип} onChange={e => setForm(f => ({...f, тип: e.target.value}))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
              <option value="дивидент">Дивидент (приход)</option>
              <option value="влог">Влог (допълнителен)</option>
              <option value="теглене">Теглене</option>
              <option value="такса">Такса</option>
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="Сума">
                <input type="number" step="0.01" value={form.сума}
                       onChange={e => setForm(f => ({...f, сума: e.target.value}))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus/>
              </Field>
            </div>
            <Field label="Валута">
              <select value={form.валута} onChange={e => setForm(f => ({...f, валута: e.target.value}))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                <option>EUR</option>
                <option>BGN</option>
              </select>
            </Field>
          </div>
          <Field label="Бележка">
            <input type="text" value={form.бележка} onChange={e => setForm(f => ({...f, бележка: e.target.value}))}
                   className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
          </Field>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
          <button onClick={submit} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium">
            Запази
          </button>
        </div>
      </div>
    </div>
  )
}

function RetroImport({ API, position, onClose, onDone }) {
  const [keyword, setKeyword] = useState('болгар')
  const [preview, setPreview] = useState(null)
  const [running, setRunning] = useState(false)

  const doPreview = () => {
    setRunning(true)
    apiFetch(`${API}/api/investments/bulgar/retro-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_id: position.id, keyword, само_преглед: true }),
    }).then(r => r.json()).then(d => { setPreview(d); setRunning(false) })
  }

  const doImport = () => {
    setRunning(true)
    apiFetch(`${API}/api/investments/bulgar/retro-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_id: position.id, keyword }),
    }).then(r => r.json()).then(d => {
      alert(`Импортирани: ${d.created} от ${d.found} съвпадения`)
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 max-w-xl w-full m-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">⚡ Импорт дивиденти от банка</h3>
        <p className="text-sm text-gray-600 mb-3">
          Сканира всичките ти Кт банкови транзакции и създава дивидент за всеки, който съдържа keyword-а в контрагент или основание.
        </p>
        <Field label="Keyword за търсене">
          <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                 className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
        </Field>
        <div className="flex gap-2 mt-3">
          <button onClick={doPreview} disabled={running}
                  className="px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-sm font-medium">
            Преглед
          </button>
        </div>
        {preview && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-sm font-bold mb-2">Намерени {preview.candidates} съвпадения</div>
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded">
              <table className="w-full text-xs">
                <tbody>
                  {(preview.items || []).slice(0, 30).map(t => (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="px-2 py-1 text-gray-500">{t.дата}</td>
                      <td className="px-2 py-1 text-right text-emerald-700 font-medium">+{fmt(t.сума)} {t.currency}</td>
                      <td className="px-2 py-1 text-gray-600 truncate max-w-[260px]" title={t.основание}>
                        {t.контрагент || t.основание?.slice(0,60)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
          {preview && preview.candidates > 0 && (
            <button onClick={doImport} disabled={running}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium">
              Импорт {preview.candidates}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
      {children}
    </div>
  )
}
