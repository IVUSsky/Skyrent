import { apiFetch } from '../api'
import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CATEGORY_STYLES = {
  'наем':              'bg-green-100 text-green-800 border-green-200',
  'вноска':            'bg-orange-100 text-orange-800 border-orange-200',
  'разход':            'bg-red-100 text-red-800 border-red-200',
  'разход_друг':       'bg-red-50 text-red-700 border-red-100',
  'нап_ддс':           'bg-purple-100 text-purple-800 border-purple-200',
  'equity_inject':     'bg-blue-100 text-blue-800 border-blue-200',
  'приход_друг':       'bg-gray-100 text-gray-700 border-gray-200',
  'друго':             'bg-gray-50 text-gray-500 border-gray-100',
  'депозит_получен':   'bg-teal-100 text-teal-800 border-teal-200',
  'депозит_върнат':    'bg-teal-50 text-teal-700 border-teal-200',
  'депозит_задържан':  'bg-amber-100 text-amber-800 border-amber-200',
  // Лични (scope=personal). При избор → auto scope+personal_income.
  'заплата':           'bg-emerald-100 text-emerald-800 border-emerald-200',
  'управление':        'bg-indigo-100 text-indigo-800 border-indigo-200',
  'друго_лично':       'bg-pink-50 text-pink-700 border-pink-200',
}
const ALL_CATS = ['наем','вноска','разход','разход_друг','нап_ддс','equity_inject','приход_друг','депозит_получен','депозит_върнат','депозит_задържан','заплата','управление','друго_лично','друго']

const fmt  = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmt0 = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:0, maximumFractionDigits:0 })
const fmtMonth = m => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return ['Яну','Фев','Мар','Апр','Май','Юни','Юли','Авг','Сеп','Окт','Ное','Дек'][parseInt(mo)-1] + ' ' + y.slice(2)
}

