import React, { useState, useRef, useCallback, useEffect } from 'react'

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

const fmt = (n) => (n || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Import({ API }) {
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [unknownTenants, setUnknownTenants] = useState([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState(null)
  const [toast, setToast] = useState(null)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [matchAssignments, setMatchAssignments] = useState({})
  const [filterCat, setFilterCat] = useState('all')
  const [properties, setProperties] = useState([])
  const fileInputRef = useRef()

  useEffect(() => {
    fetch(`${API}/api/properties`).then(r => r.json()).then(setProperties).catch(() => {})
  }, [API])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const parseFile = useCallback((file) => {
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError(null)
    setTransactions([])
    setUnknownTenants([])

    const formData = new FormData()
    formData.append('file', file)

    fetch(`${API}/api/import/parse`, { method: 'POST', body: formData })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setTransactions(data.transactions || [])
        setUnknownTenants(data.unknownTenants || [])
        if ((data.unknownTenants || []).length > 0) setShowMatchModal(true)
        setParsing(false)
        showToast(`Прочетени ${(data.transactions || []).length} транзакции`)
      })
      .catch(e => {
        setParseError(e.message)
        setParsing(false)
      })
  }, [API])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      parseFile(file)
    } else {
      setParseError('Моля изберете .xlsx или .xls файл')
    }
  }, [parseFile])

  const onFileChange = (e) => {
    const file = e.target.files[0]
    if (file) parseFile(file)
  }

  const handleSave = () => {
    if (!transactions.length) return
    setSaving(true)
    fetch(`${API}/api/import/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName, transactions }),
    })
      .then(r => r.json())
      .then(data => {
        setSaving(false)
        if (data.ok) {
          showToast(`Записани ${transactions.length} транзакции успешно!`)
          setTransactions([])
          setFileName('')
        } else {
          throw new Error(data.error || 'Unknown error')
        }
      })
      .catch(e => { setSaving(false); showToast('Грешка: ' + e.message, 'error') })
  }

  const updateTxCategory = (idx, cat) => {
    setTransactions(prev => prev.map((tx, i) => i === idx ? { ...tx, категория: cat } : tx))
  }

  const updateTxPropId = (idx, pid) => {
    setTransactions(prev => prev.map((tx, i) => i === idx ? { ...tx, property_id: Number(pid) || null } : tx))
  }

  const catCounts = {}
  transactions.forEach(tx => { catCounts[tx.категория] = (catCounts[tx.категория] || 0) + 1 })

  const filteredTx = filterCat === 'all' ? transactions : transactions.filter(tx => tx.категория === filterCat)

  const categories = ['all', ...Object.keys(catCounts)]

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Импорт на банков отчет</h2>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Drop Zone */}
      {!transactions.length && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors mb-6 ${
            dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <div className="text-5xl mb-3">📂</div>
          <div className="text-lg font-semibold text-gray-700 mb-1">
            {parsing ? 'Обработва се...' : 'Провлачете .xlsx файл тук'}
          </div>
          <div className="text-sm text-gray-400 mb-4">или кликнете за да изберете файл</div>
          <div className="text-xs text-gray-400">Поддържа се ProCredit банков отчет в .xlsx формат</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            className="hidden"
          />
        </div>
      )}

      {parsing && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <svg className="animate-spin h-6 w-6 mr-3 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Обработва се файла...
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4">
          <strong>Грешка при парсване:</strong> {parseError}
        </div>
      )}

      {/* Unknown Tenants Modal */}
      {showMatchModal && unknownTenants.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-bold">Неразпознати наематели</h3>
              <p className="text-sm text-gray-500 mt-1">
                Открити {unknownTenants.length} контрагента с ключова дума 'наем' но без съответствие в tenant_map.
                Можете да присвоите имот ID или да продължите без.
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-3">
              {unknownTenants.map((ut, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-medium text-gray-800 text-sm">{ut.контрагент}</div>
                  <div className="text-xs text-gray-500 mb-2 truncate">{ut.основание}</div>
                  <select
                    value={matchAssignments[ut.контрагент] || ''}
                    onChange={e => setMatchAssignments(prev => ({ ...prev, [ut.контрагент]: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Избери имот —</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>#{p.id} {p['адрес']} ({p['тип']})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowMatchModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Продължи без присвояване
              </button>
              <button
                onClick={() => {
                  // Apply assignments to transactions
                  setTransactions(prev => prev.map(tx => {
                    const assignment = matchAssignments[tx.контрагент]
                    if (assignment && tx.категория === 'наем' && !tx.property_id) {
                      return { ...tx, property_id: Number(assignment) }
                    }
                    return tx
                  }))
                  setShowMatchModal(false)
                }}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Приложи
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      {transactions.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                Транзакции: <span className="text-blue-600">{transactions.length}</span>
              </h3>
              <p className="text-sm text-gray-500">Файл: {fileName}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setTransactions([]); setFileName(''); setParseError(null) }}
                className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Нулирай
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium"
              >
                {saving ? 'Записва...' : '💾 Запази транзакциите'}
              </button>
            </div>
          </div>

          {/* Category summary */}
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterCat === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : `${CATEGORY_STYLES[cat] || 'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80`
                }`}
              >
                {cat === 'all' ? 'Всички' : cat} {cat !== 'all' && `(${catCounts[cat] || 0})`}
                {cat === 'all' && ` (${transactions.length})`}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {['Дата', 'Контрагент', 'Основание', 'Сума', 'Оп.', 'Категория', 'Имот ID'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTx.map((tx, idx) => {
                    const realIdx = transactions.indexOf(tx)
                    return (
                      <tr key={realIdx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{tx.дата}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate whitespace-nowrap text-xs" title={tx.контрагент}>{tx.контрагент}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate whitespace-nowrap text-xs" title={tx.основание}>{tx.основание}</td>
                        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap text-xs ${tx.operation === 'Кт' ? 'text-green-700' : 'text-red-700'}`}>
                          {tx.operation === 'Кт' ? '+' : '-'}{fmt(tx.сума)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${
                            tx.operation === 'Кт' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {tx.operation}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={tx.категория}
                            onChange={e => updateTxCategory(realIdx, e.target.value)}
                            className={`text-xs border rounded px-1 py-0.5 focus:outline-none ${CATEGORY_STYLES[tx.категория] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
                          >
                            {['наем','вноска','разход','разход_друг','нап_ддс','equity_inject','приход_друг','друго'].map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={tx.property_id || ''}
                            onChange={e => updateTxPropId(realIdx, e.target.value)}
                            placeholder="—"
                            className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
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
