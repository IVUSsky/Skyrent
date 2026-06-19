import React, { useEffect, useState } from 'react'

// Публичен каталог под наем (БЕЗ login) — /imoti. Грид с обяви + филтри.
// Cross-org: /api/public/catalog събира обявите от всички наемодатели.

const PT_LABEL = { '1-стаен': 'Едностаен', '2-стаен': 'Двустаен', '3-стаен': 'Тристаен' }
const fmt = n => Number(n || 0).toLocaleString('bg-BG')

export default function Catalog({ API = '' }) {
  const [all, setAll] = useState(null)
  const [city, setCity] = useState('')
  const [type, setType] = useState('')
  const [max, setMax] = useState('')

  useEffect(() => { document.title = 'Имоти под наем | Skyrent' }, [])
  useEffect(() => {
    fetch(`${API}/api/public/catalog`).then(r => r.json()).then(d => setAll(Array.isArray(d) ? d : [])).catch(() => setAll([]))
  }, [])

  const list = (all || []).filter(x =>
    (!city || (x.район || '').toLowerCase().includes(city.toLowerCase()) || (x.адрес || '').toLowerCase().includes(city.toLowerCase())) &&
    (!type || x.тип === type) &&
    (!max || Number(x.наем) <= Number(max))
  )
  const types = [...new Set((all || []).map(x => x.тип).filter(Boolean))]

  return (
    <div style={S.wrap}>
      <div style={S.inner}>
        <header style={S.head}>
          <div>
            <div style={S.eyebrow}>Skyrent°</div>
            <h1 style={S.h1}>Имоти под наем</h1>
          </div>
          <div style={S.count}>{all ? `${list.length} обяви` : ''}</div>
        </header>

        {/* Filters */}
        <div style={S.filters}>
          <input style={S.input} placeholder="🔍 Град или район…" value={city} onChange={e => setCity(e.target.value)} />
          <select style={S.input} value={type} onChange={e => setType(e.target.value)}>
            <option value="">Всякакъв тип</option>
            {types.map(t => <option key={t} value={t}>{PT_LABEL[t] || t}</option>)}
          </select>
          <input style={S.input} type="number" placeholder="Макс. цена €" value={max} onChange={e => setMax(e.target.value)} />
        </div>

        {/* Grid */}
        {!all ? <div style={S.empty}>Зареждане…</div>
          : list.length === 0 ? <div style={S.empty}>Няма обяви по този филтър.</div>
          : (
            <div style={S.grid}>
              {list.map(x => (
                <a key={`${x.org_id}-${x.id}`} href={`/obiava/${x.org_id}-${x.id}`} style={S.card}>
                  <div style={S.thumbWrap}>
                    {x.photo
                      ? <img src={`${API}/api/public/listings/${x.org_id}/${x.id}/photo/${x.photo}`} alt="" style={S.thumb} />
                      : <div style={S.noThumb}>🏠</div>}
                    <div style={S.priceTag}>{fmt(x.наем)} €</div>
                    {x.video && <div style={S.videoTag}>🎥 видео</div>}
                  </div>
                  <div style={S.cardBody}>
                    <div style={S.cardTitle}>{PT_LABEL[x.тип] || x.тип || 'Имот'}{x.район ? ` · ${x.район}` : ''}</div>
                    <div style={S.cardMeta}>{x.площ ? `${x.площ} м²` : ''}{x.адрес ? ` · ${x.адрес}` : ''}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        <div style={S.foot}>Powered by <b style={{ color: '#15151e' }}>Skyrent</b>°</div>
      </div>
    </div>
  )
}

const BRASS = '#b8902f'
const S = {
  wrap: { minHeight: '100vh', background: '#f4f5f8', fontFamily: "'Manrope', system-ui, sans-serif", padding: '28px 16px' },
  inner: { maxWidth: 1100, margin: '0 auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, flexWrap: 'wrap', gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: BRASS },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 600, color: '#15151e', margin: '4px 0 0' },
  count: { fontSize: 14, color: '#6b7280' },
  filters: { display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' },
  input: { flex: '1 1 160px', minWidth: 140, border: '1px solid #d8dbe2', borderRadius: 10, padding: '11px 14px', fontSize: 14, fontFamily: 'inherit', background: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 18 },
  card: { display: 'block', textDecoration: 'none', color: 'inherit', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 18px -10px rgba(0,0,0,.2)', transition: 'transform .18s, box-shadow .18s' },
  thumbWrap: { position: 'relative', height: 180, background: '#0f0f17' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  noThumb: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: '#555' },
  priceTag: { position: 'absolute', bottom: 10, left: 10, background: 'rgba(21,21,30,.85)', color: '#e8c977', fontWeight: 700, fontSize: 15, padding: '5px 12px', borderRadius: 999 },
  videoTag: { position: 'absolute', top: 10, right: 10, background: 'rgba(21,21,30,.8)', color: '#fff', fontWeight: 600, fontSize: 11, padding: '4px 9px', borderRadius: 999 },
  cardBody: { padding: '14px 16px' },
  cardTitle: { fontWeight: 600, color: '#15151e', fontSize: 15.5, marginBottom: 3 },
  cardMeta: { fontSize: 13, color: '#6b7280' },
  empty: { textAlign: 'center', color: '#9aa0aa', padding: '60px 0' },
  foot: { textAlign: 'center', marginTop: 36, fontSize: 12.5, color: '#9aa0aa' },
}
