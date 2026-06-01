// Личен бюджет — доходи (заплата / договор управление / дивиденти / лихва /
// друго), лични разходи, savings rate спрямо цел. Целта: дисциплина за
// инвестиране — колко свободна сума остава месечно и колко вече сте вложили.

import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'

const API = import.meta.env.VITE_API_URL || ''
const INCOME_TYPES = ['заплата', 'управление', 'дивидент', 'лихва_болгар', 'друго']
const INCOME_LABEL = {
  заплата:       'Заплата',
  управление:    'Договор управление',
  дивидент:      'Дивидент',
  лихва_болгар:  'Лихва (Болгар Капитал)',
  друго:         'Друго',
}

const fmt = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmt0 = n => (n||0).toLocaleString('bg-BG', { minimumFractionDigits:0, maximumFractionDigits:0 })

export default function PersonalBudget() {
  const today = new Date().toISOString().slice(0, 7)
  const [month, setMonth]       = useState(today)
  const [summary, setSummary]   = useState(null)
  const [income, setIncome]     = useState([])
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading]   = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState({
    дата: new Date().toISOString().slice(0, 10),
    тип:  'заплата',
    сума: '',
    валута: 'EUR',
    източник: '',
    бележка: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`${API}/api/personal/summary?month=${month}`).then(r => r.json()),
      apiFetch(`${API}/api/personal/income?month=${month}`).then(r => r.json()),
      apiFetch(`${API}/api/personal/summary/timeline?months=12`).then(r => r.json()),
    ]).then(([s, i, t]) => {
      setSummary(s); setIncome(i); setTimeline(t); setLoading(false)
    }).catch(() => setLoading(false))
  }, [month])

  useEffect(() => { load() }, [load])

  const submitIncome = () => {
    if (!form.дата || !form.сума) return
    apiFetch(`${API}/api/personal/income`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, сума: Number(form.сума) }),
    }).then(r => r.json()).then(() => {
      setShowAdd(false)
      setForm(f => ({ ...f, сума: '', източник: '', бележка: '' }))
      load()
    })
  }

  const removeIncome = (id) => {
    if (!confirm('Изтрий записа?')) return
    apiFetch(`${API}/api/personal/income/${id}`, { method: 'DELETE' })
      .then(() => load())
  }

  const s = summary || {}
  const sv = s.savings || {}
  const dispKt = sv.дисциплина === 'над цел' ? 'text-emerald-700' : sv.дисциплина === 'под цел' ? 'text-rose-700' : 'text-gray-500'

  return (
    <div className="space-y-4">
      {/* Header + month picker */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Месец</div>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                 className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"/>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowAdd(true)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">
            + Добави доход
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Доход" value={s.доход_общо} color="text-emerald-700" suffix={` ${income[0]?.валута||'EUR'}`}/>
        <Kpi label="Лични разходи" value={s.разходи_общо} color="text-rose-700"/>
        <Kpi label="Свободно за инвестиране" value={s.нетен_cashflow} color="text-blue-700"
             extra={<span className="text-xs text-gray-400">savings rate: <b>{sv.rate_pct !== null ? sv.rate_pct + '%' : '—'}</b> (цел {sv.target_pct||30}%)</span>}/>
        <Kpi label="Вече инвестирано" value={s.инвестирано_месец} color="text-indigo-700"
             extra={sv.дисциплина && <span className={`text-xs font-medium ${dispKt}`}>● {sv.дисциплина}</span>}/>
      </div>

      {/* Income & Expenses breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📈 Доходи по тип ({month})</h3>
          {(s.доход_по_тип || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма записани доходи за този месец.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(s.доход_по_тип || []).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 text-gray-700">{INCOME_LABEL[r.тип] || r.тип}</td>
                    <td className="py-2 text-right font-medium text-emerald-700">+{fmt(r.total)} {r.валута}</td>
                    <td className="py-2 text-right text-gray-400 text-xs w-12">×{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">💸 Лични разходи по категория</h3>
          {(s.разходи_по_категория || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Няма записани лични разходи.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(s.разходи_по_категория || []).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 text-gray-700">{r.expense_category || '—'}</td>
                    <td className="py-2 text-right font-medium text-rose-700">−{fmt(r.total)} {r.currency}</td>
                    <td className="py-2 text-right text-gray-400 text-xs w-12">×{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timeline chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📊 Последните 12 месеца</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма данни.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
              <XAxis dataKey="месец" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip formatter={v => fmt(v)}/>
              <Legend/>
              <Bar dataKey="доход" fill="#10b981" name="Доход"/>
              <Bar dataKey="разход" fill="#ef4444" name="Разход"/>
              <Bar dataKey="нетно" fill="#3b82f6" name="Нетно"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Income list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">📋 Доходи ({month})</h3>
        {income.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Няма доходи. Добави първия или импортирай банка.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <tr>
                <th className="text-left py-2">Дата</th>
                <th className="text-left py-2">Тип</th>
                <th className="text-left py-2">Източник</th>
                <th className="text-right py-2">Сума</th>
                <th className="text-left py-2 pl-3">Бележка</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {income.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-600">{r.дата}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {INCOME_LABEL[r.тип] || r.тип}
                    </span>
                  </td>
                  <td className="py-2 text-gray-700 max-w-[200px] truncate" title={r.източник}>{r.източник}</td>
                  <td className="py-2 text-right font-medium text-emerald-700">+{fmt(r.сума)} {r.валута}</td>
                  <td className="py-2 pl-3 text-gray-500 text-xs max-w-[280px] truncate" title={r.бележка || r.tx_основание}>
                    {r.бележка || r.tx_основание}
                    {r.bank_tx_id && <span className="ml-1 text-blue-500" title="От банков импорт">⚡</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeIncome(r.id)}
                            className="text-gray-300 hover:text-rose-600 text-sm" title="Изтрий">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add income modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-md w-full m-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">+ Добави доход</h3>
            <div className="space-y-3">
              <Field label="Дата">
                <input type="date" value={form.дата} onChange={e => setForm(f => ({ ...f, дата: e.target.value }))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
              <Field label="Тип">
                <select value={form.тип} onChange={e => setForm(f => ({ ...f, тип: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {INCOME_TYPES.map(t => <option key={t} value={t}>{INCOME_LABEL[t]}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field label="Сума">
                    <input type="number" step="0.01" value={form.сума}
                           onChange={e => setForm(f => ({ ...f, сума: e.target.value }))}
                           className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus/>
                  </Field>
                </div>
                <Field label="Валута">
                  <select value={form.валута} onChange={e => setForm(f => ({ ...f, валута: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                    <option>EUR</option>
                    <option>BGN</option>
                  </select>
                </Field>
              </div>
              <Field label="Източник (фирма / банка)">
                <input type="text" value={form.източник} onChange={e => setForm(f => ({ ...f, източник: e.target.value }))}
                       placeholder="Infinita OOD, UniCredit, Bulgar Capital ..."
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
              <Field label="Бележка">
                <input type="text" value={form.бележка} onChange={e => setForm(f => ({ ...f, бележка: e.target.value }))}
                       className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"/>
              </Field>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowAdd(false)}
                      className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Отказ</button>
              <button onClick={submitIncome}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">
                Запази
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color = 'text-gray-700', suffix = ' EUR', extra }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-xs font-bold text-gray-500 uppercase mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{fmt0(value)}{suffix}</div>
      {extra && <div className="mt-1">{extra}</div>}
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