// ── Deposits Tab ───────────────────────────────────────────────
function DepositsTab({ API, properties }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const [retaining, setRetaining] = useState(null)

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/import/deposits`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [API])

  const assignProperty = (txId, propertyId) => {
    apiFetch(`${API}/api/import/transactions/${txId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId }),
    }).then(load)
  }

  const retainDeposit = (txId) => {
    setRetaining(txId)
    apiFetch(`${API}/api/import/transactions/${txId}/retain-deposit`, { method: 'POST' })
      .then(() => { setRetaining(null); load() })
      .catch(() => setRetaining(null))
  }

  const fmtEur = n => (n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return <div className="py-12 text-center text-gray-400">Зарежда...</div>
  if (!data)   return <div className="py-12 text-center text-gray-400">Грешка при зареждане.</div>

  const totalReceived = data.summary.reduce((s, r) => s + (r.получени  || 0), 0)
  const totalReturned = data.summary.reduce((s, r) => s + (r.върнати   || 0), 0)
  const totalRetained = data.summary.reduce((s, r) => s + (r.задържани || 0), 0)
  const totalHeld     = totalReceived - totalReturned - totalRetained

  const curYear       = new Date().getFullYear().toString()
  const retainedYTD   = (data.retainedByMonth || [])
    .filter(r => r.месец?.startsWith(curYear))
    .reduce((s, r) => s + (r.сума || 0), 0)

  return (
    <div className="space-y-5 fin-surface">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800">
        <strong>Депозити</strong> — гаранции от наематели. Не са приход/разход докато не бъдат задържани.
        При нарушение на договора натиснете <strong>"🔒 Задържи"</strong> — сумата се добавя към приходите.
        Засичат се автоматично по: <em>депозит, deposit, гаранция</em>.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-teal-200 bg-teal-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase">Държани в момента</div>
          <div className="text-2xl font-bold text-teal-700 mt-1">{fmtEur(totalHeld)} €</div>
          <div className="text-xs text-gray-400 mt-0.5">получени − върнати − задържани</div>
        </div>
        <div className="border border-green-200 bg-green-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase">Получени (общо)</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{fmtEur(totalReceived)} €</div>
        </div>
        <div className="border border-orange-200 bg-orange-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase">Върнати (общо)</div>
          <div className="text-2xl font-bold text-orange-700 mt-1">{fmtEur(totalReturned)} €</div>
        </div>
        <div className="border border-red-200 bg-red-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase">Задържани → Приход</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{fmtEur(totalRetained)} €</div>
          <div className="text-xs text-gray-400 mt-0.5">{curYear}г.: {fmtEur(retainedYTD)} €</div>
        </div>
      </div>

      {/* Retained by month */}
      {data.retainedByMonth?.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b bg-red-50">
            <h3 className="font-semibold text-red-700 text-sm">💰 Задържани депозити (приход) — по месец</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Месец</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Сума</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.retainedByMonth.map(r => (
                <tr key={r.месец} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.месец}</td>
                  <td className="px-4 py-2 text-right font-bold text-red-700">+{fmtEur(r.сума)} €</td>
                </tr>
              ))}
              <tr className="bg-red-50 font-bold border-t-2 border-red-200">
                <td className="px-4 py-2 text-gray-700">Общо</td>
                <td className="px-4 py-2 text-right text-red-700">+{fmtEur(totalRetained)} €</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Per property */}
      {data.summary.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-700 text-sm">По имот</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Имот</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Наемател</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Получени</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Върнати</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Задържани</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Салдо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.summary.map((r, i) => {
                const салдо = (r.получени || 0) - (r.върнати || 0) - (r.задържани || 0)
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{r['адрес'] || `Имот #${r.property_id}`}</td>
                    <td className="px-4 py-2 text-gray-500">{r.наемател || '—'}</td>
                    <td className="px-4 py-2 text-right text-green-700">{fmtEur(r.получени)} €</td>
                    <td className="px-4 py-2 text-right text-orange-600">{fmtEur(r.върнати)} €</td>
                    <td className="px-4 py-2 text-right text-red-600 font-medium">{fmtEur(r.задържани)} €</td>
                    <td className={`px-4 py-2 text-right font-bold ${салдо > 0 ? 'text-teal-700' : салдо < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {fmtEur(салдо)} €
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unlinked deposits */}
      {data.unlinked?.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-800 text-sm mb-3">⚠ Депозити без свързан имот ({data.unlinked.length})</h3>
          <div className="space-y-2">
            {data.unlinked.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 w-24 flex-shrink-0">{tx.дата}</span>
                <span className="text-sm flex-1 min-w-[150px]">{tx.контрагент}</span>
                <span className={`text-xs px-2 py-0.5 rounded border ${CATEGORY_STYLES[tx.категория]||''}`}>{tx.категория}</span>
                <span className="font-semibold text-sm">{fmtEur(tx.сума)} {tx.currency}</span>
                <select onChange={e => e.target.value && assignProperty(tx.id, e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" defaultValue="">
                  <option value="">— свържи с имот —</option>
                  {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All deposit transactions with Retain button */}
      {data.details?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <button onClick={() => setShowDetails(v => !v)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <span className="font-semibold text-gray-700 text-sm">Всички депозитни транзакции ({data.details.length})</span>
            <span className="text-gray-400 text-sm">{showDetails ? '▲' : '▼'}</span>
          </button>
          {showDetails && (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Дата</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Контрагент</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Имот</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Тип</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Сума</th>
                  <th className="px-4 py-2 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.details.map(tx => (
                  <tr key={tx.id} className={`hover:bg-gray-50 ${tx.категория === 'депозит_задържан' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{tx.дата}</td>
                    <td className="px-4 py-2 text-gray-700 truncate max-w-[180px]">{tx.контрагент}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{tx['адрес'] || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded border ${CATEGORY_STYLES[tx.категория]||''}`}>{tx.категория}</span>
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${
                      tx.категория === 'депозит_получен'  ? 'text-green-700' :
                      tx.категория === 'депозит_задържан' ? 'text-red-700'   : 'text-orange-600'}`}>
                      {tx.категория === 'депозит_получен' ? '+' : '−'}{fmtEur(tx.сума)} {tx.currency}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {tx.категория === 'депозит_получен' && (
                        <button onClick={() => retainDeposit(tx.id)} disabled={retaining === tx.id}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded font-semibold disabled:opacity-50"
                          title="Задържи — при нарушение на договора, става приход">
                          {retaining === tx.id ? '...' : '🔒 Задържи'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!data.summary.length && !data.unlinked?.length && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💰</div>
          <div>Няма депозитни транзакции. Засичат се автоматично по: <em>депозит, deposit, гаранция</em>.</div>
        </div>
      )}
    </div>
  )
}

// ── Rules Tab ─────────────────────────────────────────────────
function RulesTab({ API, properties }) {
  const [rules, setRules]   = useState([])
  const [form, setForm]     = useState({ pattern: '', категория: 'разход', property_id: '' })
  const [saving, setSaving] = useState(false)

  const load = () => apiFetch(`${API}/api/import/rules`).then(r => r.json()).then(setRules).catch(() => {})
  useEffect(() => { load() }, [API])

  const add = () => {
    if (!form.pattern || !form.категория) return
    setSaving(true)
    apiFetch(`${API}/api/import/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: form.pattern.trim(), категория: form.категория, property_id: form.property_id || null }),
    }).then(() => { setSaving(false); setForm({ pattern:'', категория:'разход', property_id:'' }); load() })
      .catch(() => setSaving(false))
  }

  const del = id => apiFetch(`${API}/api/import/rules/${id}`, { method: 'DELETE' }).then(load)

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Как работят правилата:</strong> Когато виждате транзакция от контрагент,
        когото системата не разпознава правилно, добавете правило. При следващ импорт тези
        транзакции ще бъдат автоматично категоризирани и ще се появят за валидация.
      </div>

      {/* Add rule form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Ново правило</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ключова дума (контрагент)</label>
            <input type="text" value={form.pattern}
              onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
              placeholder="напр. ЧЕЗ, Виваком, Топлофикация..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Категория</label>
            <select value={form.категория} onChange={e => setForm(f => ({ ...f, категория: e.target.value }))}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none">
              {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Имот (по избор)</label>
            <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none w-48">
              <option value="">— без имот —</option>
              {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
            </select>
          </div>
          <button onClick={add} disabled={saving || !form.pattern}
            className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">
            + Добави
          </button>
        </div>
      </div>

      {/* Rules list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Запазени правила ({rules.length})</h3>
        </div>
        {rules.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            Няма правила. Добавете ключова дума за автоматично разпознаване.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Ключова дума','Категория','Имот','Добавено',''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rules.map(r => {
                const prop = properties.find(p => p.id === r.property_id)
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono font-medium text-blue-800">{r.pattern}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_STYLES[r.категория] || ''}`}>
                        {r.категория}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{prop ? `#${prop.id} ${prop['адрес']}` : '—'}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{r.created_at?.slice(0,10) || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => del(r.id)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Validation Banner ─────────────────────────────────────────
function ValidationBanner({ API, onDone }) {
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [open, setOpen] = useState(false)

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/import/pending`).then(r => r.json())
      .then(d => { setPending(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [API])

  if (loading || !pending || pending.count === 0) return null

  const validateAll = () => {
    const ids = pending.rows.map(r => r.id)
    setValidating(true)
    apiFetch(`${API}/api/import/transactions/validate-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(() => { setValidating(false); load(); onDone && onDone() })
      .catch(() => setValidating(false))
  }

  const validateOne = id => {
    apiFetch(`${API}/api/import/transactions/${id}/validate`, { method: 'PATCH' })
      .then(load)
  }

  return (
    <div className="mb-5 border border-amber-300 bg-amber-50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-amber-100 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-lg">⚡</span>
          <span className="font-semibold text-amber-800">
            {pending.count} транзакции са автоматично категоризирани и чакат валидация
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={e => { e.stopPropagation(); validateAll() }}
            disabled={validating}
            className="px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
            {validating ? 'Потвърждава...' : '✓ Потвърди всички'}
          </button>
          <span className="text-amber-600 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded border border-amber-200 bg-white">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Дата','Контрагент','Основание','Сума','Категория (авто)','Правило',''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pending.rows.map(tx => (
                  <tr key={tx.id} className="bg-amber-50/40 hover:bg-amber-50">
                    <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">{tx.дата}</td>
                    <td className="px-3 py-1.5 text-xs font-medium max-w-[150px] truncate" title={tx.контрагент}>{tx.контрагент}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500 max-w-[180px] truncate" title={tx.основание}>{tx.основание}</td>
                    <td className={`px-3 py-1.5 text-xs text-right font-medium whitespace-nowrap ${tx.operation==='Кт'?'text-green-700':'text-red-700'}`}>
                      {tx.operation==='Кт'?'+':'-'}{fmt(tx.сума)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${CATEGORY_STYLES[tx.категория]||''}`}>{tx.категория}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-blue-600 font-mono">{tx.rule_pattern || '—'}</td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => validateOne(tx.id)}
                        className="text-xs px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-800 rounded font-medium">
                        ✓ OK
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Transactions Tab ──────────────────────────────────────────
function TransactionsTab({ API, properties, onRuleCreated }) {
  const [rows, setRows]     = useState([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [месец, setМесец]   = useState('')
  const [кат, setКат]       = useState('all')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [toast, setToast] = useState(null) // { msg }
  const LIMIT = 200

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ limit: LIMIT, offset })
    if (месец) p.set('месец', месец)
    if (кат !== 'all') p.set('категория', кат)
    if (search) p.set('search', search)
    apiFetch(`${API}/api/import/transactions?${p}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows||[]); setTotal(d.total||0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [API, месец, кат, search, offset])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const updateCategory = (tx, newCat) => {
    apiFetch(`${API}/api/import/transactions/${tx.id}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ категория: newCat }),
    }).then(r => r.json()).then(res => {
      setRows(prev => prev.map(r => r.id === tx.id ? { ...r, категория: newCat, validated: 1 } : r))
      if (res.affected > 0) {
        showToast(`Правилото е запазено — още ${res.affected} транзакции от "${tx.контрагент}" актуализирани автоматично.`)
        load() // reload to reflect updated rows
      } else if (res.rule_saved) {
        showToast(`Правилото за "${tx.контрагент}" е запазено.`)
      }
    })
  }

  const totalIncome  = rows.filter(r => r.operation==='Кт').reduce((s,r) => s+(r.сума||0), 0)
  const totalExpense = rows.filter(r => r.operation==='Дт').reduce((s,r) => s+(r.сума||0), 0)

  return (
    <div className="space-y-4">
      {/* Auto-learn toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-700 text-white text-sm px-5 py-3 rounded-xl shadow-xl max-w-sm">
          {toast}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Месец</label>
            <input type="month" value={месец} onChange={e => { setМесец(e.target.value); setOffset(0) }}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Търси</label>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }}
              placeholder="Контрагент / основание..."
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-56"/>
          </div>
          {(месец || кат !== 'all' || search) && (
            <button onClick={() => { setМесец(''); setКат('all'); setSearch(''); setOffset(0) }}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 border border-gray-200 rounded">
              × Изчисти
            </button>
          )}
          <div className="ml-auto text-sm text-gray-500">
            {loading ? 'Зарежда...' : `${total} транзакции`}
            {total > 0 && (
              <span className="ml-2">
                <span className="text-green-700 font-medium">+{fmt(totalIncome)}</span>
                {' / '}
                <span className="text-red-700 font-medium">-{fmt(totalExpense)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {['all', ...ALL_CATS].map(cat => (
            <button key={cat} onClick={() => { setКат(cat); setOffset(0) }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                кат === cat ? 'bg-blue-600 text-white border-blue-600' : `${CATEGORY_STYLES[cat]||'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80`
              }`}>
              {cat === 'all' ? 'Всички' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-360px)] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['Дата','Контрагент','Основание','Сума','Оп.','Категория','★'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap last:text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(tx => (
                <tr key={tx.id} className={`hover:bg-gray-50 ${tx.validated===0 ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{tx.дата}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate text-xs" title={tx.контрагент}>{tx.контрагент}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[220px] truncate text-xs" title={tx.основание}>{tx.основание}</td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap text-xs ${tx.operation==='Кт'?'text-green-700':'text-red-700'}`}>
                    {tx.operation==='Кт'?'+':'-'}{fmt(tx.сума)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${tx.operation==='Кт'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                      {tx.operation}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select value={tx.категория||''} onChange={e => updateCategory(tx, e.target.value)}
                      className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${CATEGORY_STYLES[tx.категория]||'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {tx.rule_id ? (
                      <span className="text-blue-500" title="Авто по правило">⚡</span>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Няма транзакции за избраните филтри.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > LIMIT && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Показани {offset+1}–{Math.min(offset+LIMIT, total)} от {total}</span>
            <div className="flex gap-2">
              <button disabled={offset===0} onClick={() => setOffset(o => Math.max(0, o-LIMIT))}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">← Назад</button>
              <button disabled={offset+LIMIT>=total} onClick={() => setOffset(o => o+LIMIT)}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Напред →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Analysis Tab ──────────────────────────────────────────────
function AnalysisTab({ API }) {
  const [stats, setStats]     = useState(null)
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`${API}/api/import/stats`).then(r => r.json()),
      apiFetch(`${API}/api/import/monthly`).then(r => r.json()),
    ]).then(([s, m]) => {
      setStats(s)
      setMonthly([...m].reverse())
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [API])

  if (loading) return <div className="py-16 text-center text-gray-400">Зарежда...</div>
  if (!stats || !monthly.length) return (
    <div className="py-16 text-center text-gray-400">Няма данни. Импортирайте банково извлечение първо.</div>
  )

  const kpiCards = [
    { key: 'currentMonth', label: 'Текущ месец',       icon: '📅' },
    { key: 'last3months',  label: 'Последни 3 месеца',  icon: '📆' },
    { key: 'ytd',          label: 'Тази година (ГТД)',  icon: '📈' },
    { key: 'lastYear',     label: 'Миналата година',    icon: '🗓️' },
  ]

  const chartData = monthly.slice(-24).map(r => ({
    name:    fmtMonth(r.месец),
    'Наем (нето)':       r.наем_net,
    'Вноски (график)':   r.вноска_scheduled,
    Разходи:             r.разход_total,
    'Нет (консолид.)':   r.net_consolidated,
  }))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ key, label, icon }) => {
          const d         = stats[key] || {}
          const наем_net  = d.наем_net || 0
          const scheduled = d.вноска_scheduled || 0
          const net = d.net_consolidated != null
            ? d.net_consolidated
            : наем_net + (d.нап_ддс||0) - scheduled - (d.разход||0)
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{icon}</span>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase">{label}</div>
                  <div className="text-xs text-gray-400">{d.label}</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Наем (без ДДС)</span>
                  <span className="font-semibold text-green-700">+{fmt0(наем_net)}</span>
                </div>
                {(d.наем || 0) > 0 && Math.round(d.наем) !== Math.round(наем_net) && (
                  <div className="flex justify-between text-[10px] -mt-1">
                    <span className="text-gray-400 italic">с ДДС от банка</span>
                    <span className="text-gray-400 italic">+{fmt0(d.наем)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500" title="Месечни вноски от модул Кредити">Вноски (по график)</span>
                  <span className="font-semibold text-orange-700">-{fmt0(scheduled)}</span>
                </div>
                {(d.вноска || 0) > 0 && (
                  <div className="flex justify-between text-[10px] -mt-1">
                    <span className="text-gray-400 italic">от тази банка</span>
                    <span className="text-gray-400 italic">-{fmt0(d.вноска)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Разходи</span>
                  <span className="font-semibold text-red-700">-{fmt0(d.разход)}</span>
                </div>
                {(d.нап_ддс||0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500" title="Постъпления/възстановявания от НАП (нетен ДДС差ентиал)">НАП/ДДС</span>
                    <span className="font-semibold text-purple-600">+{fmt0(d.нап_ддс)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-1.5 flex justify-between text-sm font-bold">
                  <span className="text-gray-700">Нет (консолид.)</span>
                  <span className={net >= 0 ? 'text-green-700' : 'text-red-700'}>
                    {net >= 0 ? '+' : ''}{fmt0(net)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">Месечни парични потоци (последни {chartData.length} месеца, в EUR)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:10, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => fmt0(v)}/>
              <Tooltip formatter={(v,n) => [fmt(v)+' €', n]}/>
              <Legend/>
              <Line type="monotone" dataKey="Наем (нето)"     stroke="#16a34a" strokeWidth={2}   dot={false}/>
              <Line type="monotone" dataKey="Вноски (график)" stroke="#ea580c" strokeWidth={2}   dot={false} strokeDasharray="4 2"/>
              <Line type="monotone" dataKey="Разходи"          stroke="#dc2626" strokeWidth={2}   dot={false} strokeDasharray="4 2"/>
              <Line type="monotone" dataKey="Нет (консолид.)" stroke="#2563eb" strokeWidth={2.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-baseline">
          <h3 className="font-bold text-gray-800">Разбивка по месец</h3>
          <div className="text-xs text-gray-400">Наем — без ДДС | Вноски — от модул Кредити по график</div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Месец','Наем (нето)','Вноски (график)','Разходи','НАП/ДДС','Нет (консолид.)'].map(h => (
                  <th key={h} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...monthly].reverse().map(r => {
                const net = r.net_consolidated != null
                  ? r.net_consolidated
                  : (r.наем_net||0) + (r.нап_ддс_total||0) - (r.вноска_scheduled||0) - (r.разход_total||0)
                return (
                  <tr key={r.месец} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{fmtMonth(r.месец)}</td>
                    <td className="px-4 py-2 text-right text-green-700 font-medium" title={`С ДДС от банка: ${fmt(r.наем_total)} €`}>{fmt(r.наем_net)}</td>
                    <td className="px-4 py-2 text-right text-orange-700" title={r.вноска_total ? `От тази банка: ${fmt(r.вноска_total)} €` : 'Не са регистрирани вноски в банковите тx'}>{fmt(r.вноска_scheduled)}</td>
                    <td className="px-4 py-2 text-right text-red-700">{fmt(r.разход_total)}</td>
                    <td className="px-4 py-2 text-right text-purple-700">{fmt(r.нап_ддс_total)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${net>=0?'text-green-700':'text-red-700'}`}>
                      {net>=0?'+':''}{fmt(net)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Import Tab ────────────────────────────────────────────────
function ImportTab({ API, onSaved }) {
  const [dragging, setDragging]   = useState(false)
  const [parsing, setParsing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [transactions, setTx]     = useState([])
  const [batchWarn, setBatchWarn] = useState({}) // integrity флагове per ред: {'new<idx>': [{check,severity,title}]}
  const [unknownTenants, setUT]   = useState([])
  const [fileNames, setFileNames] = useState([])
  const [parseError, setParseError] = useState(null)
  const [saveResult, setSaveResult] = useState(null) // {saved, skipped}
  const [toast, setToast]         = useState(null)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [matchAssignments, setMatchAssignments] = useState({})
  const [filterCat, setFilterCat] = useState('all')
  const [properties, setProperties] = useState([])
  const [unmatched, setUnmatched] = useState([])
  const [unmatchedAssign, setUA]  = useState({})
  const [unmatchedSaving, setUS]  = useState(false)
  const [showUnmatched, setSU]    = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearResult, setClearResult]   = useState(null)
  const [coverage, setCoverage]         = useState(null)
  // Сметки от току що парсирани файлове: [{iban, scope, known}]
  const [parsedAccounts, setParsedAccounts] = useState([])
  // Кеш на качените файлове за да можем да re-parse след промяна на scope.
  const [cachedFiles, setCachedFiles]       = useState([])
  const fileInputRef = useRef()

  const clearAllTransactions = async () => {
    setClearConfirm(false)
    try {
      const r = await apiFetch(`${API}/api/import/transactions/all`, { method: 'DELETE' })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setTx([])
      setSaveResult(null)
      loadUnmatched()
      loadCoverage()
      onSaved && onSaved()
      setClearResult(`✅ Изтрити: ${data.deleted} транзакции`)
      setTimeout(() => setClearResult(null), 4000)
    } catch(e) {
      setClearResult('❌ Грешка: ' + e.message)
      setTimeout(() => setClearResult(null), 5000)
    }
  }

  const loadUnmatched = () =>
    apiFetch(`${API}/api/import/unmatched`).then(r => r.json()).then(setUnmatched).catch(() => {})

  const loadCoverage = () =>
    apiFetch(`${API}/api/import/coverage`).then(r => r.json()).then(setCoverage).catch(() => {})

  useEffect(() => {
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties).catch(() => {})
    loadUnmatched()
    loadCoverage()
  }, [API])

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const parseFiles = useCallback((files) => {
    const xlsFiles = Array.from(files).filter(f => /\.(xlsx|xls|pdf)$/i.test(f.name))
    if (!xlsFiles.length) { setParseError('Моля изберете .xlsx или .pdf файлове'); return }

    setParsing(true)
    setParseError(null)
    setTx([])
    setUT([])
    setSaveResult(null)
    setFileNames(xlsFiles.map(f => f.name))
    setCachedFiles(xlsFiles)

    if (xlsFiles.length === 1) {
      const formData = new FormData()
      formData.append('file', xlsFiles[0])
      apiFetch(`${API}/api/import/parse`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error)
          setTx(data.transactions || [])
          setUT(data.unknownTenants || [])
          setParsedAccounts(data.account ? [data.account] : [])
          if ((data.unknownTenants||[]).length > 0) setShowMatchModal(true)
          setParsing(false)
          showToastMsg(`Прочетени ${(data.transactions||[]).length} транзакции от ${xlsFiles[0].name}`)
        })
        .catch(e => { setParseError(e.message); setParsing(false) })
    } else {
      const formData = new FormData()
      xlsFiles.forEach(f => formData.append('files', f))
      apiFetch(`${API}/api/import/parse-multi`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error)
          setTx(data.transactions || [])
          setUT(data.unknownTenants || [])
          setParsedAccounts(data.accounts || [])
          if ((data.unknownTenants||[]).length > 0) setShowMatchModal(true)
          setParsing(false)
          const errMsg = data.errors?.length ? ` (${data.errors.length} грешки)` : ''
          showToastMsg(`Прочетени ${(data.transactions||[]).length} транзакции от ${xlsFiles.length} файла${errMsg}`)
        })
        .catch(e => { setParseError(e.message); setParsing(false) })
    }
  }, [API])

  // Зададе scope на дадена сметка → запази в settings → ре-парсва същите файлове.
  const assignAccountScope = useCallback((iban, scope) => {
    if (!iban || !['business','personal'].includes(scope)) return
    // Прочети текущия account_scope_map, добави нашия запис, push.
    apiFetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(settings => {
        const map = { ...(settings.account_scope_map || {}), [iban.toUpperCase()]: scope }
        return apiFetch(`${API}/api/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_scope_map: map }),
        })
      })
      .then(() => {
        showToastMsg(`Сметка ${iban.slice(0,8)}... → ${scope === 'personal' ? 'лична' : 'бизнес'}. Преизчислявам...`)
        if (cachedFiles.length) parseFiles(cachedFiles)
      })
      .catch(e => showToastMsg('Грешка: ' + e.message, 'error'))
  }, [API, cachedFiles, parseFiles])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    parseFiles(e.dataTransfer.files)
  }, [parseFiles])

  // Integrity флагове на staged редовете (debounce — staged редактиране е често).
  useEffect(() => {
    if (!transactions.length) { setBatchWarn({}); return }
    const timer = setTimeout(() => {
      const rows = transactions.map(t => ({
        дата: t.дата, сума: t.сума, currency: t.currency, operation: t.operation,
        категория: t.категория, property_id: t.property_id, месец: t.месец,
        контрагент: t.контрагент, основание: t.основание,
      }))
      apiFetch(`${API}/api/integrity/check-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      }).then(r => r.json()).then(d => setBatchWarn(d.byRow || {})).catch(() => {})
    }, 700)
    return () => clearTimeout(timer)
  }, [transactions, API])

  const handleSave = () => {
    if (!transactions.length) return
    setSaving(true)
    // Изпрати първата сметка с пълна info (balance + iban + scope). При multi-file
    // backend ще ползва тази инфо за всичкия импорт session.
    const account = parsedAccounts[0] ? {
      iban:            parsedAccounts[0].iban,
      scope:           parsedAccounts[0].scope,
      openingBalance:  parsedAccounts[0].openingBalance,
      closingBalance:  parsedAccounts[0].closingBalance,
      currency:        parsedAccounts[0].currency,
    } : null
    apiFetch(`${API}/api/import/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileNames.join(', '), transactions, account }),
    })
      .then(r => r.json())
      .then(data => {
        setSaving(false)
        if (data.ok) {
          setSaveResult({ saved: data.saved, skipped: data.skipped })
          showToastMsg(`✓ Записани: ${data.saved} | Пропуснати (дубликати): ${data.skipped}`)
          setTx([])
          setFileNames([])
          loadUnmatched()
          loadCoverage()
          onSaved && onSaved()
        } else throw new Error(data.error)
      })
      .catch(e => { setSaving(false); showToastMsg('Грешка: ' + e.message, 'error') })
  }

  const saveUnmatched = () => {
    const pairs = Object.entries(unmatchedAssign).filter(([, pid]) => pid)
    if (!pairs.length) return
    setUS(true)
    Promise.all(pairs.map(([id, pid]) =>
      apiFetch(`${API}/api/import/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: Number(pid) }),
      })
    )).then(() => {
      setUA({})
      setUS(false)
      showToastMsg(`Присвоени ${pairs.length} транзакции`)
      loadUnmatched()
    }).catch(e => { setUS(false); showToastMsg('Грешка: ' + e.message, 'error') })
  }

  const catCounts = {}
  transactions.forEach(tx => { catCounts[tx.категория] = (catCounts[tx.категория] || 0) + 1 })
  const pendingCount  = transactions.filter(tx => tx.validated === 0).length
  const dupCount      = transactions.filter(tx => tx.is_duplicate).length
  const categories    = ['all', 'дубликати', ...Object.keys(catCounts)]
  const filteredTx    = filterCat === 'all' ? transactions
    : filterCat === 'дубликати' ? transactions.filter(tx => tx.is_duplicate)
    : transactions.filter(tx => tx.категория === filterCat)

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type==='error'?'bg-red-600':'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Unmatched */}
      {unmatched.length > 0 && (
        <div className="mb-5 border border-yellow-300 bg-yellow-50 rounded-xl overflow-hidden">
          <button onClick={() => setSU(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-yellow-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-yellow-600 text-lg">⚠️</span>
              <span className="font-semibold text-yellow-800">{unmatched.length} наемни транзакции без присвоен имот</span>
            </div>
            <span className="text-yellow-600 text-sm">{showUnmatched?'▲ Скрий':'▼ Покажи'}</span>
          </button>
          {showUnmatched && (
            <div className="px-5 pb-4 space-y-2">
              {unmatched.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-800 truncate block">{tx.контрагент}</span>
                    <span className="text-xs text-gray-500 truncate block">{tx.основание} · {tx.месец}</span>
                  </div>
                  <span className="text-green-700 font-mono font-medium whitespace-nowrap">{fmt(tx.сума)}</span>
                  <select value={unmatchedAssign[tx.id]||''} onChange={e => setUA(prev => ({...prev,[tx.id]:e.target.value}))}
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-52 focus:outline-none">
                    <option value="">— Избери имот —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
                  </select>
                </div>
              ))}
              <div className="mt-3 flex justify-end">
                <button onClick={saveUnmatched} disabled={unmatchedSaving||!Object.values(unmatchedAssign).some(Boolean)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg">
                  {unmatchedSaving?'Запазва...':'💾 Запази присвояванията'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear all transactions */}
      {clearResult && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${clearResult.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {clearResult}
        </div>
      )}
      <div className="flex justify-end mb-3">
        {clearConfirm ? (
          <span className="flex items-center gap-2">
            <span className="text-sm text-red-700 font-semibold">Изтриване на всички транзакции?</span>
            <button onClick={clearAllTransactions} className="px-3 py-1.5 text-sm font-bold bg-red-700 text-white rounded hover:bg-red-800">Да, изтрий</button>
            <button onClick={() => setClearConfirm(false)} className="px-3 py-1.5 text-sm font-bold bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Отказ</button>
          </span>
        ) : (
          <button onClick={() => setClearConfirm(true)}
            className="px-3 py-1.5 text-sm font-semibold bg-red-700 text-white rounded hover:bg-red-800">
            🗑 Изчисти всички транзакции
          </button>
        )}
      </div>

      {/* Coverage — какво е вече импортирано */}
      {!transactions.length && coverage && coverage.count > 0 && (() => {
        const fmtDate = iso => {
          if (!iso) return '—'
          const [y, m, d] = iso.split('-')
          return `${d}.${m}.${y}`
        }
        const daysSince = (() => {
          if (!coverage.lastDate) return null
          const last = new Date(coverage.lastDate + 'T00:00:00')
          return Math.floor((Date.now() - last.getTime()) / 86400000)
        })()
        const maxCnt = Math.max(1, ...coverage.byMonth.map(m => m.cnt))
        return (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
              <div className="text-sm text-blue-900">
                <span className="font-semibold">Последна импортирана транзакция:</span>{' '}
                <span className="font-bold text-blue-700">{fmtDate(coverage.lastDate)}</span>
                {daysSince !== null && (
                  <span className="ml-2 text-xs text-blue-600">
                    (преди {daysSince === 0 ? 'днес' : daysSince === 1 ? '1 ден' : `${daysSince} дни`})
                  </span>
                )}
              </div>
              <div className="text-xs text-blue-700">
                Период: <strong>{fmtDate(coverage.firstDate)} → {fmtDate(coverage.lastDate)}</strong>
                {' · '}общо <strong>{coverage.count.toLocaleString('bg-BG')}</strong> транзакции
              </div>
            </div>
            <div className="text-xs text-blue-600 mb-1.5">Транзакции по месец (последни 6):</div>
            <div className="flex items-end gap-2">
              {coverage.byMonth.map(m => (
                <div key={m.месец} className="flex-1 flex flex-col items-center" title={`${m.cnt} транзакции · до ${fmtDate(m.lastDate)}`}>
                  <div className="text-[10px] text-blue-700 font-semibold mb-0.5">{m.cnt}</div>
                  <div className="w-full bg-blue-200 rounded-t" style={{ height: `${Math.max(4, (m.cnt / maxCnt) * 40)}px` }} />
                  <div className="text-[10px] text-blue-600 mt-1">{fmtMonth(m.месец)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Drop zone */}
      {!transactions.length && (
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={onDrop} onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors mb-6 ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }`}>
          <div className="text-5xl mb-3">📂</div>
          <div className="text-lg font-semibold text-gray-700 mb-1">
            {parsing ? 'Обработва се...' : 'Провлачете .xlsx или .pdf файлове тук'}
          </div>
          <div className="text-sm text-gray-400 mb-2">или кликнете за да изберете</div>
          <div className="text-xs text-gray-400 bg-white/60 inline-block px-3 py-1 rounded-full">
            ProBanking: xlsx или PDF извлечение. Можете да изберете няколко файла наведнъж.
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf" multiple onChange={e => parseFiles(e.target.files)} className="hidden"/>
        </div>
      )}

      {parsing && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <svg className="animate-spin h-6 w-6 mr-3 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Обработват се файловете...
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4">
          <strong>Грешка:</strong> {parseError}
        </div>
      )}

      {/* Unmapped accounts — pick scope */}
      {parsedAccounts.filter(a => a.iban && !a.known).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-2">
          <div className="text-sm font-bold text-amber-900">
            🏦 Нова сметка — задай scope, за да се категоризират правилно:
          </div>
          {parsedAccounts.filter(a => a.iban && !a.known).map(acc => (
            <div key={acc.iban} className="flex items-center gap-3 flex-wrap">
              <code className="text-xs bg-white px-2 py-1 rounded border border-amber-200">{acc.iban}</code>
              <button onClick={() => assignAccountScope(acc.iban, 'business')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-medium">
                Бизнес (Sky Capital)
              </button>
              <button onClick={() => assignAccountScope(acc.iban, 'personal')}
                      className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded text-xs font-medium">
                Лична (твоя)
              </button>
              <span className="text-xs text-amber-700">
                Текущо: {acc.scope === 'personal' ? 'лична (default)' : 'бизнес (default)'}
              </span>
            </div>
          ))}
          <div className="text-xs text-amber-700">
            След като зададеш scope, файловете се преизчисляват автоматично.
          </div>
        </div>
      )}

      {/* Show known accounts (small info) */}
      {parsedAccounts.filter(a => a.iban && a.known).length > 0 && (
        <div className="text-xs text-gray-500 mb-3">
          {parsedAccounts.filter(a => a.iban && a.known).map(a => (
            <span key={a.iban} className="inline-flex items-center gap-1 mr-3">
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">{a.iban.slice(0,12)}...</code>
              → {a.scope === 'personal' ? '👤 лична' : '🏢 бизнес'}
            </span>
          ))}
        </div>
      )}

      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-sm">
          <strong className="text-green-800">✓ Импортът завърши:</strong>{' '}
          <span className="text-green-700">{saveResult.saved} нови транзакции</span>
          {saveResult.skipped > 0 && <span className="text-gray-500"> · {saveResult.skipped} пропуснати (вече съществуват)</span>}
        </div>
      )}

      {/* Unknown Tenants Modal */}
      {showMatchModal && unknownTenants.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-bold">Неразпознати наематели</h3>
              <p className="text-sm text-gray-500 mt-1">
                Открити {unknownTenants.length} наемни транзакции без съответствие. Присвоете имот или продължете.
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-3">
              {unknownTenants.map((ut, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-medium text-gray-800 text-sm">{ut.контрагент}</div>
                  <div className="text-xs text-gray-500 mb-2 truncate">{ut.основание}</div>
                  <select value={matchAssignments[ut.контрагент]||''} onChange={e => setMatchAssignments(prev => ({...prev,[ut.контрагент]:e.target.value}))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none">
                    <option value="">— Избери имот —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']} ({p['тип']})</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowMatchModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Продължи без присвояване
              </button>
              <button onClick={() => {
                setTx(prev => prev.map(tx => {
                  const assignment = matchAssignments[tx.контрагент]
                  if (assignment && tx.категория==='наем' && !tx.property_id) return {...tx, property_id: Number(assignment)}
                  return tx
                }))
                setShowMatchModal(false)
              }} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                Приложи
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {transactions.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                Преглед: <span className="text-blue-600">{transactions.length}</span> транзакции
                {dupCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                    ⚠ {dupCount} дублирани — ще се пропуснат
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    ⚡ {pendingCount} авто по правила
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-500">{fileNames.join(', ')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setTx([]); setFileNames([]); setSaveResult(null) }}
                className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Нулирай</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium">
                {saving ? 'Записва...' : '💾 Запази транзакциите'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterCat===cat ? 'bg-blue-600 text-white border-blue-600'
                  : cat==='дубликати' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : `${CATEGORY_STYLES[cat]||'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80`
                }`}>
                {cat==='all'?'Всички':cat} ({cat==='all'?transactions.length:cat==='дубликати'?dupCount:catCounts[cat]||0})
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {['Дата','Контрагент','Основание','Сума','Оп.','Категория','Имот','⚡'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTx.map((tx, idx) => {
                    const realIdx = transactions.indexOf(tx)
                    return (
                      <tr key={realIdx} className={`hover:bg-gray-50 ${tx.is_duplicate?'bg-red-50 opacity-60':tx.validated===0?'bg-amber-50/40':''}`}>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{tx.дата}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate text-xs" title={tx.контрагент}>{tx.контрагент}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate text-xs" title={tx.основание}>{tx.основание}</td>
                        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap text-xs ${tx.operation==='Кт'?'text-green-700':'text-red-700'}`}>
                          {tx.operation==='Кт'?'+':'-'}{fmt(tx.сума)} <span className="text-gray-400 font-normal">{tx.currency||'BGN'}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${tx.operation==='Кт'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{tx.operation}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select value={tx.категория} onChange={e => setTx(prev => prev.map((t,i) => i===realIdx?{...t,категория:e.target.value}:t))}
                            className={`text-xs border rounded px-1 py-0.5 focus:outline-none ${CATEGORY_STYLES[tx.категория]||'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={tx.property_id||''} placeholder="—"
                            onChange={e => setTx(prev => prev.map((t,i) => i===realIdx?{...t,property_id:Number(e.target.value)||null}:t))}
                            className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                          {!tx.property_id && (() => {
                            const sug = (batchWarn['new'+realIdx]||[]).find(w => w.check==='unassigned_rent' && w.fix)
                            if (!sug) return null
                            const cands = sug.fix.candidates || []
                            if (sug.fix.property_id && cands.length === 1) return (
                              <button title="Присвои като наем"
                                onClick={() => setTx(prev => prev.map((t,i) => i===realIdx?{...t,property_id:sug.fix.property_id,категория:'наем'}:t))}
                                className="mt-0.5 block text-[10px] text-amber-700 underline whitespace-nowrap">
                                → наем: {cands[0].адрес} (ID{sug.fix.property_id})
                              </button>
                            )
                            if (cands.length > 1) return (
                              <select defaultValue="" className="mt-0.5 block text-[10px] border border-amber-200 rounded px-0.5 bg-amber-50 max-w-[120px]"
                                onChange={e => e.target.value && setTx(prev => prev.map((t,i) => i===realIdx?{...t,property_id:Number(e.target.value),категория:'наем'}:t))}>
                                <option value="">наем към…</option>
                                {cands.map(c => <option key={c.id} value={c.id}>{c.адрес} ({c.наем}€)</option>)}
                              </select>
                            )
                            return null
                          })()}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {tx.is_duplicate
                            ? <span className="text-red-500 text-xs font-bold" title="Вече съществува — ще се пропусне">⚠ дубл.</span>
                            : tx.validated===0
                              ? <span className="text-amber-500" title="Авто по правило">⚡</span>
                              : <span className="text-gray-200">—</span>}
                          {batchWarn['new'+realIdx]?.length
                            ? <span className="ml-1 text-amber-600 text-xs cursor-help"
                                title={batchWarn['new'+realIdx].map(w => w.title).join('; ')}>🟠</span>
                            : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function Import({ API }) {
  const [tab, setTab]           = useState('import')
  const [pendingCount, setPendingCount] = useState(0)
  const [properties, setProperties]     = useState([])

  useEffect(() => {
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties).catch(() => {})
  }, [API])

  const refreshPending = () => {
    apiFetch(`${API}/api/import/pending`).then(r => r.json())
      .then(d => setPendingCount(d.count || 0)).catch(() => {})
  }
  useEffect(() => { refreshPending() }, [API])

  const tabs = [
    { id: 'import',       label: '📥 Импорт' },
    { id: 'transactions', label: '📋 Транзакции' },
    { id: 'analysis',     label: '📊 Анализ' },
    { id: 'deposits',     label: '💰 Депозити' },
    { id: 'rules',        label: '⚡ Правила' },
  ]

  return (
    <div>
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800">Банка</h2>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors relative ${
                tab === t.id ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {t.label}
              {t.id === 'transactions' && pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Validation banner — shown on Transactions tab */}
      {tab === 'transactions' && (
        <ValidationBanner API={API} onDone={refreshPending}/>
      )}

      {tab === 'import'       && <ImportTab       API={API} onSaved={refreshPending}/>}
      {tab === 'transactions' && <TransactionsTab API={API} properties={properties} onRuleCreated={refreshPending}/>}
      {tab === 'analysis'     && <AnalysisTab     API={API}/>}
      {tab === 'deposits'     && <DepositsTab     API={API} properties={properties}/>}
      {tab === 'rules'        && <RulesTab        API={API} properties={properties}/>}
    </div>
  )
}
