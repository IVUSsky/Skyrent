import React, { useEffect, useState } from 'react'
import { apiFetch, authUrl } from '../api'

// 📜 Нотариални актове — качваш PDF/JPEG акт → Claude извлича текст + данни →
// съхранява като PDF → обновява имота и предлага добавяне на допълнителни
// единици (мазета/паркоместа) към портфолиото.

const fmt = (n) => Number(n || 0).toLocaleString('bg-BG', { maximumFractionDigits: 2 })

export default function Deeds({ API = '' }) {
  const [files, setFiles] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState(null)
  const [propertyId, setPropertyId] = useState('')
  const [updates, setUpdates] = useState({ адрес: '', тип: '', площ: '', cadastral_id: '' })
  const [units, setUnits] = useState([])
  const [applying, setApplying] = useState(false)
  const [deeds, setDeeds] = useState([])
  const [showText, setShowText] = useState(false)
  const [toast, setToast] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)
  const [props, setProps] = useState([])         // за име на свързания имот
  const [detail, setDetail] = useState(null)      // преглед на запазен акт

  const showToast = (m, t = 'success') => { setToast({ m, t }); setTimeout(() => setToast(null), 3500) }
  const loadDeeds = () => apiFetch(`${API}/api/deeds`).then(r => r.json()).then(d => setDeeds(Array.isArray(d) ? d : [])).catch(() => {})
  useEffect(() => {
    loadDeeds()
    apiFetch(`${API}/api/properties`).then(r => r.json()).then(d => setProps(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  const propName = (id) => props.find(p => p.id === id)?.['адрес'] || (id ? `имот #${id}` : '—')

  const openDetail = async (d) => {
    setDetail({ ...d, loading: true })
    try {
      const r = await apiFetch(`${API}/api/deeds/${d.id}/text`)
      const t = await r.json()
      setDetail({ ...d, loading: false, text: t.text || '', data: t.data || null })
    } catch (e) { setDetail({ ...d, loading: false, text: '', data: null }) }
  }

  const extract = async () => {
    if (!files.length) { showToast('Избери PDF или снимки на акта', 'error'); return }
    setExtracting(true); setResult(null); setShowText(false); setErrorDetail(null)
    try {
      const fd = new FormData(); files.forEach(f => fd.append('files', f))
      const r = await apiFetch(`${API}/api/deeds/extract`, { method: 'POST', body: fd })
      const text = await r.text()
      let d = null
      try { d = JSON.parse(text) } catch (_) {}
      if (!r.ok || !d) {
        setErrorDetail(d
          ? { http_status: r.status, error: d.error, ...(d.debug || {}) }
          : { http_status: r.status, raw_response: (text || '(празен отговор)').slice(0, 900) })
        showToast((d && d.error) || `Грешка (HTTP ${r.status})`, 'error')
        return
      }
      setResult(d)
      setPropertyId(d.suggested_property?.id || '')
      const m = d.extracted?.main_unit || {}
      setUpdates({ адрес: m.address || '', тип: m.type || '', площ: m.area ?? '', cadastral_id: m.cadastral_id || '' })
      const shortAddr = (m.address || '').split(',').slice(0, 2).join(',').trim()
      setUnits((d.extracted?.additional_units || []).map(u => ({
        ...u, selected: true,
        адрес: `${shortAddr}${shortAddr ? ' — ' : ''}${u.description || u.type || 'мазе'}`,
      })))
      showToast('Данните са извлечени — прегледай ги преди запазване')
    } catch (e) { setErrorDetail({ network_error: String(e?.message || e) }); showToast('Мрежова грешка: ' + (e?.message || e), 'error') } finally { setExtracting(false) }
  }

  const apply = async () => {
    setApplying(true)
    try {
      const new_units = units.filter(u => u.selected).map(u => ({
        адрес: u.адрес || (u.description || u.type || 'Мазе'),
        тип: u.type || 'Мазе', площ: u.area || '', район: '', cadastral_id: u.cadastral_id || '',
      }))
      const body = { property_id: propertyId || null, updates: propertyId ? updates : null, new_units }
      const r = await apiFetch(`${API}/api/deeds/${result.deed_id}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); return }
      showToast(`Запазено ✓${d.added?.length ? ` — добавени ${d.added.length} нови единици` : ''}`)
      setResult(null); setFiles([]); loadDeeds()
    } catch (e) { showToast('Грешка', 'error') } finally { setApplying(false) }
  }

  const delDeed = (id) => apiFetch(`${API}/api/deeds/${id}`, { method: 'DELETE' }).then(() => loadDeeds())

  const m = result?.extracted?.main_unit || {}
  const deed = result?.extracted?.deed || {}

  return (
    <div className="space-y-4">
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow text-white text-sm ${toast.t === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.m}</div>}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <strong>📜 Нотариални актове</strong> — качи акт (PDF или снимка). Системата извлича целия текст + данните, съхранява го като PDF, обновява имота и ако открие <strong>допълнителни единици</strong> (мазета, паркоместа) те пита дали да ги добави.
      </div>

      {/* Качване */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
        <h3 className="font-bold text-gray-800 mb-3">Качи акт</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" multiple accept=".pdf,image/jpeg,image/png" onChange={e => setFiles([...e.target.files])}
            className="text-sm file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-800" />
          {files.length > 0 && <span className="text-xs text-gray-600">{files.length} файл{files.length > 1 ? 'а' : ''} избран{files.length > 1 ? 'и' : ''}</span>}
          <button onClick={extract} disabled={extracting || !files.length}
            className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg">
            {extracting ? '⏳ Извличане…' : '✨ Извлечи данните'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">PDF или няколко снимки (страници на един акт) · до 25 MB всяка · четат се заедно с AI (прегледай преди запазване)</p>
      </div>

      {/* Диагностика при провал — показва реалния отговор на AI */}
      {errorDetail && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
          <div className="font-semibold text-red-800 mb-2">⚠️ Диагностика (копирай и прати)</div>
          <pre className="text-[11px] text-red-900 bg-white border border-red-100 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap">{JSON.stringify(errorDetail, null, 2)}</pre>
        </div>
      )}

      {/* Резултат от извличането */}
      {result && (
        <div className="bg-white rounded-xl shadow border border-amber-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Извлечени данни</h3>
            <a href={authUrl(`${API}/api/deeds/${result.deed_id}/pdf`)} target="_blank" rel="noreferrer"
              className="text-xs text-amber-700 hover:underline">📄 Виж съхранения PDF</a>
          </div>

          {/* Акт инфо */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Info label="Акт №" val={deed.number} />
            <Info label="Дата" val={deed.date} />
            <Info label="Нотариус" val={deed.notary} />
            <Info label="Собственик(ци)" val={(result.extracted?.owners || []).join(', ')} />
          </div>

          {/* Свързване с имот + обновления */}
          <div className="border-t pt-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Свържи с имот (обнови данните му)</label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1">
              <option value="">— не свързвай (само запази акта) —</option>
              {(result.properties || []).map(p => <option key={p.id} value={p.id}>{p['адрес']}</option>)}
            </select>
            {result.suggested_property && String(propertyId) === String(result.suggested_property.id) &&
              <p className="text-xs text-green-700 mb-2">✓ Авто-съответствие по {m.cadastral_id ? 'кадастрален идентификатор' : 'адрес'}</p>}

            {propertyId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {[['адрес', 'Адрес'], ['тип', 'Тип'], ['площ', 'Площ (м²)'], ['cadastral_id', 'Кадастрален идентификатор']].map(([k, l]) => (
                  <div key={k}>
                    <label className="block text-[11px] text-gray-500 mb-1">{l}</label>
                    <input value={updates[k] ?? ''} onChange={e => setUpdates(u => ({ ...u, [k]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Допълнителни единици */}
          {units.length > 0 && (
            <div className="border-t pt-4">
              <div className="text-sm font-semibold text-gray-800 mb-1">🔎 Намерени допълнителни единици ({units.length})</div>
              <p className="text-xs text-gray-500 mb-3">Избери кои да добавя като нови имоти в портфолиото:</p>
              <div className="space-y-2">
                {units.map((u, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${u.selected ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={u.selected} onChange={e => setUnits(arr => arr.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} className="w-4 h-4" />
                      <span className="text-sm font-medium text-gray-800">{u.type || 'Единица'}{u.area ? ` · ${fmt(u.area)} м²` : ''}{u.description ? ` · ${u.description}` : ''}</span>
                    </label>
                    {u.selected && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-6">
                        <input value={u['адрес'] || ''} onChange={e => setUnits(arr => arr.map((x, j) => j === i ? { ...x, ['адрес']: e.target.value } : x))} placeholder="Адрес/име" className="border border-gray-300 rounded px-2 py-1 text-xs sm:col-span-2" />
                        <input value={u.area || ''} onChange={e => setUnits(arr => arr.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} placeholder="Площ м²" className="border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Целият текст */}
          <div className="border-t pt-3">
            <button onClick={() => setShowText(s => !s)} className="text-xs text-gray-500 hover:text-gray-700">{showText ? '▲ Скрий' : '▼ Покажи'} извлечения текст</button>
            {showText && <pre className="mt-2 text-[11px] text-gray-600 bg-gray-50 border rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap">{result.extracted?.full_text || '(няма)'}</pre>}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={apply} disabled={applying}
              className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
              {applying ? 'Запазва…' : '✓ Потвърди и запази'}
            </button>
            <button onClick={() => { setResult(null); setFiles([]) }} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">Отказ</button>
          </div>
        </div>
      )}

      {/* Списък качени актове */}
      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>{['Дата на акта', 'Акт №', 'Нотариус', 'Идентификатор', 'Площ', 'Имот', 'Собственик', 'PDF', ''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {deeds.length === 0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400 text-sm">Няма качени актове още</td></tr>
              : deeds.map(d => (
                <tr key={d.id} onClick={() => openDetail(d)} className="hover:bg-blue-50 cursor-pointer" title="Виж детайлите">
                  <td className="px-3 py-2 text-xs">{d.deed_date || '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-[160px] truncate">{d.deed_number || '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-[140px] truncate">{d.notary || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.cadastral_id || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right">{d.area ? fmt(d.area) + ' м²' : '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-[160px] truncate">{propName(d.property_id)}</td>
                  <td className="px-3 py-2 text-xs max-w-[160px] truncate">{d.owner_name || '—'}</td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}><a href={authUrl(`${API}/api/deeds/${d.id}/pdf`)} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline text-xs">📄</a></td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}><button onClick={() => delDeed(d.id)} className="text-red-500 hover:text-red-700 text-xs">🗑</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Детайли на запазен акт */}
      {detail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900">📜 Акт {detail.deed_number || ''}</h3>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto space-y-3 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Info label="Дата" val={detail.deed_date} />
                <Info label="Нотариус" val={detail.notary} />
                <Info label="Свързан имот" val={propName(detail.property_id)} />
                <Info label="Идентификатор" val={detail.cadastral_id} />
                <Info label="Площ" val={detail.area ? fmt(detail.area) + ' м²' : ''} />
                <Info label="Собственик" val={detail.owner_name} />
              </div>
              {detail.data?.additional_units?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Допълнителни единици</div>
                  {detail.data.additional_units.map((u, i) => (
                    <div key={i} className="text-xs text-gray-700">• {u.type}{u.area ? ` · ${fmt(u.area)} м²` : ''}{u.cadastral_id ? ` · ${u.cadastral_id}` : ''}{u.description ? ` — ${u.description}` : ''}</div>
                  ))}
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Пълен текст {detail.loading ? '(зареждане…)' : ''}</div>
                <pre className="text-[11px] text-gray-600 bg-gray-50 border rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap">{detail.loading ? '…' : (detail.text || '(няма извлечен текст — напр. сканиран PDF без текстов слой)')}</pre>
              </div>
              <a href={authUrl(`${API}/api/deeds/${detail.id}/pdf`)} target="_blank" rel="noreferrer" className="inline-block text-sm text-amber-700 hover:underline">📄 Отвори съхранения PDF</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, val }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-800 truncate">{val || '—'}</div>
    </div>
  )
}
