import React, { useEffect, useState } from 'react'
import { setCanonical } from '../lib/seo'

// Позиционираща страница за Skyrent — "Private Wealth Terminal" посока:
// ink + brass, редакторски serif (Playfair Display), кирилица. Самостоятелна,
// scoped под .skylp (не пипа основната тема). Без външни зависимости.

const PILLARS = [
  {
    k: '01', icon: '↻',
    title: 'Парите идват сами',
    body: 'SEPA автоплащане, авто-фактура при всяко плащане и банков импорт, който сам разпознава и категоризира преводите. Спираш да гониш наеми.',
  },
  {
    k: '02', icon: '◇',
    title: 'Наемателите се обслужват сами',
    body: 'Собствен портал и AI асистент 24/7 — плащане, договор, сметки, заявки за ремонт. Телефонът ти спира да звъни.',
  },
  {
    k: '03', icon: '▤',
    title: 'Счетоводство, изрядно по БГ',
    body: 'Коректна номерация на фактурите, сума „словом", ДДС и автоматично подаване към счетоводителя. Готово за проверка.',
  },
]

const CAPS = [
  ['Tenant портал', 'Самообслужване за наемателите — в техния език'],
  ['Stripe / SEPA', 'Карти, директен дебит и автоплащане на наема'],
  ['Банков импорт', 'Авто-категоризация и правила, които се самоучат'],
  ['Договори + е-данни', 'Шаблони, ID карта чрез камера, авто-попълване'],
  ['Интернет препродажба', 'Допълнителен приход от твоите имоти'],
  ['Здраве на данните', 'Двигател, който лови грешки преди теб'],
]

const PLANS = [
  { id: 'basic', name: 'Basic', price: 'Безплатно', note: 'до 5 имота', desc: 'Имоти, фактури, разходи, отчети.', feats: ['Управление на имоти', 'Фактури и разходи', 'Годишни отчети'], cta: 'Започни безплатно' },
  { id: 'pro', name: 'Pro', price: '€24', unit: '/мес', note: 'неограничено', desc: 'Бизнесът върви сам.', feats: ['Всичко от Basic', 'Онлайн плащания + автопл.', 'Tenant портал + AI агент', 'Банков авто-импорт'], cta: 'Вземи Pro', featured: true },
  { id: 'agency', name: 'Agency', price: '€49', unit: '/мес', note: 'за агенции', desc: 'За екипи и чужди портфейли.', feats: ['Всичко от Pro', 'Мулти-собственик', 'White-label', 'Приоритетна поддръжка'], cta: 'За агенции' },
]

// Сравнение функция-по-функция (за да е ясно какво дава плащането).
const CMP = [
  { label: 'Брой имоти', basic: 'до 5', pro: 'неогранич.', agency: 'неогранич.' },
  { label: 'Потребители (екип)', basic: '1', pro: '3', agency: 'неогранич.' },
  { label: 'Имоти, фактури, договори, разходи, отчети', basic: true, pro: true, agency: true },
  { label: 'Онлайн плащания (карта + SEPA автоплащане)', basic: false, pro: true, agency: true },
  { label: 'Tenant портал + AI асистент', basic: false, pro: true, agency: true },
  { label: 'Банков авто-импорт на извлечения', basic: false, pro: true, agency: true },
  { label: 'Интернет препродажба', basic: false, pro: true, agency: true },
  { label: 'Мулти-собственик (чужди портфейли)', basic: false, pro: false, agency: true },
  { label: 'White-label брандинг', basic: false, pro: false, agency: true },
  { label: 'Приоритетна поддръжка', basic: false, pro: false, agency: true },
]

const CMP_OK = '#d8b25a', CMP_NO = '#5b574f', CMP_TXT = '#ece7dc', CMP_LINE = 'rgba(236,231,220,.12)'
function CmpCell({ v }) {
  if (v === true) return <span style={{ color: CMP_OK, fontWeight: 800, fontSize: 16 }}>✓</span>
  if (v === false) return <span style={{ color: CMP_NO, fontSize: 16 }}>–</span>
  return <span style={{ color: CMP_TXT, fontWeight: 600, fontSize: 12.5 }}>{v}</span>
}

