import { apiFetch } from '../api'
import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CATEGORY_STYLES = {
  'наем':         'bg-green-100 text-green-800 border-green-200',
  'вноска':       'bg-orange-100 text-orange-800 border-orange-200',
  'разход':       'bg-red-100 text-red-800 border-red-200',
  'разход_друг':  'bg-red-50 text-red-700 border-red-100',
  'нап_ддс':      'bg-purple-100 text-purple-800 border-purple-200',
  'equity_inject':'bg-blue-100 text-blue-800 border-blue-200',
  'приход_друг':  'bg-gray-100 text-gray-700 border-gray-200',
  'друго':        'bg-gray-50 text-gray-500 border-gray-100',
}
const ALL_CATS = ['наем','вноска','разход','разход_друг','нап_ддс','equity_inject','приход_друг','друго']

const fmt  = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmt0 = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:0, maximumFractionDigits:0 })
const fmtMonth = m => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return ['Яну','Фев','Мар','Апр','Май','Юни','Юли','Авг','Сеп','Окт','Ное','Дек'][parseInt(mo)-1] + ' ' + y.slice(2)
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
  const [ruleModal, setRuleModal] = useState(null) // {tx, категория}
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

  const updateCategory = (tx, newCat) => {
    apiFetch(`${API}/api/import/transactions/${tx.id}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ категория: newCat }),
    }).then(() => {
      setRows(prev => prev.map(r => r.id === tx.id ? { ...r, категория: newCat, validated: 1 } : r))
      // Offer to create rule if category changed from default
      if (tx.контрагент && newCat !== tx.категория) {
        setRuleModal({ tx: { ...tx }, категория: newCat })
      }
    })
  }

  const createRule = (pattern, категория, property_id) => {
    apiFetch(`${API}/api/import/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, категория, property_id: property_id || null }),
    }).then(() => { setRuleModal(null); onRuleCreated && onRuleCreated() })
  }

  const totalIncome  = rows.filter(r => r.operation==='Кт').reduce((s,r) => s+(r.сума||0), 0)
  const totalExpense = rows.filter(r => r.operation==='Дт').reduce((s,r) => s+(r.сума||0), 0)

  return (
    <div className="space-y-4">
      {/* Rule creation modal */}
      {ruleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 text-lg mb-2">Запази като правило?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Следващия път когато видим транзакция от <strong className="text-blue-800">{ruleModal.tx.контрагент}</strong>
              автоматично ще я категоризираме като <strong>{ruleModal.категория}</strong>.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRuleModal(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Не, само тази
              </button>
              <button
                onClick={() => createRule(ruleModal.tx.контрагент, ruleModal.категория, ruleModal.tx.property_id)}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                ✓ Създай правило
              </button>
            </div>
          </div>
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
    Наем:    r.наем_total,
    Вноски:  r.вноска_total,
    Разходи: r.разход_total,
    НАП:     r.нап_ддс_total,
    Нет:     r.net,
  }))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ key, label, icon }) => {
          const d   = stats[key] || {}
          const net = (d.наем||0) + (d.нап_ддс||0) - (d.вноска||0) - (d.разход||0)
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
                  <span className="text-gray-500">Наем приход</span>
                  <span className="font-semibold text-green-700">+{fmt0(d.наем)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Кредитни вноски</span>
                  <span className="font-semibold text-orange-700">-{fmt0(d.вноска)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Разходи</span>
                  <span className="font-semibold text-red-700">-{fmt0(d.разход)}</span>
                </div>
                {(d.нап_ддс||0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Постъпл. НАП/ДДС</span>
                    <span className="font-semibold text-purple-600">+{fmt0(d.нап_ддс)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-1.5 flex justify-between text-sm font-bold">
                  <span className="text-gray-700">Нет</span>
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
          <h3 className="font-bold text-gray-800 mb-4">Месечни парични потоци (последни {chartData.length} месеца)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:10, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{ fontSize:11 }}/>
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => fmt0(v)}/>
              <Tooltip formatter={(v,n) => [fmt(v)+' лв.', n]}/>
              <Legend/>
              <Line type="monotone" dataKey="Наем"    stroke="#16a34a" strokeWidth={2}   dot={false}/>
              <Line type="monotone" dataKey="Вноски"  stroke="#ea580c" strokeWidth={2}   dot={false}/>
              <Line type="monotone" dataKey="Разходи" stroke="#dc2626" strokeWidth={2}   dot={false} strokeDasharray="4 2"/>
              <Line type="monotone" dataKey="Нет"     stroke="#2563eb" strokeWidth={2.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Разбивка по месец</h3>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Месец','Наем','Вноски','Разходи','НАП/ДДС','Нет'].map(h => (
                  <th key={h} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...monthly].reverse().map(r => {
                const net = (r.наем_total||0)+(r.нап_ддс_total||0)-(r.вноска_total||0)-(r.разход_total||0)
                return (
                  <tr key={r.месец} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{fmtMonth(r.месец)}</td>
                    <td className="px-4 py-2 text-right text-green-700 font-medium">{fmt(r.наем_total)}</td>
                    <td className="px-4 py-2 text-right text-orange-700">{fmt(r.вноска_total)}</td>
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

  useEffect(() => {
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(setProperties).catch(() => {})
    loadUnmatched()
  }, [API])

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const parseFiles = useCallback((files) => {
    const xlsFiles = Array.from(files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))
    if (!xlsFiles.length) { setParseError('Моля изберете .xlsx файлове'); return }

    setParsing(true)
    setParseError(null)
    setTx([])
    setUT([])
    setSaveResult(null)
    setFileNames(xlsFiles.map(f => f.name))

    if (xlsFiles.length === 1) {
      const formData = new FormData()
      formData.append('file', xlsFiles[0])
      apiFetch(`${API}/api/import/parse`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error)
          setTx(data.transactions || [])
          setUT(data.unknownTenants || [])
          if ((data.unknownTenants||[]).length > 0) setShowMatchModal(true)
          setParsing(false)
          showToastMsg(`Прочетени ${(data.transactions||[]).length} транзакции от ${xlsFiles[0].name}`)
        })
        .catch(e => { setParseError(e.message); setParsing(false) })
    } else {
      // Multi-file
      const formData = new FormData()
      xlsFiles.forEach(f => formData.append('files', f))
      apiFetch(`${API}/api/import/parse-multi`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error)
          setTx(data.transactions || [])
          setUT(data.unknownTenants || [])
          if ((data.unknownTenants||[]).length > 0) setShowMatchModal(true)
          setParsing(false)
          const errMsg = data.errors?.length ? ` (${data.errors.length} грешки)` : ''
          showToastMsg(`Прочетени ${(data.transactions||[]).length} транзакции от ${xlsFiles.length} файла${errMsg}`)
        })
        .catch(e => { setParseError(e.message); setParsing(false) })
    }
  }, [API])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    parseFiles(e.dataTransfer.files)
  }, [parseFiles])

  const handleSave = () => {
    if (!transactions.length) return
    setSaving(true)
    apiFetch(`${API}/api/import/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileNames.join(', '), transactions }),
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
  const pendingCount = transactions.filter(tx => tx.validated === 0).length
  const categories   = ['all', ...Object.keys(catCounts)]
  const filteredTx   = filterCat === 'all' ? transactions : transactions.filter(tx => tx.категория === filterCat)

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

      {/* Drop zone */}
      {!transactions.length && (
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={onDrop} onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors mb-6 ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }`}>
          <div className="text-5xl mb-3">📂</div>
          <div className="text-lg font-semibold text-gray-700 mb-1">
            {parsing ? 'Обработва се...' : 'Провлачете .xlsx файлове тук'}
          </div>
          <div className="text-sm text-gray-400 mb-2">или кликнете за да изберете</div>
          <div className="text-xs text-gray-400 bg-white/60 inline-block px-3 py-1 rounded-full">
            Можете да изберете няколко файла наведнъж — всички ще се обработят заедно
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple onChange={e => parseFiles(e.target.files)} className="hidden"/>
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
                  filterCat===cat ? 'bg-blue-600 text-white border-blue-600' : `${CATEGORY_STYLES[cat]||'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80`
                }`}>
                {cat==='all'?'Всички':cat} ({cat==='all'?transactions.length:catCounts[cat]||0})
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
                      <tr key={realIdx} className={`hover:bg-gray-50 ${tx.validated===0?'bg-amber-50/40':''}`}>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{tx.дата}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate text-xs" title={tx.контрагент}>{tx.контрагент}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate text-xs" title={tx.основание}>{tx.основание}</td>
                        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap text-xs ${tx.operation==='Кт'?'text-green-700':'text-red-700'}`}>
                          {tx.operation==='Кт'?'+':'-'}{fmt(tx.сума)}
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
                        </td>
                        <td className="px-3 py-2 text-center">
                          {tx.validated===0 ? <span className="text-amber-500" title="Авто по правило">⚡</span> : <span className="text-gray-200">—</span>}
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
      {tab === 'rules'        && <RulesTab        API={API} properties={properties}/>}
    </div>
  )
}
