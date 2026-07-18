import { apiFetch, authUrl } from '../api'
import React, { useState, useEffect, useRef } from 'react'
import Inventory from './Inventory'
import UtilityHistoryChart from './UtilityHistoryChart'
import ApartmentKnowledge from './ApartmentKnowledge'

const STATUS_COLORS = {
  '✅': 'bg-green-100 text-green-800',
  '🔶': 'bg-yellow-100 text-yellow-800',
  '❌': 'bg-red-100 text-red-800',
}

const EMPTY_FORM = { адрес:'', район:'', статус:'✅', наем:0, наемател:'', площ:'', тип:'2-стаен', покупна:0, ремонт:0, market_val:'', owner_id:'' }

const fmt = (n) => (n || 0).toLocaleString('bg-BG')

export default function Portfolio({ API, role }) {
  const broker = role === 'broker' // недоверен лизинг агент — крие финансите (покупна/пазарна/собственик)
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState({ key: 'id', dir: 'asc' })   // сортиране на таблицата
  const [delConfirmProp, setDelConfirmProp] = useState(null)     // потвърждение за триене на имот
  const [editingProp, setEditingProp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)   // обединяване на дубликати
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [merging, setMerging] = useState(false)
  const [mergeMsg, setMergeMsg] = useState(null)
  const [propDeeds, setPropDeeds] = useState([])   // нотариални актове на редактирания имот
  const [newForm, setNewForm] = useState(EMPTY_FORM)
  const tableScrollRef = useRef()
  const topScrollRef   = useRef()
  const [tableWidth, setTableWidth] = useState(0)

  const [photosProp, setPhotosProp] = useState(null)
  const [pubOn, setPubOn] = useState(false)
  const [pubDesc, setPubDesc] = useState('')
  const [pubVideo, setPubVideo] = useState('')
  const [pubSaving, setPubSaving] = useState(false)
  const [inventoryProp, setInventoryProp] = useState(null)
  const [utilityProp, setUtilityProp] = useState(null)
  const [knowledgeProp, setKnowledgeProp] = useState(null)
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const photoInputRef = React.useRef()
  const [inquiries, setInquiries] = useState([])
  const [showInquiries, setShowInquiries] = useState(false)
  const [owners, setOwners] = useState([]) // Agency multi_owner; [] ако не е включено

  const loadInquiries = () => apiFetch(`${API}/api/properties/inquiries`)
    .then(r => r.json()).then(d => setInquiries(Array.isArray(d) ? d : [])).catch(() => {})

  // Собственици (само ако планът включва multi_owner — иначе 402 → празно, без селектор)
  useEffect(() => {
    apiFetch(`${API}/api/owners`).then(r => r.ok ? r.json() : []).then(d => setOwners(Array.isArray(d) ? d : [])).catch(() => setOwners([]))
  }, [])

  const load = () => {
    setLoading(true)
    apiFetch(`${API}/api/properties`)
      .then(r => r.json())
      .then(data => { setProperties(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  // Обединяване на дубликат (source) в имот за запазване (target)
  const doMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) { setMergeMsg({ type: 'error', text: 'Избери два различни имота' }); return }
    setMerging(true); setMergeMsg(null)
    try {
      const r = await apiFetch(`${API}/api/properties/merge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: Number(mergeSource), target_id: Number(mergeTarget) }),
      })
      const d = await r.json()
      if (!r.ok) { setMergeMsg({ type: 'error', text: d.error || 'Грешка' }); return }
      setMergeMsg({ type: 'success', text: `Обединено ✓${d.copied_fields?.length ? ` (копирани: ${d.copied_fields.join(', ')})` : ''}` })
      load()
      setTimeout(() => { setMergeOpen(false); setMergeSource(''); setMergeTarget(''); setMergeMsg(null) }, 1600)
    } catch (e) { setMergeMsg({ type: 'error', text: 'Грешка' }) } finally { setMerging(false) }
  }

  useEffect(() => { load(); loadInquiries() }, [])

  const toggleInquiry = (inq) => {
    apiFetch(`${API}/api/properties/inquiries/${inq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handled: inq.handled ? 0 : 1 }),
    }).then(() => loadInquiries())
  }
  const deleteInquiry = (inq) => {
    apiFetch(`${API}/api/properties/inquiries/${inq.id}`, { method: 'DELETE' }).then(() => loadInquiries())
  }

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTableWidth(el.scrollWidth))
    ro.observe(el)
    setTableWidth(el.scrollWidth)
    return () => ro.disconnect()
  }, [properties])

  const openEdit = (prop) => {
    setEditingProp(prop)
    setEditForm({
      адрес: prop['адрес'] || '',
      район: prop['район'] || '',
      наем: prop['наем'] || 0,
      наемател: prop['наемател'] || '',
      статус: prop['статус'] || '✅',
      market_val: prop.market_val || '',
      тип: prop['тип'] || '2-стаен',
      площ: prop['площ'] || '',
      покупна: prop['покупна'] || 0,
      ремонт: prop['ремонт'] || 0,
      owner_id: prop['owner_id'] || '',
      абонат_ток:  prop['абонат_ток']  || '',
      абонат_вода: prop['абонат_вода'] || '',
      абонат_тец:  prop['абонат_тец']  || '',
      абонат_вход: prop['абонат_вход'] || '',
      абонат_газ:  prop['абонат_газ']  || '',
    })
    // Нотариални актове на имота (admin only — брокерът няма достъп до /api/deeds)
    setPropDeeds([])
    if (!broker) apiFetch(`${API}/api/deeds?property_id=${prop.id}`).then(r => r.ok ? r.json() : []).then(d => setPropDeeds(Array.isArray(d) ? d : [])).catch(() => {})
  }

  const closeEdit = () => { setEditingProp(null); setEditForm({}); setPropDeeds([]) }

  const saveNew = () => {
    if (!newForm.адрес) return alert('Адресът е задължителен')
    setSaving(true)
    apiFetch(`${API}/api/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        адрес: newForm.адрес,
        район: newForm.район,
        статус: newForm.статус,
        наем: Number(newForm.наем) || 0,
        наемател: newForm.наемател,
        площ: newForm.площ !== '' ? Number(newForm.площ) : null,
        тип: newForm.тип,
        покупна: Number(newForm.покупна) || 0,
        ремонт: Number(newForm.ремонт) || 0,
        market_val: newForm.market_val !== '' ? Number(newForm.market_val) : null,
        owner_id: newForm.owner_id || null,
      }),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); setAddingNew(false); setNewForm(EMPTY_FORM); load() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  const saveEdit = () => {
    setSaving(true)
    console.log('Saving property:', editingProp.id, JSON.stringify(editForm))
    apiFetch(`${API}/api/properties/${editingProp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        адрес: editForm.адрес,
        район: editForm.район,
        наем: Number(editForm.наем) || 0,
        наемател: editForm.наемател,
        статус: editForm.статус,
        market_val: editForm.market_val !== '' ? Number(editForm.market_val) : null,
        тип: editForm.тип,
        площ: editForm.площ !== '' ? Number(editForm.площ) : null,
        покупна: editForm.покупна !== '' ? Number(editForm.покупна) : null,
        ремонт: editForm.ремонт !== '' ? Number(editForm.ремонт) : null,
        абонат_ток:  editForm.абонат_ток  || null,
        абонат_вода: editForm.абонат_вода || null,
        абонат_тец:  editForm.абонат_тец  || null,
        абонат_вход: editForm.абонат_вход || null,
        абонат_газ:  editForm.абонат_газ  || null,
        owner_id: editForm.owner_id || null,
      }),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); closeEdit(); load() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  const savePublish = (next) => {
    if (!photosProp) return
    setPubSaving(true)
    apiFetch(`${API}/api/properties/${photosProp.id}/publish`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: next, listing_desc: pubDesc, listing_video: pubVideo }),
    }).then(r => r.json()).then(() => { setPubOn(next); setPubSaving(false); load() })
      .catch(() => setPubSaving(false))
  }
  // org id от JWT (за линка към публичната обява)
  const orgId = (() => { try { return JSON.parse(atob((localStorage.getItem('skyrent_token') || '').split('.')[1])).organization_id || 1 } catch { return 1 } })()

  const openPhotos = (prop) => {
    setPhotosProp(prop)
    setPubOn(!!prop.published); setPubDesc(prop.listing_desc || ''); setPubVideo(prop.listing_video || '')
    apiFetch(`${API}/api/properties/${prop.id}/photos`)
      .then(r => r.json()).then(setPhotos)
  }

  const uploadPhotos = (files) => {
    if (!files.length) return
    setUploading(true)
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('photos', f))
    apiFetch(`${API}/api/properties/${photosProp.id}/photos`, { method: 'POST', body: fd })
      .then(r => r.json())
      .then(() => apiFetch(`${API}/api/properties/${photosProp.id}/photos`).then(r => r.json()).then(setPhotos))
      .finally(() => setUploading(false))
  }

  const updateCaption = (photoId, caption) => {
    apiFetch(`${API}/api/properties/${photosProp.id}/photos/${photoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption }),
    })
  }

  const deletePhoto = (photoId) => {
    apiFetch(`${API}/api/properties/${photosProp.id}/photos/${photoId}`, { method: 'DELETE' })
      .then(() => setPhotos(ph => ph.filter(p => p.id !== photoId)))
  }

  const totalRent = properties.filter(p => p['статус'] === '✅').reduce((s, p) => s + (p['наем'] || 0), 0)

  // Изтриване на имот (+ свързаните данни). Admin only.
  const deleteProperty = (id) => {
    apiFetch(`${API}/api/properties/${id}`, { method: 'DELETE' })
      .then(r => r.json()).then(d => {
        setDelConfirmProp(null)
        if (d.ok) setProperties(ps => ps.filter(p => p.id !== id))
        else setError(d.error || 'Грешка при триене')
      }).catch(() => setError('Грешка при триене'))
  }

  // Колони + сортиране (клик на заглавие)
  const NUM_KEYS = new Set(['id', 'наем', 'площ', 'cost', 'market_val'])
  const COLS = [
    { label: '#', key: 'id' },
    { label: 'Адрес', key: 'адрес' },
    { label: 'Район', key: 'район' },
    { label: 'Статус', key: 'статус' },
    { label: 'Наемател', key: 'наемател' },
    { label: 'Наем (EUR €)', key: 'наем' },
    { label: 'Площ м²', key: 'площ' },
    { label: 'Тип', key: 'тип' },
    ...(broker ? [] : [{ label: 'Покупна+Ремонт (EUR €)', key: 'cost' }, { label: 'Пазарна стойност (EUR €)', key: 'market_val' }]),
    { label: '', key: null },
  ]
  const sortVal = (p, k) => k === 'cost' ? (p['покупна'] || 0) + (p['ремонт'] || 0) + (p['ремонт_фактури'] || 0) : p[k]
  const sortedProps = [...properties].sort((a, b) => {
    const k = sort.key; if (!k) return 0
    let va = sortVal(a, k), vb = sortVal(b, k)
    let cmp
    if (NUM_KEYS.has(k)) cmp = (Number(va) || 0) - (Number(vb) || 0)
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'bg')
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const onSort = (k) => k && setSort(s => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))

  if (loading) return <div className="flex justify-center py-16 text-gray-500 text-lg">Зарежда...</div>
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Грешка: {error}</div>

  return (
    <div className="fin-surface">
      <header className="iv-mast mb-5">
        <div>
          <div className="iv-mast-eyebrow">Активи · имоти</div>
          <h2 className="iv-mast-title">Портфолио</h2>
        </div>
        <div className="flex items-center gap-3">
        <button
          onClick={() => { setAddingNew(true); setNewForm(EMPTY_FORM) }}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          + Добави имот
        </button>
        <button
          onClick={() => { setShowInquiries(true); loadInquiries() }}
          className="relative px-4 py-2 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors"
          title="Запитвания от каталога"
        >
          📨 Запитвания
          {inquiries.filter(i => !i.handled).length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
              {inquiries.filter(i => !i.handled).length}
            </span>
          )}
        </button>
        {!broker && (
          <button
            onClick={() => { setMergeOpen(true); setMergeSource(''); setMergeTarget(''); setMergeMsg(null) }}
            className="px-4 py-2 text-sm font-medium text-purple-800 bg-purple-50 border border-purple-300 hover:bg-purple-100 rounded-lg transition-colors"
            title="Обедини дубликати (напр. от нотариален акт)"
          >
            🔀 Обедини
          </button>
        )}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-gray-500">Общ месечен наем: </span>
          <span className="font-bold text-blue-700 text-base">{fmt(totalRent)} €</span>
        </div>
        </div>
      </header>

      {/* Обединяване на дубликати (напр. мазе, добавено два пъти от акт) */}
      {mergeOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">🔀 Обедини имоти</h3>
              <p className="text-xs text-gray-500 mt-1">За дубликати (напр. мазе, добавено два пъти от нотариален акт).</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-red-700 mb-1">Имот за ПРЕМАХВАНЕ (дубликат)</label>
                <select value={mergeSource} onChange={e => setMergeSource(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— избери —</option>
                  {properties.map(p => <option key={p.id} value={p.id}>#{p.id} · {p['адрес']}{p['тип'] ? ` (${p['тип']})` : ''}</option>)}
                </select>
              </div>
              <div className="text-center text-gray-400">↓ слива се в ↓</div>
              <div>
                <label className="block text-sm font-medium text-green-700 mb-1">Имот за ЗАПАЗВАНЕ</label>
                <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— избери —</option>
                  {properties.filter(p => String(p.id) !== String(mergeSource)).map(p => <option key={p.id} value={p.id}>#{p.id} · {p['адрес']}{p['тип'] ? ` (${p['тип']})` : ''}</option>)}
                </select>
              </div>
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Празните полета на запазвания се допълват от премахвания (площ, кадастрален идентификатор, абонатни №...). Всички връзки (актове, договори, снимки, история) се преместват. Дубликатът се <b>изтрива</b> — необратимо.
              </div>
              {mergeMsg && (
                <div className={`text-sm rounded-lg px-3 py-2 ${mergeMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>{mergeMsg.text}</div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
              <button onClick={doMerge} disabled={merging || !mergeSource || !mergeTarget}
                className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg">
                {merging ? 'Обединява…' : '🔀 Обедини'}
              </button>
              <button onClick={() => setMergeOpen(false)} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">Отказ</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {/* Top scrollbar */}
        <div ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ height: '12px' }}
          onScroll={() => { if (tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft }}>
          <div style={{ width: tableWidth, height: '1px' }} />
        </div>
        <div ref={tableScrollRef}
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 232px)' }}
          onScroll={() => { if (topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft }}>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {COLS.map(c => (
                  <th key={c.label} onClick={() => onSort(c.key)}
                    className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 ${c.key ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                    {c.label}{sort.key === c.key && c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedProps.map((p, i) => {
                const cost = (p['покупна'] || 0) + (p['ремонт'] || 0) + (p['ремонт_фактури'] || 0)
                return (
                  <tr key={p.id} onClick={() => openPhotos(p)} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}`}>
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{p.id}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{p['адрес']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['район']}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p['статус']] || 'bg-gray-100 text-gray-600'}`}>
                        {p['статус']}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[160px] truncate">{p['наемател']}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{p['наем'] ? fmt(p['наем']) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p['площ']}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p['тип']}</td>
                    {!broker && (
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                        {cost > 0 ? (
                          <>
                            <div className="font-medium text-gray-800">{fmt(cost)}{p['ремонт_фактури'] > 0 ? ' 🧾' : ''}</div>
                            {((p['ремонт'] || 0) + (p['ремонт_фактури'] || 0)) > 0 && (
                              <div className="text-[11px] text-gray-400">
                                покупна {fmt(p['покупна'] || 0)} · ремонт {fmt((p['ремонт'] || 0) + (p['ремонт_фактури'] || 0))}
                              </div>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    )}
                    {!broker && <td className="px-3 py-2 text-right text-gray-600">{p.market_val ? fmt(p.market_val) : '—'}</td>}
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors"
                          title="Редактирай"
                        >✏️</button>
                        <button
                          onClick={() => openPhotos(p)}
                          className="text-green-500 hover:text-green-700 hover:bg-green-50 p-1 rounded transition-colors"
                          title="Снимки"
                        >📷</button>
                        {p.published ? (
                          <a
                            href={`/obiava/${orgId}-${p.id}`}
                            target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-amber-700 hover:text-amber-900 hover:bg-amber-50 p-1 rounded transition-colors"
                            title="Виж публичната обява"
                          >🌐</a>
                        ) : null}
                        <button
                          onClick={() => setInventoryProp(p)}
                          className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1 rounded transition-colors"
                          title="Обзавеждане / инвентар"
                        >🛋️</button>
                        <button
                          onClick={() => setUtilityProp(p)}
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-1 rounded transition-colors"
                          title="Консумация и фактури"
                        >📊</button>
                        <button
                          onClick={() => setKnowledgeProp(p)}
                          className="text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 p-1 rounded transition-colors"
                          title="База знания за AI асистент"
                        >💡</button>
                        {!broker && (
                          delConfirmProp === p.id ? (
                            <span className="inline-flex items-center gap-1 ml-1">
                              <button onClick={e => { e.stopPropagation(); deleteProperty(p.id) }} className="text-xs px-1.5 py-0.5 bg-red-600 text-white rounded">Изтрий</button>
                              <button onClick={e => { e.stopPropagation(); setDelConfirmProp(null) }} className="text-xs text-gray-500">не</button>
                            </span>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); setDelConfirmProp(p.id) }}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors" title="Изтрий имота (+ данните му)">🗑</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-blue-50 border-t-2 border-blue-200">
              <tr>
                <td colSpan={5} className="px-3 py-3 font-semibold text-gray-700">Общо (активни)</td>
                <td className="px-3 py-3 text-right font-bold text-blue-700 text-base">{fmt(totalRent)} €</td>
                <td colSpan={4}></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add New Property Modal */}
      {addingNew && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Добави нов имот</h3>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              {[
                { label: 'Адрес *', key: 'адрес', type: 'text', placeholder: 'ул. Примерна 1, ап.5' },
                { label: 'Район', key: 'район', type: 'text', placeholder: 'напр. Младост 1' },
                { label: 'Наемател', key: 'наемател', type: 'text', placeholder: 'Име на наемател' },
                { label: 'Месечен наем (EUR €)', key: 'наем', type: 'number' },
                { label: 'Площ (м²)', key: 'площ', type: 'number', placeholder: 'кв. метра' },
                { label: 'Покупна цена (EUR €)', key: 'покупна', type: 'number' },
                { label: 'Ремонт (EUR €)', key: 'ремонт', type: 'number' },
                { label: 'Пазарна стойност (EUR €)', key: 'market_val', type: 'number', placeholder: 'По избор' },
              ].filter(f => !broker || !['покупна', 'ремонт', 'market_val'].includes(f.key)).map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={newForm[key]}
                    onChange={e => setNewForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder || ''}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    min={type === 'number' ? '0' : undefined}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип имот</label>
                <select value={newForm.тип} onChange={e => setNewForm(f => ({ ...f, тип: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                  {['1-стаен','2-стаен','3-стаен','Мезонет','Студио','Паркомясто','Гараж','Мазе','Друго'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {!broker && owners.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">👤 Собственик</label>
                  <select value={newForm.owner_id} onChange={e => setNewForm(f => ({ ...f, owner_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                    <option value="">— без собственик —</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select value={newForm.статус} onChange={e => setNewForm(f => ({ ...f, статус: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                  <option value="✅">✅ Активен</option>
                  <option value="🔶">🔶 В процес</option>
                  <option value="❌">❌ Неактивен</option>
                </select>
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setAddingNew(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Отказ
              </button>
              <button onClick={saveNew} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg">
                {saving ? 'Запазва...' : 'Добави'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photos Modal */}
      {photosProp && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">📷 Снимки на имота</h3>
                <p className="text-sm text-gray-500 mt-0.5">{photosProp['адрес']} — {photos.length} снимки</p>
              </div>
              <button onClick={() => setPhotosProp(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {/* Публикуване в каталога под наем */}
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-amber-900">🌐 Публична обява под наем</div>
                    <div className="text-xs text-amber-800 mt-0.5">Показва имота (цена + снимки) на публичен линк, за да намериш наемател по-бързо.</div>
                  </div>
                  <button onClick={() => savePublish(!pubOn)} disabled={pubSaving}
                    className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${pubOn ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-100'}`}>
                    {pubSaving ? '...' : pubOn ? '✓ Публикувана — спри' : 'Публикувай'}
                  </button>
                </div>
                <textarea value={pubDesc} onChange={e => setPubDesc(e.target.value)}
                  onBlur={() => pubOn && savePublish(true)}
                  placeholder="Кратко описание за обявата (по желание) — напр. обзаведен, до метро, юг..."
                  className="w-full mt-3 border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" rows={2} />
                <input type="url" value={pubVideo} onChange={e => setPubVideo(e.target.value)}
                  onBlur={() => pubOn && savePublish(true)}
                  placeholder="🎥 Видео линк (YouTube или Vimeo) — по желание"
                  className="w-full mt-2 border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" />
                <div className="text-[11px] text-amber-700 mt-1">Качи видеото в YouTube/Vimeo (може „unlisted") и постави линка — вгражда се в обявата без да тежи на системата.</div>
                {/* Винаги видимо правило — за да не се чудят наемодателите */}
                <div className="text-xs text-amber-700 mt-2">
                  ⚠️ В каталога се показват само <b>свободни</b> имоти. Ако полето „наемател" е попълнено, обявата се скрива автоматично (отдадените не се рекламират).
                </div>
                {pubOn && (
                  (photosProp['наемател'] && String(photosProp['наемател']).trim()) ? (
                    <div className="mt-2 rounded-lg bg-orange-100 border border-orange-300 px-3 py-2 text-xs text-orange-900">
                      🔒 <b>Обявата е СКРИТА</b> — имотът е отдаден (има наемател). За да се покаже в каталога: редактирай имота (✏️) и <b>изтрий стойността в „наемател"</b>.
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-green-700">✅ Видима в каталога</span>
                      <a href={`/obiava/${orgId}-${photosProp.id}`} target="_blank" rel="noreferrer"
                        className="text-sm font-medium text-amber-700 underline hover:text-amber-900">
                        Виж обявата →
                      </a>
                    </div>
                  )
                )}
              </div>

              {/* Upload zone */}
              <div
                className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center mb-5 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                onClick={() => photoInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); uploadPhotos(e.dataTransfer.files) }}
              >
                {uploading
                  ? <div className="text-blue-600 font-medium">Качва...</div>
                  : <>
                      <div className="text-3xl mb-2">📸</div>
                      <div className="text-sm font-medium text-blue-700">Натиснете или плъзнете снимки тук</div>
                      <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — до 10 MB на файл</div>
                    </>
                }
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => uploadPhotos(e.target.files)} />

              {/* Photo grid */}
              {photos.length === 0
                ? <div className="text-center text-gray-400 py-8">Няма качени снимки</div>
                : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photos.map(ph => (
                      <div key={ph.id} className="group relative">
                        <img
                          src={authUrl(`${API}/api/properties/${photosProp.id}/photos/${ph.id}/file`)}
                          alt={ph.caption || ''}
                          className="w-full h-36 object-cover rounded-lg border border-gray-200"
                          onError={e => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'; }}
                        />
                        <button
                          onClick={() => deletePhoto(ph.id)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Изтрий"
                        >×</button>
                        <input
                          type="text"
                          defaultValue={ph.caption || ''}
                          onBlur={e => updateCaption(ph.id, e.target.value)}
                          placeholder="Добави описание..."
                          className="w-full mt-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    ))}
                  </div>
              }

              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                💡 Снимките автоматично се включват в протокола за приемо-предаване при генериране на нов договор.
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setPhotosProp(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingProp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Редактирай имот</h3>
              <p className="text-sm text-gray-500 mt-1">{editingProp['адрес']}</p>
            </div>

            {/* Scrollable fields */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input
                  type="text"
                  value={editForm.адрес}
                  onChange={e => setEditForm(f => ({ ...f, адрес: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Адрес на имота"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Район</label>
                <input
                  type="text"
                  value={editForm.район}
                  onChange={e => setEditForm(f => ({ ...f, район: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Район"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select
                  value={editForm.статус}
                  onChange={e => setEditForm(f => ({ ...f, статус: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="✅">✅ Активен</option>
                  <option value="🔶">🔶 В процес</option>
                  <option value="❌">❌ Неактивен</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Наемател</label>
                <input
                  type="text"
                  value={editForm.наемател}
                  onChange={e => setEditForm(f => ({ ...f, наемател: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Име на наемател"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Месечен наем (EUR €)</label>
                <input
                  type="number"
                  value={editForm.наем}
                  onChange={e => setEditForm(f => ({ ...f, наем: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
              {!broker && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пазарна стойност (EUR €)</label>
                <input
                  type="number"
                  value={editForm.market_val}
                  onChange={e => setEditForm(f => ({ ...f, market_val: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                  placeholder="Оставете празно за използване на покупна цена"
                />
              </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип имот</label>
                <select
                  value={editForm.тип}
                  onChange={e => setEditForm(f => ({ ...f, тип: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['1-стаен','2-стаен','3-стаен','Мезонет','Студио','Паркомясто','Гараж','Мазе'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {!broker && owners.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">👤 Собственик</label>
                  <select value={editForm.owner_id || ''} onChange={e => setEditForm(f => ({ ...f, owner_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— без собственик —</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Площ (м²)</label>
                <input
                  type="number"
                  value={editForm.площ}
                  onChange={e => setEditForm(f => ({ ...f, площ: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.5"
                  placeholder="кв. метра"
                />
              </div>
              {!broker && (<>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Покупна цена (EUR €)</label>
                <input
                  type="number"
                  value={editForm.покупна}
                  onChange={e => setEditForm(f => ({ ...f, покупна: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ремонт (EUR €)</label>
                <input
                  type="number"
                  value={editForm.ремонт}
                  onChange={e => setEditForm(f => ({ ...f, ремонт: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="1"
                />
              </div>
              </>)}

              {/* Utility account numbers */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">Абонатни номера</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '⚡ Ток', key: 'абонат_ток' },
                    { label: '💧 Вода', key: 'абонат_вода' },
                    { label: '🔥 ТЕЦ', key: 'абонат_тец' },
                    { label: '🪔 Газ', key: 'абонат_газ' },
                    { label: '🏢 Входна такса', key: 'абонат_вход' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input
                        type="text"
                        value={editForm[key] || ''}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder="—"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {!broker && (
                <div className="border-t pt-4 mt-4">
                  <div className="text-sm font-semibold text-gray-700 mb-2">📜 Нотариални актове</div>
                  {propDeeds.length === 0
                    ? <div className="text-xs text-gray-400">Няма закачени актове. Качи в таб 📜 Актове.</div>
                    : <div className="space-y-1">
                        {propDeeds.map(d => (
                          <div key={d.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                            <span className="truncate">{d.deed_number || 'Акт'}{d.deed_date ? ` · ${d.deed_date}` : ''}{d.cadastral_id ? ` · ${d.cadastral_id}` : ''}</span>
                            <a href={authUrl(`${API}/api/deeds/${d.id}/pdf`)} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline ml-2 flex-shrink-0">📄 PDF</a>
                          </div>
                        ))}
                      </div>}
                </div>
              )}
            </div>

            {/* Fixed footer with buttons */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={closeEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Отказ
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {saving ? 'Запазва...' : 'Запази'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory modal */}
      {inventoryProp && (
        <Inventory API={API} property={inventoryProp} onClose={() => setInventoryProp(null)} />
      )}

      {/* Apartment knowledge modal (AI chat agent base) */}
      {knowledgeProp && (
        <ApartmentKnowledge API={API} property={knowledgeProp} onClose={() => setKnowledgeProp(null)} />
      )}

      {/* Utility history modal */}
      {utilityProp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4" onClick={() => setUtilityProp(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex justify-between items-center z-10">
              <h2 className="text-lg font-bold flex items-center gap-2">
                📊 Консумация — {utilityProp.адрес}
                {utilityProp.utility_accounts && utilityProp.utility_accounts !== '{}' && (
                  <span className="text-xs font-normal text-gray-500">
                    (партиди: {Object.entries(JSON.parse(utilityProp.utility_accounts || '{}'))
                      .map(([k, v]) => `${k}: ${v}`).join(', ')})
                  </span>
                )}
              </h2>
              <button onClick={() => setUtilityProp(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
              <UtilityHistoryChart propertyId={utilityProp.id} showAmounts={true} compact={false} />
            </div>
          </div>
        </div>
      )}

      {/* Запитвания от каталога */}
      {showInquiries && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4" onClick={() => setShowInquiries(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900">📨 Запитвания от каталога</h3>
              <button onClick={() => setShowInquiries(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              {inquiries.length === 0
                ? <div className="text-center text-gray-400 py-10">Все още няма запитвания. Появяват се, когато някой се свърже от обява в каталога.</div>
                : <div className="space-y-3">
                    {inquiries.map(inq => (
                      <div key={inq.id} className={`rounded-lg border p-3 ${inq.handled ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex justify-between items-start gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{inq.name}</div>
                            <div className="text-sm text-gray-700">
                              {inq.phone && <a href={`tel:${inq.phone}`} className="text-blue-700 hover:underline mr-3">📞 {inq.phone}</a>}
                              {inq.email && <a href={`mailto:${inq.email}`} className="text-blue-700 hover:underline">✉️ {inq.email}</a>}
                            </div>
                            {inq.message && <div className="text-sm text-gray-600 mt-1">„{inq.message}"</div>}
                            <div className="text-xs text-gray-400 mt-1">
                              {inq.property_address || 'имот'} · {(inq.created_at || '').slice(0, 16).replace('T', ' ')}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => toggleInquiry(inq)}
                              className={`text-xs px-2 py-1 rounded border ${inq.handled ? 'bg-white text-gray-600 border-gray-300' : 'bg-green-600 text-white border-green-600 hover:bg-green-700'}`}>
                              {inq.handled ? '↩ Върни' : '✓ Обработено'}
                            </button>
                            <button onClick={() => deleteInquiry(inq)} className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">🗑</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
