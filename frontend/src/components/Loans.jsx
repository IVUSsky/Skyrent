import React, { useState, useEffect } from 'react'

const fmt = (n) => (n || 0).toLocaleString('bg-BG')

export default function Loans({ API }) {
  const [loans, setLoans] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/loans`).then(r => r.json()),
      fetch(`${API}/api/properties`).then(r => r.json()),
    ])
      .then(([l, p]) => {
        setLoans(l)
        setProperties(p)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  const propMap = {}
  properties.forEach(p => { propMap[p.id] = p })

  // Bank concentration
  const bankTotals = {}
  loans.forEach(l => {
    const b = l['банка'] || 'Друга'
    bankTotals[b] = (bankTotals[b] || 0) + (l['остатък'] || 0)
  })
  const totalDebt = Object.values(bankTotals).reduce((s, v) => s + v, 0)

  const bankColors = {
    'Пощенска': { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
    'УниКредит': { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
    'Прокредит': { bg: 'bg-green-50 border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
  }

  const getLihvaColor = (lihva) => {
    if (lihva < 2.5) return 'text-green-700 font-semibold'
    if (lihva <= 3.0) return 'text-yellow-700 font-semibold'
    return 'text-red-700 font-semibold'
  }

  const getPropertyAddresses = (imotiJson) => {
    try {
      const ids = JSON.parse(imotiJson || '[]')
      return ids.map(id => {
        const p = propMap[id]
        return p ? p['адрес'] : `#${id}`
      })
    } catch {
      return []
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Кредити</h2>

      {/* Bank Concentration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {Object.entries(bankTotals).map(([bank, total]) => {
          const c = bankColors[bank] || { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-800' }
          const bankLoans = loans.filter(l => l['банка'] === bank)
          const bankVnoska = bankLoans.reduce((s, l) => s + (l['вноска'] || 0), 0)
          const pct = totalDebt > 0 ? ((total / totalDebt) * 100).toFixed(1) : 0
          return (
            <div key={bank} className={`border rounded-xl p-4 ${c.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-800 text-lg">{bank}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{pct}%</span>
              </div>
              <div className={`text-2xl font-bold ${c.text}`}>{fmt(total)} лв.</div>
              <div className="text-xs text-gray-500 mt-1">
                {bankLoans.length} кредита • вноска {fmt(bankVnoska)} лв./мес
              </div>
              {/* Progress bar */}
              <div className="mt-2 bg-white bg-opacity-60 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${c.text.replace('text-', 'bg-').replace('-700', '-400')}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary row */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6">
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold">Общ дълг</div>
          <div className="text-xl font-bold text-red-700">{fmt(totalDebt)} лв.</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold">Общо вноска/мес</div>
          <div className="text-xl font-bold text-orange-700">
            {fmt(loans.reduce((s, l) => s + (l['вноска'] || 0), 0))} лв.
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold">Брой кредити</div>
          <div className="text-xl font-bold text-gray-700">{loans.length}</div>
        </div>
      </div>

      {/* Loans table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Банка', 'Договор', 'Кредитополучател', 'Остатък (лв.)', 'Вноска/мес', 'Лихва %', 'Краен год.', 'Имоти'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loans.map((loan, i) => {
                const addresses = getPropertyAddresses(loan['имоти'])
                const c = bankColors[loan['банка']] || { badge: 'bg-gray-100 text-gray-800' }
                return (
                  <tr key={loan.id} className={i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${c.badge}`}>
                        {loan['банка']}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{loan['договор']}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{loan['кредитополучател']}</td>
                    <td className="px-3 py-3 text-right font-semibold text-red-700 whitespace-nowrap">
                      {fmt(loan['остатък'])}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-orange-700 whitespace-nowrap">
                      {fmt(loan['вноска'])}
                    </td>
                    <td className={`px-3 py-3 text-right whitespace-nowrap ${getLihvaColor(loan['лихва'])}`}>
                      {loan['лихва']}%
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">{loan['краен']}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {addresses.map((addr, idx) => (
                          <span key={idx} className="inline-block bg-blue-50 text-blue-700 text-xs px-1.5 py-0.5 rounded border border-blue-100 whitespace-nowrap">
                            {addr}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-3 py-3 font-semibold text-gray-700">Общо</td>
                <td className="px-3 py-3 text-right font-bold text-red-700">
                  {fmt(loans.reduce((s, l) => s + (l['остатък'] || 0), 0))}
                </td>
                <td className="px-3 py-3 text-right font-bold text-orange-700">
                  {fmt(loans.reduce((s, l) => s + (l['вноска'] || 0), 0))}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