// Новото лого: „sky·rent" — Unbounded ExtraBold като векторни контури (не зависи
// от шрифтове). НА САЙТА: sky + точката в brass (златото на темата), rent в cream —
// логото се адаптира към палитрата на страницата. Синята версия остава за FB/социални.
export function SkyLogo({ height = 26, rent = '#ece7dc', sky = '#e0bd6e' }) {
  return (
    <svg viewBox="0 0 438 100" height={height} style={{ display: 'block' }} role="img" aria-label="skyrent">
      <path transform="translate(1 0)" fill={sky} d="M59.120 64.720Q59.120 70.240 55.720 73.920Q52.320 77.600 46.120 79.480Q39.920 81.360 31.440 81.360Q22.720 81.360 16.160 79.280Q9.600 77.200 5.840 73.400Q2.080 69.600 1.840 64.560L20.480 64.560Q22.160 69.600 32.400 69.600Q41.280 69.600 41.280 66.560Q41.280 65.200 39.480 64.560Q37.680 63.920 33.440 63.600L25.680 63.040Q17.200 62.480 12.280 60.640Q7.360 58.800 5.200 55.760Q3.040 52.720 3.040 48.560Q3.040 43.280 6.400 39.760Q9.760 36.240 15.800 34.520Q21.840 32.800 29.840 32.800Q37.760 32.800 43.920 34.800Q50.080 36.800 53.800 40.400Q57.520 44 58.160 48.800L39.520 48.800Q38.880 46.720 36.360 45.320Q33.840 43.920 29.040 43.920Q20.960 43.920 20.960 46.880Q20.960 48.160 22.200 48.800Q23.440 49.440 26.880 49.680L37.280 50.400Q45.520 50.960 50.320 52.720Q55.120 54.480 57.120 57.480Q59.120 60.480 59.120 64.720" />
      <path transform="translate(62.86 0)" fill={sky} d="M61.760 80L41.280 80L33.040 65.600L20.480 80L4.160 80L4.160 18.400L22.480 18.400L22.480 57.840L41.680 34.160L60.560 34.160L44.880 52.160" />
      <path transform="translate(124.40 0)" fill={sky} d="M27.760 74.800L19.520 74.800L0.640 34.160L20.800 34.160L32.480 63.280L44.480 34.160L63.920 34.160L42.480 80.160Q39.920 85.600 36.400 88.760Q32.880 91.920 28.800 93.240Q24.720 94.560 20.560 94.560Q15.120 94.560 11 93.280Q6.880 92 2.880 89.040L2.880 76.560Q6.880 79.120 10.320 80.240Q13.760 81.360 17.840 81.360Q21.200 81.360 23.720 79.960Q26.240 78.560 27.760 74.800" />
      <path transform="translate(188.66 0)" fill={sky} d="M12.800 60.720Q10 60.720 7.720 59.400Q5.440 58.080 4.080 55.800Q2.720 53.520 2.720 50.640Q2.720 47.840 4.080 45.560Q5.440 43.280 7.720 41.920Q10 40.560 12.800 40.560Q15.600 40.560 17.920 41.920Q20.240 43.280 21.560 45.560Q22.880 47.840 22.880 50.640Q22.880 53.520 21.560 55.800Q20.240 58.080 17.920 59.400Q15.600 60.720 12.800 60.720" />
      <path transform="translate(214.76 0)" fill={rent} d="M5.120 49.840L2 34.160L20.720 34.160L22.720 46.080Q24.800 40.240 28.560 36.520Q32.320 32.800 38.800 32.800Q41.280 32.800 44.320 33.280L44.320 48.880Q41.760 48.400 39.640 48.200Q37.520 48 35.760 48Q32.480 48 29.680 49.240Q26.880 50.480 25.160 53.480Q23.440 56.480 23.440 61.760L23.440 80L5.120 80" />
      <path transform="translate(260.78 0)" fill={rent} d="M31.600 81.360Q23.120 81.360 16.480 78.320Q9.840 75.280 6 69.760Q2.160 64.240 2.160 56.880Q2.160 49.680 5.880 44.240Q9.600 38.800 16 35.800Q22.400 32.800 30.480 32.800Q38.800 32.800 44.760 36.360Q50.720 39.920 53.880 46.520Q57.040 53.120 57.040 62.080L22.320 62.080Q26 68.080 37.120 68.080Q42.080 68.080 46.960 66.880Q51.840 65.680 55.840 63.360L55.840 74.720Q50.960 77.920 44.920 79.640Q38.880 81.360 31.600 81.360M31.120 45.440Q27.360 45.440 24.840 47.120Q22.320 48.800 21.360 51.600L40.320 51.600Q38 45.440 31.120 45.440" />
      <path transform="translate(320.64 0)" fill={rent} d="M5.120 50.320L2 34.160L20.320 34.160L21.840 43.280Q24.880 38.080 29.600 35.440Q34.320 32.800 39.760 32.800Q46.480 32.800 51.160 35.440Q55.840 38.080 58.320 42.920Q60.800 47.760 60.800 54.240L60.800 80L42.400 80L42.400 56.880Q42.400 52.400 40.040 50Q37.680 47.600 33.360 47.600Q28.720 47.600 26.080 50.400Q23.440 53.200 23.440 58.080L23.440 80L5.120 80" />
      <path transform="translate(385.54 0)" fill={rent} d="M9.600 47.600L0.480 47.600L0.480 39.680L9.600 35.520L17.600 21.760L28 21.760L28 34.160L46.560 34.160L46.560 47.600L28 47.600L28 59.040Q28 63.760 29.800 65.640Q31.600 67.520 36.880 67.520Q40.160 67.520 42.720 67Q45.280 66.480 47.360 65.680L47.360 79.200Q44.720 80.080 40.840 80.720Q36.960 81.360 32.640 81.360Q20.800 81.360 15.200 76.040Q9.600 70.720 9.600 61.520" />
    </svg>
  )
}

