import React, { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'

// Reusable notification bell — works for both admin (/api/notifications)
// и за tenant (/api/tenant/notifications).
//
// Props:
//   API           — base URL
//   basePath      — '/api/notifications' or '/api/tenant/notifications'
//   onNavigate    — (link, notif) => void  → handle "open the related thing"
//   darkHeader    — true ако се рендерира в тъмен header (admin)
//   pollMs        — refresh interval (default 60_000)
export default function NotificationBell({ API, basePath, onNavigate, darkHeader = false, pollMs = 60000 }) {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const popRef = useRef(null)

  const load = () => {
    apiFetch(`${API}${basePath}`)
      .then(r => r.json())
      .then(d => {
        setItems(Array.isArray(d?.items) ? d.items : [])
        setUnread(Number(d?.unread) || 0)
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    const id = setInterval(load, pollMs)
    return () => clearInterval(id)
  }, [API, basePath, pollMs])

  useEffect(() => {
    function onClickOutside(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const markAllRead = () => {
    apiFetch(`${API}${basePath}/mark-read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).then(load)
  }

  const onItemClick = (n) => {
    if (!n.read_at) {
      apiFetch(`${API}${basePath}/mark-read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).then(load)
    }
    setOpen(false)
    if (onNavigate && n.link) onNavigate(n.link, n)
  }

  const ICON = {
    ticket_new:     '🛟',
    ticket_reply:   '💬',
    ticket_status:  '🛟',
    addon_request:  '🛍️',
    addon_approved: '✅',
    addon_rejected: '❌',
    addon_stopped:  '⏹️',
    invoice_new:    '🧾',
    invoice_paid:   '💰',
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

  const btnClass = darkHeader
    ? 'relative text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors text-base'
    : 'relative text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors text-base'

  return (
    <div className="relative" ref={popRef}>
      <button onClick={() => setOpen(v => !v)} title="Известия" className={btnClass}>
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-50 text-sm">
          <div className="sticky top-0 bg-white border-b px-4 py-2 flex items-center justify-between">
            <div className="font-bold text-gray-800">Известия</div>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800">Маркирай всички като прочетени</button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">Няма известия.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map(n => (
                <li key={n.id}>
                  <button
                    onClick={() => onItemClick(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-blue-50 ${n.read_at ? 'opacity-70' : 'bg-blue-50/30'}`}>
                    <div className="text-lg shrink-0">{ICON[n.kind] || '🔔'}</div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-gray-800 ${n.read_at ? 'font-normal' : 'font-semibold'}`}>{n.title}</div>
                      {n.body && <div className="text-xs text-gray-500 truncate">{n.body}</div>}
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtAgo(n.created_at)}</div>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
