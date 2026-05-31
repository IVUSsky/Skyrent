import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function ChatLearning({ API, onClose, onChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')   // pending | approved | rejected | stats
  const [editing, setEditing] = useState({})  // { [id]: { question, proposed_answer, scope, property_ids } }
  const [busy, setBusy] = useState(null)      // id of row being acted on
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const load = () => {
    if (tab === 'stats') {
      setStatsLoading(true)
      apiFetch(`${API}/api/chat-learning/stats`)
        .then(r => r.json())
        .then(data => { setStats(data); setStatsLoading(false) })
        .catch(() => setStatsLoading(false))
      return
    }
    setLoading(true)
    apiFetch(`${API}/api/chat-learning?status=${tab}`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [tab])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const startEdit = (it) => setEditing(e => ({
    ...e,
    [it.id]: {
      question: it.question,
      proposed_answer: it.proposed_answer,
      scope: it.scope,
      property_ids: it.property_ids || [],
    },
  }))
  const cancelEdit = (id) => setEditing(e => { const n = { ...e }; delete n[id]; return n })

  const saveEdit = async (id) => {
    setBusy(id)
    try {
      const body = editing[id]
      const r = await apiFetch(`${API}/api/chat-learning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Грешка')
      cancelEdit(id)
      load()
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
    } finally { setBusy(null) }
  }

  const approve = async (id) => {
    setBusy(id)
    try {
      const body = editing[id] || {}
      const r = await apiFetch(`${API}/api/chat-learning/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Грешка')
      cancelEdit(id)
      onChanged?.()
      load()
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
    } finally { setBusy(null) }
  }

  const reject = async (id) => {
    setBusy(id)
    try {
      const r = await apiFetch(`${API}/api/chat-learning/${id}/reject`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).error || 'Грешка')
      cancelEdit(id)
      onChanged?.()
      load()
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
    } finally { setBusy(null) }
  }

  const runNow = async () => {
    if (!confirm('Стартирай ръчно анализ на разговорите от последните 7 дни?')) return
    setRunning(true)
    try {
      const r = await apiFetch(`${API}/api/chat-learning/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      if (data.skipped) {
        setToast({ type: 'info', text: `Прескочено: ${data.reason} (${data.user_messages} съобщения)` })
      } else {
        setToast({ type: 'success', text: `✅ Готово — ${data.queued} нови предложения` })
        setTab('pending')
        load()
        onChanged?.()
      }
    } catch (e) {
      setToast({ type: 'error', text: 'Грешка: ' + e.message })
    } finally { setRunning(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🎓 Учене от разговори</h2>
            <div className="text-xs text-gray-500 mt-0.5">Предложения за добавяне в базата знания на AI асистента</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runNow} disabled={running}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50">
              {running ? 'Анализира…' : '▶ Анализирай сега'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        {toast && (
          <div className="mx-6 mt-3 px-3 py-2 rounded text-sm"
            style={{
              background: toast.type === 'success' ? '#dcfce7' : toast.type === 'info' ? '#dbeafe' : '#fee2e2',
              color:      toast.type === 'success' ? '#166534' : toast.type === 'info' ? '#1e3a8a' : '#991b1b',
            }}>
            {toast.text}
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-gray-200 flex gap-2 flex-shrink-0">
          {[
            { id: 'pending',  label: 'За преглед' },
            { id: 'approved', label: 'Одобрени' },
            { id: 'rejected', label: 'Отхвърлени' },
            { id: 'stats',    label: '📊 Статистики' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          {tab === 'stats' ? (
            statsLoading || !stats ? (
              <div className="text-center text-gray-500 py-8">Зарежда…</div>
            ) : (
              <div className="space-y-4">
                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-700 uppercase tracking-wide">Въпроси (7 дни)</div>
                    <div className="text-2xl font-bold text-blue-900">{stats.user_questions_7d}</div>
                    <div className="text-xs text-blue-600 mt-1">за 30 дни: {stats.user_questions_30d}</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-700 uppercase tracking-wide">Активни наематели (7 дни)</div>
                    <div className="text-2xl font-bold text-green-900">{stats.active_tenants_7d}</div>
                    <div className="text-xs text-green-600 mt-1">за 30 дни: {stats.active_tenants_30d}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-xs text-amber-700 uppercase tracking-wide">„Не знам" процент (7 дни)</div>
                    <div className="text-2xl font-bold text-amber-900">{stats.dunno_rate_7d}%</div>
                    <div className="text-xs text-amber-600 mt-1">колкото по-нисък, по-добре</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="text-xs text-purple-700 uppercase tracking-wide">Научени FAQ-и (всички)</div>
                    <div className="text-2xl font-bold text-purple-900">{stats.learned_faqs_total}</div>
                    <div className="text-xs text-purple-600 mt-1">
                      ✓ {stats.queue_approved_total} ✕ {stats.queue_rejected_total}
                    </div>
                  </div>
                </div>

                {/* Recent questions */}
                <div>
                  <div className="text-sm font-semibold text-gray-800 mb-2">Последни въпроси от наематели (до 25, последни 30 дни)</div>
                  {stats.recent_questions.length === 0 ? (
                    <div className="text-sm text-gray-400 italic">Все още няма въпроси от наематели.</div>
                  ) : (
                    <div className="space-y-1 max-h-96 overflow-y-auto border border-gray-200 rounded">
                      {stats.recent_questions.map((q, i) => (
                        <div key={i} className="p-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                          <div className="text-sm text-gray-800">{q.content}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {q.name || q.username || 'наемател'} • {new Date(q.created_at).toLocaleString('bg-BG')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : loading ? (
            <div className="text-center text-gray-500 py-8">Зарежда…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">
              {tab === 'pending'  && 'Няма предложения за преглед. Натисни „Анализирай сега" за ръчно стартиране.'}
              {tab === 'approved' && 'Все още няма одобрени предложения.'}
              {tab === 'rejected' && 'Няма отхвърлени предложения.'}
            </div>
          ) : (
            items.map(it => {
              const e = editing[it.id]
              const isEditing = !!e
              return (
                <div key={it.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span>📅 {new Date(it.created_at).toLocaleString('bg-BG')}</span>
                      <span>🔁 {it.sample_count}× попитан</span>
                      <span className={`px-2 rounded ${
                        (e?.scope || it.scope) === 'global' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {(e?.scope || it.scope) === 'global' ? '🌐 за всички имоти' : `🏠 ${it.property_addresses?.join(', ') || 'имот'}`}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Въпрос</label>
                        <input type="text" value={e.question}
                          onChange={ev => setEditing(s => ({ ...s, [it.id]: { ...s[it.id], question: ev.target.value } }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Отговор</label>
                        <textarea value={e.proposed_answer} rows={3}
                          onChange={ev => setEditing(s => ({ ...s, [it.id]: { ...s[it.id], proposed_answer: ev.target.value } }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Обхват</label>
                        <select value={e.scope}
                          onChange={ev => setEditing(s => ({ ...s, [it.id]: { ...s[it.id], scope: ev.target.value } }))}
                          className="border border-gray-300 rounded px-2 py-1 text-sm">
                          <option value="per-apartment">🏠 Само за избрания имот</option>
                          <option value="global">🌐 За всички имоти</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-gray-800 mb-1">Q: {it.question}</div>
                      <div className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">A: {it.proposed_answer}</div>
                      {it.reasoning && (
                        <div className="text-xs text-gray-500 italic mb-2">💡 {it.reasoning}</div>
                      )}
                    </>
                  )}

                  {tab === 'pending' && (
                    <div className="flex gap-2 justify-end mt-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => cancelEdit(it.id)}
                            className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1">
                            Отказ редакция
                          </button>
                          <button onClick={() => saveEdit(it.id)} disabled={busy === it.id}
                            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded disabled:opacity-50">
                            Запази
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(it)}
                          className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1">
                          ✎ Редактирай
                        </button>
                      )}
                      <button onClick={() => reject(it.id)} disabled={busy === it.id}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded disabled:opacity-50">
                        ✕ Отхвърли
                      </button>
                      <button onClick={() => approve(it.id)} disabled={busy === it.id}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1 rounded disabled:opacity-50">
                        ✓ Одобри
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