const API = import.meta.env.VITE_API_URL || ''

export default function LandingPage({ onEnter }) {
  const [listings, setListings] = useState([])
  useEffect(() => {
    setCanonical('/')
    document.title = 'Skyrent — операционна система за наемния бизнес'
    // Свободни имоти за секцията (тийзър от публичния каталог).
    // ВАЖНО: пълен API URL — frontend и API са на различни домейни.
    fetch(`${API}/api/public/catalog`).then(r => r.json())
      .then(d => setListings(Array.isArray(d) ? d : []))
      .catch(() => setListings([]))
  }, [])
  return (
    <div className="skylp">
      <style>{CSS}</style>
      <div className="skylp-grain" aria-hidden />
      <div className="skylp-glow" aria-hidden />

      {/* Nav */}
      <nav className="lp-nav">
        <a href="/" style={{ textDecoration: 'none' }} aria-label="skyrent — начало"><SkyLogo height={24} /></a>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a className="lp-navlink" href="/blog">Блог</a>
          <a className="lp-navlink" href="/remonti">Ремонти</a>
          <a className="lp-navlink" href="/imoti">Свободни имоти</a>
          <button className="lp-ghost" onClick={onEnter}>Вход</button>
        </div>
      </nav>

      {/* Hero */}
      <header className="lp-hero">
        <div className="lp-eyebrow rise" style={{ '--d': '.05s' }}>Операционна система за наемния бизнес</div>
        <h1 className="lp-h1 rise" style={{ '--d': '.12s' }}>
          Не тефтер за наеми.<br /><em>Машина, която върви сама.</em>
        </h1>
        <p className="lp-sub rise" style={{ '--d': '.2s' }}>
          Наемите се събират автоматично, наемателите се обслужват сами, а счетоводството
          е изрядно по български. За наемодатели и агенции, които искат бизнесът да работи без тях.
        </p>
        <div className="lp-cta-row rise" style={{ '--d': '.28s' }}>
          <button className="lp-brass" onClick={onEnter}>Започни безплатно →</button>
          <button className="lp-ghost lg" onClick={onEnter}>Вход</button>
        </div>

        {/* Faux terminal */}
        <div className="lp-term rise" style={{ '--d': '.4s' }}>
          <div className="lp-term-bar"><span /><span /><span /><div className="lp-term-title">наеми · март</div></div>
          <div className="lp-term-body">
            {[
              ['Ап. 12 · Лозенец', '€640', 'платено'],
              ['Студио · Младост', '€430', 'платено'],
              ['Ап. 4 · Център', '€820', 'автопл.'],
              ['Гарсониера · Изток', '€390', 'изпратена'],
            ].map(([a, b, c], i) => (
              <div className="lp-row" key={i} style={{ '--d': `${0.5 + i * 0.08}s` }}>
                <span className="lp-row-a">{a}</span>
                <span className="lp-row-b">{b}</span>
                <span className={`lp-tag ${c === 'платено' || c === 'автопл.' ? 'ok' : ''}`}>{c}</span>
              </div>
            ))}
            <div className="lp-term-foot"><span>Събрано този месец</span><b>€2 280</b></div>
          </div>
        </div>
      </header>

      {/* Pillars */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <span className="lp-kick">Ровът</span>
          <h2 className="lp-h2">Три неща, които конкурентите не правят.</h2>
        </div>
        <div className="lp-pillars">
          {PILLARS.map((p) => (
            <article className="lp-pillar" key={p.k}>
              <div className="lp-pillar-top"><span className="lp-pillar-icon">{p.icon}</span><span className="lp-pillar-k">{p.k}</span></div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Ledger vs System */}
      <section className="lp-contrast">
        <div className="lp-contrast-col muted">
          <div className="lp-contrast-label">Повечето софтуери</div>
          <p>Дневник. Записваш ръчно, гониш наеми, събираш документи, броиш на калкулатор.</p>
        </div>
        <div className="lp-contrast-div">срещу</div>
        <div className="lp-contrast-col">
          <div className="lp-contrast-label gold">Skyrent</div>
          <p>Система. Плащанията влизат сами, наемателят се обслужва сам, счетоводството е готово.</p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <span className="lp-kick">Под капака</span>
          <h2 className="lp-h2">Дълбочина, а не таблица.</h2>
        </div>
        <div className="lp-caps">
          {CAPS.map(([t, d]) => (
            <div className="lp-cap" key={t}>
              <div className="lp-cap-dot" />
              <div><b>{t}</b><span>{d}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* За нас — доверие: наемодатели, не софтуерна фирма */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <span className="lp-kick">Кои сме ние</span>
          <h2 className="lp-h2">Наемодатели, не софтуерна фирма.</h2>
        </div>
        <div className="lp-about">
          <p>
            Sky Capital управлява <b>38 собствени имота</b> в София — апартаменти, гаражи, складове.
            Години наред ги следяхме както всички: Excel, папки с договори, банкови извлечения на ръка.
          </p>
          <p>
            После си построихме система. Банков импорт, защото ни писна да сверяваме. Портал за наематели,
            защото телефонът не спираше. Готова данъчна справка, защото април идваше все изневиделица.
          </p>
          <p>
            Skyrent е тази система. Ползваме я всеки ден — със собствените си пари и собствените си наематели.
            Ако тя се счупи, нашият бизнес спира пръв.
          </p>
          <p className="lp-about-punch"><em>Това е разликата от софтуер, писан от хора, които никога не са гонили закъснял наем.</em></p>
        </div>
      </section>

      {/* За заети професионалисти — лекари, адвокати, мениджъри */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <span className="lp-kick">За заети професионалисти</span>
          <h2 className="lp-h2">Вие работите. Кой гледа наемите?</h2>
        </div>
        <div className="lp-busy">
          {[
            ['Кой е платил — без да питате', 'Системата чете банковото извлечение и ви казва само ако нещо липсва. Не отваряте банкирането „да проверите".'],
            ['Наемателят не звъни на вас', '„Тече кранчето" отива в портала, не на личния ви телефон в неделя вечер.'],
            ['Договор за 2 минути', 'Нов наемател между два ангажимента: попълвате, сваляте договор + приемо-предавателен протокол.'],
            ['Април без стрес', 'Данъчната справка за наемите се смята цяла година. Вие само я сваляте. 30 секунди.'],
          ].map(([t, d]) => (
            <div className="lp-cap" key={t}>
              <div className="lp-cap-dot" />
              <div><b>{t}</b><span>{d}</span></div>
            </div>
          ))}
        </div>
        <div className="lp-busy-note">10 минути месечно. Толкова е ангажиментът ви — за всичките ви имоти.</div>
      </section>

      {/* Свободни имоти — публичният каталог (тийзър). Показва се само ако има обяви. */}
      {listings.length > 0 && (
        <section className="lp-sec">
          <div className="lp-sec-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', maxWidth: 'none', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <span className="lp-kick">Търсите имот?</span>
              <h2 className="lp-h2">Свободни имоти за наемане.</h2>
            </div>
            <a className="lp-ghost" href="/imoti" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Всички обяви ({listings.length}) →
            </a>
          </div>
          <div className="lp-listings">
            {listings.slice(0, 3).map(x => (
              <a key={`${x.org_id}-${x.id}`} className="lp-listing" href={`/obiava/${x.org_id}-${x.id}`}>
                <div className="lp-listing-thumb">
                  {x.photo
                    ? <img src={`${API}/api/public/listings/${x.org_id}/${x.id}/photo/${x.photo}`} alt="" loading="lazy" />
                    : <span className="lp-listing-ph">🏠</span>}
                  <span className="lp-listing-price">{Number(x.наем || 0).toLocaleString('bg-BG')} €/мес</span>
                </div>
                <div className="lp-listing-body">
                  <b>{x.тип || 'Имот'}{x.район ? ` · ${x.район}` : ''}</b>
                  <span>{x.площ ? `${x.площ} м² · ` : ''}{x.адрес || ''}</span>
                </div>
              </a>
            ))}
          </div>
          <p className="lp-listings-note">
            Обявите са на наемодатели, които ползват Skyrent — с онлайн договор и наемателски портал от първия ден.
          </p>
        </section>
      )}

      {/* Pricing */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <span className="lp-kick">Цени</span>
          <h2 className="lp-h2">Плащаш за автоматизацията, не за реда в таблицата.</h2>
        </div>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <div className={`lp-plan ${p.featured ? 'feat' : ''}`} key={p.id}>
              {p.featured && <div className="lp-plan-badge">Най-избиран</div>}
              <div className="lp-plan-name">{p.name}</div>
              <div className="lp-plan-price">{p.price}{p.unit && <span>{p.unit}</span>}</div>
              <div className="lp-plan-note">{p.note}</div>
              <p className="lp-plan-desc">{p.desc}</p>
              <ul className="lp-plan-feats">{p.feats.map(f => <li key={f}>{f}</li>)}</ul>
              <button className={p.featured ? 'lp-brass' : 'lp-ghost'} onClick={onEnter}>{p.cta}</button>
            </div>
          ))}
        </div>

        {/* Сравнение функция-по-функция — ясно какво дава плащането */}
        <div style={{ maxWidth: 720, margin: '38px auto 0', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${CMP_LINE}` }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 12, fontWeight: 700, color: '#a6a299' }}>Какво включва</th>
                <th style={{ padding: '10px 6px', fontSize: 13, fontWeight: 700, color: '#ece7dc' }}>Basic<br /><span style={{ fontSize: 10.5, color: '#a6a299', fontWeight: 600 }}>безплатно</span></th>
                <th style={{ padding: '10px 6px', fontSize: 13, fontWeight: 800, color: '#e0bd6e' }}>Pro<br /><span style={{ fontSize: 10.5, color: '#a6a299', fontWeight: 600 }}>€24/мес</span></th>
                <th style={{ padding: '10px 6px', fontSize: 13, fontWeight: 700, color: '#ece7dc' }}>Agency<br /><span style={{ fontSize: 10.5, color: '#a6a299', fontWeight: 600 }}>€49/мес</span></th>
              </tr>
            </thead>
            <tbody>
              {CMP.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${CMP_LINE}` }}>
                  <td style={{ textAlign: 'left', padding: '10px 8px', fontSize: 13, color: '#cfc9bd' }}>{r.label}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center' }}><CmpCell v={r.basic} /></td>
                  <td style={{ padding: '10px 6px', textAlign: 'center' }}><CmpCell v={r.pro} /></td>
                  <td style={{ padding: '10px 6px', textAlign: 'center' }}><CmpCell v={r.agency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ textAlign: 'center', fontSize: 12, color: '#a6a299', marginTop: 14 }}>
            Безплатният план е завинаги — до 5 имота, без банкова карта. Платените отключват автоматизацията (плащания, портал, банков импорт).
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-final">
        <h2 className="lp-h1 sm">Дай на бизнеса си<br /><em>да работи сам.</em></h2>
        <button className="lp-brass big" onClick={onEnter}>Започни безплатно →</button>
        <div className="lp-final-note">Без банкова карта за Basic. Минути до първата фактура.</div>
      </section>

      <footer className="lp-foot">
        <SkyLogo height={18} />
        <span style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>Блог</a>
          <a href="/programa-za-upravlenie-na-imoti" style={{ color: 'inherit', textDecoration: 'none' }}>Програма за управление на имоти</a>
          <a href="/remonti" style={{ color: 'inherit', textDecoration: 'none' }}>Ремонти до ключ</a>
          <a href="/dogovor-naem" style={{ color: 'inherit', textDecoration: 'none' }}>Договор за наем</a>
          <a href="/kalkulator-naem" style={{ color: 'inherit', textDecoration: 'none' }}>Калкулатор данък наем</a>
          <a href="/imoti" style={{ color: 'inherit', textDecoration: 'none' }}>Свободни имоти</a>
          <a href="/usloviya" style={{ color: 'inherit', textDecoration: 'none' }}>Общи условия</a>
          <a href="/poveritelnost" style={{ color: 'inherit', textDecoration: 'none' }}>Поверителност</a>
        </span>
        <span>© {new Date().getFullYear()} · Управление на наемния бизнес</span>
      </footer>
    </div>
  )
}

const CSS = `
.skylp{
  --ink:#15151e; --ink2:#1c1c28; --brass:#c9a24b; --brass2:#e0bd6e;
  --cream:#ece7dc; --text:#a6a299; --line:rgba(236,231,220,.10);
  --disp:'Playfair Display',Georgia,serif; --body:'Manrope',system-ui,sans-serif;
  min-height:100vh; width:100%; overflow-x:hidden;
  background:var(--ink); color:var(--text); font-family:var(--body);
  -webkit-font-smoothing:antialiased; line-height:1.6;
}
.skylp *{box-sizing:border-box;}
.skylp-grain{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.skylp-glow{position:fixed;top:-20%;left:50%;transform:translateX(-50%);width:900px;height:700px;
  background:radial-gradient(closest-side,rgba(201,162,75,.16),transparent 70%);pointer-events:none;z-index:0;}
.skylp > *:not(.skylp-grain):not(.skylp-glow){position:relative;z-index:1;}

.lp-nav{display:flex;justify-content:space-between;align-items:center;
  max-width:1080px;margin:0 auto;padding:26px 28px;}
.lp-word{font-family:var(--disp);font-size:23px;font-weight:600;color:var(--cream);letter-spacing:.01em;}
.lp-word span{color:var(--brass);}

.lp-ghost{font-family:var(--body);font-size:14px;font-weight:600;color:var(--cream);
  background:transparent;border:1px solid var(--line);border-radius:999px;padding:9px 20px;cursor:pointer;
  transition:.2s;}
.lp-ghost:hover{border-color:var(--brass);color:var(--brass2);}
.lp-ghost.lg{padding:14px 26px;font-size:15px;}

.lp-brass{font-family:var(--body);font-size:15px;font-weight:700;color:#1a1509;
  background:linear-gradient(180deg,var(--brass2),var(--brass));border:none;border-radius:999px;
  padding:14px 28px;cursor:pointer;letter-spacing:.01em;transition:.2s;
  box-shadow:0 8px 30px -8px rgba(201,162,75,.5);}
.lp-brass:hover{transform:translateY(-2px);box-shadow:0 14px 40px -8px rgba(201,162,75,.6);}
.lp-brass.big{padding:18px 40px;font-size:17px;}

/* Hero */
.lp-hero{max-width:920px;margin:0 auto;padding:60px 28px 40px;text-align:center;}
.lp-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--brass);margin-bottom:26px;}
.lp-h1{font-family:var(--disp);font-weight:600;color:var(--cream);
  font-size:clamp(38px,6.4vw,76px);line-height:1.02;letter-spacing:-.02em;margin:0 0 26px;}
.lp-h1 em{font-style:italic;color:var(--brass2);font-weight:500;}
.lp-h1.sm{font-size:clamp(32px,5vw,56px);margin-bottom:32px;}
.lp-sub{max-width:620px;margin:0 auto 36px;font-size:clamp(15px,1.7vw,18px);color:var(--text);}
.lp-cta-row{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;}

/* Terminal */
.lp-term{max-width:560px;margin:64px auto 0;background:linear-gradient(180deg,var(--ink2),#191923);
  border:1px solid var(--line);border-radius:16px;overflow:hidden;text-align:left;
  box-shadow:0 40px 80px -30px rgba(0,0,0,.7);}
.lp-term-bar{display:flex;align-items:center;gap:7px;padding:13px 16px;border-bottom:1px solid var(--line);}
.lp-term-bar > span{width:10px;height:10px;border-radius:50%;background:rgba(236,231,220,.16);}
.lp-term-title{margin-left:auto;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--text);}
.lp-term-body{padding:8px 0;}
.lp-row{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid rgba(236,231,220,.05);
  opacity:0;animation:rise .7s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--d);}
.lp-row-a{flex:1;color:var(--cream);font-size:14px;font-weight:500;}
.lp-row-b{font-variant-numeric:tabular-nums;color:var(--cream);font-weight:600;font-size:14px;}
.lp-tag{font-size:11px;font-weight:600;letter-spacing:.04em;padding:4px 10px;border-radius:999px;
  background:rgba(236,231,220,.08);color:var(--text);min-width:78px;text-align:center;}
.lp-tag.ok{background:rgba(201,162,75,.16);color:var(--brass2);}
.lp-term-foot{display:flex;justify-content:space-between;align-items:center;padding:15px 20px 6px;
  font-size:13px;color:var(--text);}
.lp-term-foot b{font-family:var(--disp);font-size:22px;color:var(--brass2);font-weight:600;}

/* Sections */
.lp-sec{max-width:1080px;margin:0 auto;padding:80px 28px;}
.lp-sec-head{margin-bottom:48px;max-width:680px;}
.lp-kick{font-size:11px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--brass);}
.lp-h2{font-family:var(--disp);font-weight:600;color:var(--cream);
  font-size:clamp(26px,3.6vw,40px);line-height:1.1;letter-spacing:-.015em;margin:14px 0 0;}

.lp-pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
.lp-pillar{background:var(--ink);padding:36px 30px;transition:background .3s;}
.lp-pillar:hover{background:var(--ink2);}
.lp-pillar-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;}
.lp-pillar-icon{font-size:26px;color:var(--brass);}
.lp-pillar-k{font-family:var(--disp);font-size:15px;color:rgba(236,231,220,.3);}
.lp-pillar h3{font-family:var(--disp);font-weight:600;font-size:22px;color:var(--cream);margin:0 0 12px;letter-spacing:-.01em;}
.lp-pillar p{font-size:14.5px;color:var(--text);margin:0;}

/* Contrast */
.lp-contrast{max-width:980px;margin:0 auto;padding:40px 28px;display:flex;align-items:center;gap:30px;flex-wrap:wrap;justify-content:center;}
.lp-contrast-col{flex:1;min-width:240px;}
.lp-contrast-col.muted{opacity:.55;}
.lp-contrast-label{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--text);margin-bottom:12px;}
.lp-contrast-label.gold{color:var(--brass);}
.lp-contrast-col p{font-family:var(--disp);font-size:clamp(18px,2.2vw,24px);line-height:1.4;color:var(--cream);font-style:italic;margin:0;}
.lp-contrast-div{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--brass);
  border:1px solid var(--line);border-radius:999px;padding:8px 14px;}

/* Caps */
.lp-caps{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;}
.lp-cap{display:flex;gap:14px;align-items:flex-start;padding:22px 24px;border:1px solid var(--line);border-radius:12px;
  background:linear-gradient(180deg,rgba(236,231,220,.02),transparent);transition:.25s;}
.lp-cap:hover{border-color:rgba(201,162,75,.4);transform:translateY(-2px);}
.lp-cap-dot{width:7px;height:7px;border-radius:50%;background:var(--brass);margin-top:7px;flex-shrink:0;
  box-shadow:0 0 0 4px rgba(201,162,75,.14);}
.lp-cap b{display:block;color:var(--cream);font-size:15px;font-weight:600;margin-bottom:3px;}
.lp-cap span{font-size:13px;color:var(--text);}

/* Plans */
.lp-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;}
.lp-plan{border:1px solid var(--line);border-radius:18px;padding:32px 28px;background:var(--ink2);
  display:flex;flex-direction:column;position:relative;transition:.25s;}
.lp-plan:hover{transform:translateY(-3px);}
.lp-plan.feat{border-color:var(--brass);background:linear-gradient(180deg,rgba(201,162,75,.08),var(--ink2));
  box-shadow:0 30px 60px -30px rgba(201,162,75,.4);}
.lp-plan-badge{position:absolute;top:-11px;left:28px;background:linear-gradient(180deg,var(--brass2),var(--brass));
  color:#1a1509;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;}
.lp-plan-name{font-family:var(--disp);font-size:22px;color:var(--cream);font-weight:600;margin-bottom:8px;}
.lp-plan-price{font-family:var(--disp);font-size:42px;color:var(--brass2);font-weight:600;line-height:1;}
.lp-plan-price span{font-family:var(--body);font-size:15px;color:var(--text);font-weight:500;}
.lp-plan-note{font-size:12px;letter-spacing:.04em;color:var(--text);margin-top:8px;text-transform:uppercase;}
.lp-plan-desc{font-size:14px;color:var(--text);margin:16px 0 18px;}
.lp-plan-feats{list-style:none;padding:0;margin:0 0 24px;flex:1;}
.lp-plan-feats li{font-size:13.5px;color:var(--cream);padding:7px 0 7px 22px;position:relative;border-top:1px solid var(--line);}
.lp-plan-feats li:before{content:'✓';position:absolute;left:0;color:var(--brass);font-weight:700;}
.lp-plan button{width:100%;}

/* Final */
.lp-about{max-width:680px;}
.lp-about p{font-size:16px;line-height:1.75;color:var(--text);margin-bottom:18px;font-weight:300;}
.lp-about p b{color:var(--cream);font-weight:600;}
.lp-about-punch em{font-family:var(--disp);font-style:italic;color:var(--brass2);font-size:17px;}
.lp-busy{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;}
.lp-busy-note{margin-top:28px;font-size:14px;letter-spacing:.04em;color:var(--brass2);font-family:var(--disp);font-style:italic;}
/* Свободни имоти */
.lp-navlink{font-family:var(--body);font-size:14px;font-weight:600;color:var(--text);text-decoration:none;transition:.2s;}
.lp-navlink:hover{color:var(--brass2);}
.lp-listings{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;}
.lp-listing{display:block;text-decoration:none;border:1px solid var(--line);border-radius:16px;overflow:hidden;
  background:var(--ink2);transition:.25s;}
.lp-listing:hover{transform:translateY(-3px);border-color:rgba(201,162,75,.45);}
.lp-listing-thumb{position:relative;height:170px;background:#101019;display:flex;align-items:center;justify-content:center;}
.lp-listing-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.lp-listing-ph{font-size:36px;opacity:.4;}
.lp-listing-price{position:absolute;bottom:10px;left:10px;background:rgba(21,21,30,.88);color:var(--brass2);
  font-weight:700;font-size:14px;padding:5px 12px;border-radius:999px;}
.lp-listing-body{padding:14px 16px;}
.lp-listing-body b{display:block;color:var(--cream);font-size:15px;font-weight:600;margin-bottom:3px;}
.lp-listing-body span{font-size:12.5px;color:var(--text);}
.lp-listings-note{margin-top:22px;font-size:13px;color:var(--text);}

.lp-final{max-width:760px;margin:0 auto;padding:90px 28px 70px;text-align:center;}
.lp-final-note{margin-top:20px;font-size:13px;color:var(--text);letter-spacing:.02em;}

.lp-foot{max-width:1080px;margin:0 auto;padding:30px 28px 50px;display:flex;justify-content:space-between;
  align-items:center;border-top:1px solid var(--line);font-size:12.5px;color:var(--text);flex-wrap:wrap;gap:10px;}
.lp-foot span:first-child{font-family:var(--disp);font-size:18px;color:var(--cream);}

/* Motion */
@keyframes rise{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:translateY(0);}}
.rise{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--d,0s);}
@media (prefers-reduced-motion:reduce){.rise,.lp-row{animation:none;opacity:1;}}
@media (max-width:560px){.lp-contrast{flex-direction:column;}.lp-sec{padding:60px 22px;}}
`
