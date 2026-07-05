import React, { useEffect, useRef, useState } from 'react'
import { apiFetch, authUrl } from '../api'

const STATUS = {
  open:        { label: 'Отворен',   cls: 'bg-red-100 text-red-800 border-red-300' },
  in_progress: { label: 'В процес',  cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  resolved:    { label: 'Разрешен',  cls: 'bg-green-100 text-green-800 border-green-300' },
  closed:      { label: 'Затворен',  cls: 'bg-gray-200 text-gray-700 border-gray-300' },
}
const PRIORITY = {
  low:    { label: 'Ниско',   cls: 'text-gray-500' },
  normal: { label: 'Нормално',cls: 'text-blue-600' },
  high:   { label: 'Високо',  cls: 'text-orange-600 font-semibold' },
  urgent: { label: 'Спешно',  cls: 'text-red-600 font-bold' },
}
const CATEGORIES = {
  plumbing: '🚿 ВиК',
  electrical: '⚡ Електро',
  appliance: '🔌 Уред',
  heating: '🔥 Отопление',
  internet: '🌐 Интернет',
  cleaning: '🧹 Чистене',
  other: '📌 Друго',
}

const fmtAgo = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (sec < 60)        return 'преди миг'
  if (sec < 3600)      return `преди ${Math.floor(sec / 60)} мин`
  if (sec < 86400)     return `преди ${Math.floor(sec / 3600)} ч`
  return `преди ${Math.floor(sec / 86400)} дни`
}

