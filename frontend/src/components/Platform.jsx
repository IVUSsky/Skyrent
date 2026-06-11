import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const TYPE_META = {
  news:    { icon: '📢', label: 'Новина' },
  offer:   { icon: '🎁', label: 'Оферта' },
  service: { icon: '🏠', label: 'Услуга' },
}

export default function Platform({ API = '' }) {
  const [stats, setStats] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [anns, setAnns] = useState([])
  const [leads, setLeads] = useState([])
  const [tab, setTab] = useState('clients') // clients | offers | leads
  const [form, setForm] = useState({ type: 'service', title: '', body: '', cta_label: 'Интересувам се' })
  const [msg, setMsg] = useState(null)

  const load = () => {
    apiFetch(`${API}/api/platform/stats`).then(r => r.json()).then(setStats).catch(() => {})
    apiFetch(`${API}/api/platform/orgs`).then(r => r.json()).then(d => setOrgs(Array.isArray(d) ? d : [])).catch(() => {})
    apiFetch(`${API}/api/platform/announcements`).then(r => r.json()).then(d => setAnns(Array.isArray(d) ? d : [])).catch(() => {})
    apiFetch(`${API}/api/platform/leads`).then(r => r.json()).then(d => setLeads(Array.isArray(d) ? d : [])).catch(() => {})
  }
  useEffect(load, [])

  const publish = () => {
    if (!form.title || !form.body) { setMsg('Заглавие и текст са задължителни'); return }
    apiFetch(`${API}/api/platform/announcements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).then(r => r.json()).then(d => {
      setMsg(d.ok ? '✓ Публикувано — клиентите ще го видят при следващото зареждане' : (d.error || 'Грешка'))
      if (d.ok) { setForm({ type: 'service', title: '', body: '', cta_label: 'Интересувам се' }); load() }
    })
  }

  const toggleActive = (a) =>
    apiFetch(`${API}/api/platform/announcements/${a.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !a.active }),
    }).then(load)

  if (!stats) return <div className="p-8 text-gray-400">Зарежда…</div>

  return (
    <div className="fin-surface p-6 max-w-6xl mx-auto">
      <div className="iv-mast mb-6">
        <div>
          <div className="iv-mast-eyebrow">Команден център</div>
          <h1 className="iv-mast-title">🛸 Платформа</h1>
        </div>
      </div>

      {/* бизнес метрики */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-7">
        <div className="kpi-card !p-3"><div className="kpi-label">Клиенти</div><div className="kpi-value !text-2xl">{stats.total}</div></div>
        <div className="kpi-card !p-3"><div className="kpi-label">💰 MRR</div><div className="kpi-value !text-2xl">{stats.mrr_eur}€</div></div>
        <div className="kpi-card !p-3"><div className="kpi-label">Платени</div><div className="kpi-value !text-2xl">{stats.paying}</div></div>
        <div className="kpi-card !p-3"><div className="kpi-label">Trial</div><div className="kpi-value !text-2xl">{stats.trial}</div></div>
        <div className="kpi-card !p-3"><div className="kpi-label">Нови 30д</div><div className="kpi-value !text-2xl">{stats.new_30d}</div></div>
        <div className="kpi-card !p-3"><div className="kpi-label">🎯 Leads</div><div className="kpi-value !text-2xl">{stats.leads_total}</div></div>
      </div>

      <div className="flex gap-2 mb-5">
        {[['clients', '👥 Клиенти'], ['offers', '📣 Оферти'], ['leads', '🎯 Leads']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
        ))}
      </div>

      {tab === 'clients' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>
              {['#', 'Организация', 'План', 'Статус', 'Имоти', 'Потр.', 'Owner имейл', 'Trial до', 'Последен вход'].map(h =>
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map(o => (
                <tr key={o.id} className={o.id === 1 ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-400">{o.id}</td>
                  <td className="px-3 py-2 font-medium">{o.name}{o.id === 1 && <span className="ml-1 text-xs text-amber-600">(платформа)</span>}</td>
                  <td className="px-3 py-2">{o.id === 1 ? '—' : o.plan}</td>
                  <td className="px-3 py-2">{o.status === 'active' ? '🟢' : '🔴'} {o.status}</td>
                  <td className="px-3 py-2 text-right">{o.property_count ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{o.user_count}</td>
                  <td className="px-3 py-2 text-gray-600">{o.owner_email || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.id === 1 ? '—' : (o.trial_ends_at || '—')}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.last_login ? String(o.last_login).slice(0, 16) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'offers' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold mb-3">Нова оферта / новина</h3>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2">
              <option value="service">🏠 Услуга (имоти / ремонт / дизайн / обзавеждане)</option>
              <option value="offer">🎁 Оферта / промо</option>
              <option value="news">📢 Новина / нова функция</option>
            </select>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Заглавие (напр. Ремонт и обзавеждане под ключ)"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2" />
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Текст на офертата…" rows={4}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2" />
            <input value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}
              placeholder="Бутон (напр. Интересувам се)"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-3" />
            <button onClick={publish} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Публикувай</button>
            {msg && <div className="text-sm text-gray-600 mt-2">{msg}</div>}
          </div>
          <div className="space-y-2">
            {anns.map(a => (
              <div key={a.id} className={`bg-white rounded-xl shadow p-3 ${!a.active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{TYPE_META[a.type]?.icon} {a.title}</div>
                    <div className="text-sm text-gray-600">{a.body}</div>
                    <div className="text-xs text-gray-400 mt-1">🎯 {a.lead_count} leads · {String(a.created_at).slice(0, 10)}</div>
                  </div>
                  <button onClick={() => toggleActive(a)}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 shrink-0">{a.active ? 'Спри' : 'Пусни'}</button>
                </div>
              </div>
            ))}
            {!anns.length && <div className="text-gray-400 text-sm">Няма публикувани оферти още.</div>}
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>
              {['Дата', 'Оферта', 'Организация', 'Потребител', 'Имейл', 'Бележка'].map(h =>
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{String(l.created_at).slice(0, 16)}</td>
                  <td className="px-3 py-2">{TYPE_META[l.announcement_type]?.icon} {l.announcement_title}</td>
                  <td className="px-3 py-2 font-medium">{l.org_name}</td>
                  <td className="px-3 py-2">{l.username}</td>
                  <td className="px-3 py-2"><a className="text-blue-600 underline" href={`mailto:${l.email}`}>{l.email}</a></td>
                  <td className="px-3 py-2 text-gray-600 max-w-[260px] truncate" title={l.note}>{l.note || '—'}</td>
                </tr>
              ))}
              {!leads.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Още няма leads — публикувай оферта 🎁</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