export default function Support({ API }) {
  const [tickets, setTickets] = useState([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [selected, setSelected] = useState(null) // ticket id
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [compose, setCompose] = useState(null)   // null | { user_id, title, message }
  const [recipients, setRecipients] = useState([])
  const [sending, setSending] = useState(false)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const openCompose = () => {
    setCompose({ user_id: '', title: '', message: '' })
    apiFetch(`${API}/api/support/recipients`).then(r => r.json())
      .then(d => setRecipients(Array.isArray(d) ? d : [])).catch(() => setRecipients([]))
  }
  const sendCompose = async () => {
    if (!compose.user_id || !compose.message.trim()) { showToast('Избери наемател и напиши съобщение', 'error'); return }
    setSending(true)
    try {
      const r = await apiFetch(`${API}/api/support`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compose),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); setSending(false); return }
      setCompose(null); setSending(false); showToast('Съобщението е изпратено')
      setStatusFilter('all'); load(); if (d.id) loadDetail(d.id)
    } catch (e) { showToast('Сървърна грешка', 'error'); setSending(false) }
  }

  const load = () => {
    setLoading(true)
    const qs = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    apiFetch(`${API}/api/support${qs}`).then(r => r.json()).then(d => { setTickets(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [API, statusFilter])

  const loadDetail = (id) => {
    setSelected(id)
    apiFetch(`${API}/api/support/${id}`).then(r => r.json()).then(setDetail)
  }

  const changeMeta = async (field, value) => {
    try {
      const r = await apiFetch(`${API}/api/support/${selected}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await r.json()
      if (!r.ok) { showToast(data.error || 'Грешка', 'error'); return }
      loadDetail(selected); load()
    } catch (e) { showToast('Сървърна грешка', 'error') }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[360px,1fr] gap-4 fin-surface">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Ново съобщение до наемател (landlord-initiated разговор) */}
      {compose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCompose(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-4">✉️ Ново съобщение до наемател</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Наемател *</label>
                <select value={compose.user_id} onChange={e => setCompose({ ...compose, user_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— избери —</option>
                  {recipients.map(r => (
                    <option key={r.id} value={r.id}>{r.name || r.username}{r.property_address ? ` · ${r.property_address}` : ''}</option>
                  ))}
                </select>
                {recipients.length === 0 && <div className="text-[11px] text-gray-400 mt-1">Няма наематели с портал акаунт.</div>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Тема</label>
                <input value={compose.title} onChange={e => setCompose({ ...compose, title: e.target.value })}
                  placeholder="напр. Напомняне за наема"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Съобщение *</label>
                <textarea value={compose.message} onChange={e => setCompose({ ...compose, message: e.target.value })} rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCompose(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Отказ</button>
              <button onClick={sendCompose} disabled={sending}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-60">
                {sending ? 'Изпращане…' : 'Изпрати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-800">💬 Разговори</h2>
            <button onClick={openCompose}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700">✉️ Ново</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {['open', 'in_progress', 'resolved', 'closed', 'all'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-2 py-1 rounded border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {s === 'all' ? 'Всички' : (STATUS[s]?.label || s)}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
          {loading
            ? <div className="text-center py-12 text-gray-400">Зарежда...</div>
            : tickets.length === 0
              ? <div className="text-center py-12 text-gray-400">Няма сигнали.</div>
              : tickets.map(t => {
                  const st = STATUS[t.status] || { label: t.status, cls: '' }
                  const pr = PRIORITY[t.priority] || { label: t.priority, cls: '' }
                  return (
                    <button key={t.id} onClick={() => loadDetail(t.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 ${selected === t.id ? 'bg-blue-50' : ''} ${t.has_unread_for_admin ? 'border-l-4 border-blue-500' : ''}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-semibold text-gray-800 truncate flex-1">#{t.id} {t.title}</div>
                        <span className={`text-[10px] ${pr.cls}`}>{pr.label}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {CATEGORIES[t.category] || t.category || ''} · {t.user_name || t.user_username}
                      </div>
                      {t.property_address && <div className="text-[11px] text-gray-400 truncate">{t.property_address}</div>}
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                        <span className="text-[10px] text-gray-400">{fmtAgo(t.updated_at)}</span>
                      </div>
                      {t.last_message && (
                        <div className="text-[11px] text-gray-500 mt-1 truncate italic">
                          {t.last_message_role === 'admin' ? 'Вие: ' : '→ '}{t.last_message}
                        </div>
                      )}
                    </button>
                  )
                })
          }
        </div>
      </div>

      {/* Detail */}
      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        {!detail ? (
          <div className="h-full min-h-[400px] flex items-center justify-center text-gray-400 text-sm p-8 text-center">
            Изберете сигнал отляво за детайли и отговор.
          </div>
        ) : (
          <TicketDetail
            API={API}
            ticket={detail}
            attachmentPath="/api/support/attachments"
            onAction={loadDetail.bind(null, detail.id)}
            onMetaChange={changeMeta}
            onAfterReply={() => { loadDetail(detail.id); load() }}
            adminMode
          />
        )}
      </div>
    </div>
  )
}

// Reusable detail panel — used by both admin and tenant (via prop adminMode)
export function TicketDetail({ API, ticket, attachmentPath, onMetaChange, onAfterReply, adminMode, postPath, onClose }) {
  const [reply, setReply] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)
  const endRef  = useRef(null)
  const targetPath = postPath || `/api/support/${ticket.id}/messages`

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket.id, ticket.messages?.length])

  const send = async () => {
    if (!reply.trim() && !files.length) return
    setSending(true)
    const fd = new FormData()
    if (reply.trim()) fd.append('message', reply.trim())
    files.forEach(f => fd.append('files', f))
    try {
      const r = await apiFetch(`${API}${targetPath}`, { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) { alert(data.error || 'Грешка'); return }
      setReply(''); setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      onAfterReply && onAfterReply()
    } catch (e) { alert('Сървърна грешка') }
    finally { setSending(false) }
  }

  const close = async () => {
    if (!confirm('Сигурни ли сте, че сигналът е разрешен и искате да го затворите?')) return
    try {
      const r = await apiFetch(`${API}/api/tenant/tickets/${ticket.id}/close`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { alert(data.error || 'Грешка'); return }
      onAfterReply && onAfterReply()
    } catch (e) { alert('Сървърна грешка') }
  }

  const st = STATUS[ticket.status] || { label: ticket.status, cls: '' }
  const pr = PRIORITY[ticket.priority] || { label: ticket.priority, cls: '' }

  return (
    <div className="flex flex-col h-full" style={{ maxHeight: '80vh' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-800">#{ticket.id} {ticket.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
            <span className={`text-xs ${pr.cls}`}>{pr.label}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {CATEGORIES[ticket.category] || ticket.category || ''}
            {ticket.property_address && ` · ${ticket.property_address}`}
            {ticket.user_name && ` · ${ticket.user_name}`}
          </div>
        </div>
        {adminMode && onMetaChange && (
          <div className="flex gap-2 items-center">
            <select value={ticket.priority} onChange={e => onMetaChange('priority', e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1">
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={ticket.status} onChange={e => onMetaChange('status', e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1">
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}
        {!adminMode && ticket.status !== 'closed' && (
          <button onClick={close} className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded border">
            ✓ Затвори сигнала
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800 ml-2">✕</button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {(ticket.messages || []).map(m => {
          const isMine = adminMode ? m.author_role === 'admin' : m.author_role === 'tenant'
          const att = (ticket.attachments || []).filter(a => a.message_id === m.id)
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                isMine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}>
                <div className="whitespace-pre-wrap">{m.message}</div>
                {att.length > 0 && (
                  <div className={`mt-2 flex flex-wrap gap-1 ${isMine ? 'border-t border-blue-400' : 'border-t border-gray-200'} pt-2`}>
                    {att.map(a => (
                      <Attachment key={a.id} API={API} attachmentPath={attachmentPath} att={a} isMine={isMine} />
                    ))}
                  </div>
                )}
                <div className={`text-[10px] mt-1 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                  {m.author_name || m.author_username || (m.author_role === 'admin' ? 'Управителят' : 'Наемателят')} · {fmtAgo(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Reply */}
      {ticket.status !== 'closed' && (
        <div className="border-t bg-white p-3 space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs">
              {files.map((f, i) => (
                <span key={i} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
                  📎 {f.name}
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={reply} onChange={e => setReply(e.target.value)}
              placeholder="Напишете отговор..." rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              ref={fileRef} type="file" multiple accept="image/*,application/pdf"
              onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
              className="hidden"
            />
            <button onClick={() => fileRef.current?.click()} title="Прикачи файл"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-2 rounded-lg whitespace-nowrap">📎</button>
            <button onClick={send} disabled={sending || (!reply.trim() && !files.length)}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap">
              {sending ? '...' : 'Изпрати'}
            </button>
          </div>
        </div>
      )}
      {ticket.status === 'closed' && (
        <div className="border-t bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          Сигналът е затворен. {adminMode && 'Сменете статуса на "Отворен" за да отговорите.'}
        </div>
      )}
    </div>
  )
}

function Attachment({ API, attachmentPath, att, isMine }) {
  const url = authUrl(`${API}${attachmentPath}/${att.id}`)
  const isImg = (att.mime_type || '').startsWith('image/')
  if (isImg) {
    return (
      <a href={url} target="_blank" rel="noopener">
        <img src={url} alt={att.original_name} className="max-h-32 rounded border border-gray-200" />
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener"
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${isMine ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
      📎 {att.original_name || att.filename}
    </a>
  )
}
