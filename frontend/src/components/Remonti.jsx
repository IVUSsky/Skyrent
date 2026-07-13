import React, { useEffect, useState } from 'react'
import { setCanonical } from '../lib/seo'
import { SkyLogo } from './LandingPage'

// Публична страница /remonti — довършителни работи до ключ през Sky Capital:
// дизайн + цялостно довършване + мебелиране + управление (или Skyrent софтуер).
// Стилът следва landing-а (ink + brass). Формата праща запитване на info@skycapital.pro.

// Лого „skycapital" — Unbounded контури, същото семейство като sky·rent
export function SkyCapitalLogo({ height = 26, sky = '#e0bd6e', rest = '#ece7dc' }) {
  const P = ({ x, d, f }) => <path transform={`translate(${x} 0)`} d={d} fill={f} />
  return (
    <svg viewBox="0 0 560 100" height={height} style={{ display: 'block' }} role="img" aria-label="skycapital">
      <P x={1} f={sky} d="M59.12 64.72Q59.12 70.24 55.72 73.92Q52.32 77.60 46.12 79.48Q39.92 81.36 31.44 81.36Q22.72 81.36 16.16 79.28Q9.60 77.20 5.84 73.40Q2.08 69.60 1.84 64.56L20.48 64.56Q22.16 69.60 32.40 69.60Q41.28 69.60 41.28 66.56Q41.28 65.20 39.48 64.56Q37.68 63.92 33.44 63.60L25.68 63.04Q17.20 62.48 12.28 60.64Q7.36 58.80 5.20 55.76Q3.04 52.72 3.04 48.56Q3.04 43.28 6.40 39.76Q9.76 36.24 15.80 34.52Q21.84 32.80 29.84 32.80Q37.76 32.80 43.92 34.80Q50.08 36.80 53.80 40.40Q57.52 44 58.16 48.80L39.52 48.80Q38.88 46.72 36.36 45.32Q33.84 43.92 29.04 43.92Q20.96 43.92 20.96 46.88Q20.96 48.16 22.20 48.80Q23.44 49.44 26.88 49.68L37.28 50.40Q45.52 50.96 50.32 52.72Q55.12 54.48 57.12 57.48Q59.12 60.48 59.12 64.72" />
      <P x={62.86} f={sky} d="M61.76 80L41.28 80L33.04 65.60L20.48 80L4.16 80L4.16 18.40L22.48 18.40L22.48 57.84L41.68 34.16L60.56 34.16L44.88 52.16" />
      <P x={124.4} f={sky} d="M27.76 74.80L19.52 74.80L0.64 34.16L20.80 34.16L32.48 63.28L44.48 34.16L63.92 34.16L42.48 80.16Q39.92 85.60 36.40 88.76Q32.88 91.92 28.80 93.24Q24.72 94.56 20.56 94.56Q15.12 94.56 11 93.28Q6.88 92 2.88 89.04L2.88 76.56Q6.88 79.12 10.32 80.24Q13.76 81.36 17.84 81.36Q21.20 81.36 23.72 79.96Q26.24 78.56 27.76 74.80" />
      <P x={188.66} f={rest} d="M42 60.24L60.16 60.24Q59.52 66.56 55.60 71.32Q51.68 76.08 45.40 78.72Q39.12 81.36 31.28 81.36Q22.64 81.36 16.08 78.28Q9.52 75.20 5.84 69.76Q2.16 64.32 2.16 57.12Q2.16 49.92 5.84 44.44Q9.52 38.96 16.08 35.88Q22.64 32.80 31.28 32.80Q39.12 32.80 45.40 35.44Q51.68 38.08 55.60 42.84Q59.52 47.60 60.16 53.92L42 53.92Q41.20 50.16 38.32 48.20Q35.44 46.24 31.28 46.24Q26.40 46.24 23.56 49.04Q20.72 51.84 20.72 57.12Q20.72 62.40 23.56 65.16Q26.40 67.92 31.28 67.92Q35.44 67.92 38.32 65.80Q41.20 63.68 42 60.24" />
      <P x={251.08} f={rest} d="M64.08 80L45.04 80L43.92 71.44Q40.72 76.08 35.88 78.72Q31.04 81.36 24.96 81.36Q18.24 81.36 13.16 78.32Q8.08 75.28 5.24 69.84Q2.40 64.40 2.40 57.12Q2.40 49.76 5.24 44.32Q8.08 38.88 13.16 35.84Q18.24 32.80 24.96 32.80Q30.96 32.80 35.84 35.36Q40.72 37.92 43.92 42.64L45.04 34.16L64.08 34.16L61.04 57.04L64.08 80M20.88 57.12Q20.88 61.60 23.64 64.56Q26.40 67.52 30.72 67.52Q33.68 67.52 36.40 66.16Q39.12 64.80 41.20 62.44Q43.28 60.08 44.24 57.12Q43.28 54.08 41.20 51.72Q39.12 49.36 36.40 48Q33.68 46.64 30.72 46.64Q26.40 46.64 23.64 49.60Q20.88 52.56 20.88 57.12" />
      <P x={318.7} f={rest} d="M4.16 93.20L4.16 34.16L22.48 34.16L22.48 42Q25.76 37.60 30.48 35.20Q35.20 32.80 41.04 32.80Q47.76 32.80 52.84 35.84Q57.92 38.88 60.76 44.32Q63.60 49.76 63.60 57.12Q63.60 64.40 60.76 69.84Q57.92 75.28 52.84 78.32Q47.76 81.36 41.04 81.36Q35.20 81.36 30.48 78.88Q25.76 76.40 22.48 72L22.48 93.20L4.16 93.20M45.12 57.12Q45.12 52.56 42.36 49.60Q39.60 46.64 35.28 46.64Q32.32 46.64 29.60 48Q26.88 49.36 24.84 51.72Q22.80 54.08 21.84 57.12Q22.80 60.08 24.84 62.44Q26.88 64.80 29.60 66.16Q32.32 67.52 35.28 67.52Q39.60 67.52 42.36 64.56Q45.12 61.60 45.12 57.12" />
      <P x={385.12} f={rest} d="M4.16 80L4.16 33.28L13.36 35.20L22.48 33.28L22.48 80L4.16 80M13.36 30.24Q8.64 30.24 5.80 27.92Q2.96 25.60 2.96 21.68Q2.96 17.68 5.80 15.36Q8.64 13.04 13.36 13.04Q18.08 13.04 20.96 15.36Q23.84 17.68 23.84 21.68Q23.84 25.60 20.96 27.92Q18.08 30.24 13.36 30.24" />
      <P x={412.34} f={rest} d="M9.60 47.60L0.48 47.60L0.48 39.68L9.60 35.52L17.60 21.76L28 21.76L28 34.16L46.56 34.16L46.56 47.60L28 47.60L28 59.04Q28 63.76 29.80 65.64Q31.60 67.52 36.88 67.52Q40.16 67.52 42.72 67Q45.28 66.48 47.36 65.68L47.36 79.20Q44.72 80.08 40.84 80.72Q36.96 81.36 32.64 81.36Q20.80 81.36 15.20 76.04Q9.60 70.72 9.60 61.52" />
      <P x={462.36} f={rest} d="M64.08 80L45.04 80L43.92 71.44Q40.72 76.08 35.88 78.72Q31.04 81.36 24.96 81.36Q18.24 81.36 13.16 78.32Q8.08 75.28 5.24 69.84Q2.40 64.40 2.40 57.12Q2.40 49.76 5.24 44.32Q8.08 38.88 13.16 35.84Q18.24 32.80 24.96 32.80Q30.96 32.80 35.84 35.36Q40.72 37.92 43.92 42.64L45.04 34.16L64.08 34.16L61.04 57.04L64.08 80M20.88 57.12Q20.88 61.60 23.64 64.56Q26.40 67.52 30.72 67.52Q33.68 67.52 36.40 66.16Q39.12 64.80 41.20 62.44Q43.28 60.08 44.24 57.12Q43.28 54.08 41.20 51.72Q39.12 49.36 36.40 48Q33.68 46.64 30.72 46.64Q26.40 46.64 23.64 49.60Q20.88 52.56 20.88 57.12" />
      <P x={529.98} f={rest} d="M4.16 80L4.16 18.40L22.48 18.40L22.48 80" />
    </svg>
  )
}

const SERVICES = [
  ['◆', 'Дизайн', 'Интериорен проект, съобразен с целта — живеене или отдаване под наем. Материали, цветове и осветление, избрани да изглеждат скъпо и да се поддържат евтино.'],
  ['◆', 'Цялостно довършване', 'Настилки, бани, ел. и ВиК окончания, климатизация, осветление. Собствен екип — без подизпълнителска лотария. Фиксиран срок и бюджет в договора.'],
  ['◆', 'Пълно мебелиране', 'От кухнята до последната лъжичка. Имотът се предава готов за нанасяне — или за първата обява със снимки.'],
]

const STEPS = [
  ['1', 'Оглед и оферта', 'Виждаме имота, слушаме целта, даваме фиксирана цена и срок. Безплатно.'],
  ['2', 'Дизайн-проект', 'Одобрявате визуализация и спецификация преди първия удар с чука.'],
  ['3', 'Изпълнение', 'Нашият екип, нашата отговорност, седмични снимки на прогреса.'],
  ['4', 'Ключ + план', 'Приемате готовия имот и решавате: ние го управляваме — или го поемате със Skyrent.'],
]

const PHOTOS = ['/remonti/1.jpg', '/remonti/2.jpg', '/remonti/3.jpg', '/remonti/4.jpg', '/remonti/5.jpg', '/remonti/6.jpg']

export default function Remonti({ API = '' }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', object: '', message: '', company: '' })
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    document.title = 'Довършителни работи до ключ | Sky Capital'
    setCanonical('/remonti')
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!form.name || (!form.phone && !form.email)) { setErrMsg('Име и телефон или имейл са задължителни'); return }
    setState('sending'); setErrMsg('')
    fetch(`${API}/api/public/remont-inquiry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setState('done'); else { setState('error'); setErrMsg(d.error || 'Грешка') } })
      .catch(() => { setState('error'); setErrMsg('Няма връзка — опитайте по-късно или се обадете.') })
  }
  const F = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="skyrm">
      <style>{CSS}</style>
      <div className="rm-glow" aria-hidden />

      <nav className="rm-nav">
        <a href="/" style={{ display: 'flex', alignItems: 'center' }}><SkyCapitalLogo height={24} /></a>
        <a className="rm-ghost" href="/">към Skyrent →</a>
      </nav>

      {/* Hero */}
      <header className="rm-hero">
        <div className="rm-eyebrow">Довършителни работи до ключ</div>
        <h1>От голи стени<br /><em>до първия наем.</em></h1>
        <p className="rm-sub">
          Дизайн, цялостно довършване и мебелиране — от екипа, който направи същото
          за собствените си 38 имота. А след ключа: ние управляваме имота, или го поемате
          вие — със софтуера ни Skyrent.
        </p>
        <a className="rm-brass" href="#zapitvane">Безплатен оглед и оферта →</a>
      </header>

      {/* Проблемът */}
      <section className="rm-sec">
        <div className="rm-kick">Познато ли ви е</div>
        <h2>Купихте „на шпакловка и замазка". А сега?</h2>
        <p className="rm-body">
          Три месеца избиране на плочки. Пет майстора, които не си вдигат телефона. Мебели,
          които пристигат сгрешени. И чак тогава — търсене на наематели. Ние правим всичко
          това от години, за собствен портфейл. Сега го правим и за вашия имот — <b>с фиксиран
          срок и бюджет, записани в договора</b>.
        </p>
      </section>

      {/* Услуги */}
      <section className="rm-sec">
        <div className="rm-kick">Услугата</div>
        <h2>Всичко до ключ. Буквално.</h2>
        <div className="rm-grid3">
          {SERVICES.map(([ic, t, d]) => (
            <div className="rm-card" key={t}><div className="rm-ic">{ic}</div><b>{t}</b><p>{d}</p></div>
          ))}
        </div>
      </section>

      {/* След ключа */}
      <section className="rm-sec">
        <div className="rm-kick">След ключа</div>
        <h2>Имотът трябва да работи. Изберете едното:</h2>
        <div className="rm-grid2">
          <div className="rm-card big">
            <div style={{ marginBottom: 14 }}><SkyCapitalLogo height={20} /></div>
            <b>Ние го управляваме</b>
            <p>Намираме наематели, събираме наемите, поддържаме имота. Вие получавате превод
            и справка всеки месец — точно както управляваме собствените си 38 имота.</p>
          </div>
          <div className="rm-card big">
            <div style={{ marginBottom: 14 }}><SkyLogo height={20} /></div>
            <b>Управлявате го сами — със Skyrent</b>
            <p>Нашият софтуер: вижда кой е платил (директно от банката), пази договорите,
            издава фактурите, прави данъчната справка. 10 минути на месец.</p>
            <a href="/" className="rm-link">app.skycapital.pro →</a>
          </div>
        </div>
      </section>

      {/* Процес */}
      <section className="rm-sec">
        <div className="rm-kick">Как работим</div>
        <h2>Четири стъпки до ключа.</h2>
        <div className="rm-grid4">
          {STEPS.map(([n, t, d]) => (
            <div className="rm-step" key={n}><div className="rm-n">{n}</div><b>{t}</b><p>{d}</p></div>
          ))}
        </div>
      </section>

      {/* Галерия — снимките се качват във frontend/public/remonti/1..6.jpg */}
      <section className="rm-sec">
        <div className="rm-kick">Наши обекти</div>
        <h2>Как изглежда „готово".</h2>
        <div className="rm-gallery">
          {PHOTOS.map(src => (
            <img key={src} src={src} alt="Завършен обект — Sky Capital"
              loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />
          ))}
        </div>
      </section>

      {/* Форма */}
      <section className="rm-sec" id="zapitvane">
        <div className="rm-kick">Запитване</div>
        <h2>Безплатен оглед и оферта.</h2>
        {state === 'done' ? (
          <div className="rm-done">✓ Получихме запитването ви. Ще се свържем с вас до 1 работен ден.</div>
        ) : (
          <form className="rm-form" onSubmit={submit}>
            <div className="rm-frow">
              <input placeholder="Име *" value={form.name} onChange={e => F('name', e.target.value)} />
              <input placeholder="Телефон" value={form.phone} onChange={e => F('phone', e.target.value)} />
            </div>
            <div className="rm-frow">
              <input placeholder="Имейл" type="email" value={form.email} onChange={e => F('email', e.target.value)} />
              <input placeholder="Обект (напр. двустаен, Младост, 65 м²)" value={form.object} onChange={e => F('object', e.target.value)} />
            </div>
            {/* honeypot */}
            <input style={{ display: 'none' }} tabIndex={-1} autoComplete="off" value={form.company} onChange={e => F('company', e.target.value)} placeholder="Company" />
            <textarea rows={4} placeholder="Разкажете накратко — етап на имота, какво искате, срокове…"
              value={form.message} onChange={e => F('message', e.target.value)} />
            {errMsg && <div className="rm-err">{errMsg}</div>}
            <button className="rm-brass" disabled={state === 'sending'}>
              {state === 'sending' ? 'Изпраща…' : 'Изпрати запитване'}
            </button>
            <div className="rm-note">Или директно: 📞 +359 888 646 420 · ✉️ info@skycapital.pro</div>
          </form>
        )}
      </section>

      <footer className="rm-foot">
        <SkyCapitalLogo height={18} />
        <span>Работим в София и Пазарджик · Sky Capital ООД, ЕИК 207291184</span>
      </footer>
    </div>
  )
}

const CSS = `
.skyrm{--ink:#15151e;--ink2:#1c1c28;--brass:#c9a24b;--brass2:#e0bd6e;--cream:#ece7dc;--text:#a6a299;
  --line:rgba(236,231,220,.10);--disp:'Playfair Display',Georgia,serif;--body:'Manrope',system-ui,sans-serif;
  min-height:100vh;background:var(--ink);color:var(--text);font-family:var(--body);line-height:1.6;-webkit-font-smoothing:antialiased;}
.skyrm *{box-sizing:border-box}
.rm-glow{position:fixed;top:-20%;left:50%;transform:translateX(-50%);width:900px;height:700px;
  background:radial-gradient(closest-side,rgba(201,162,75,.14),transparent 70%);pointer-events:none;}
.rm-nav{display:flex;justify-content:space-between;align-items:center;max-width:1000px;margin:0 auto;padding:26px 28px;position:relative;}
.rm-ghost{font-size:13.5px;font-weight:600;color:var(--cream);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:9px 18px;}
.rm-ghost:hover{border-color:var(--brass);color:var(--brass2);}
.rm-hero{max-width:820px;margin:0 auto;padding:56px 28px 60px;text-align:center;position:relative;}
.rm-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--brass);margin-bottom:24px;}
.skyrm h1{font-family:var(--disp);font-weight:600;color:var(--cream);font-size:clamp(36px,6vw,68px);line-height:1.04;letter-spacing:-.02em;margin:0 0 24px;}
.skyrm h1 em{font-style:italic;color:var(--brass2);font-weight:500;}
.rm-sub{max-width:600px;margin:0 auto 34px;font-size:clamp(15px,1.7vw,17.5px);}
.rm-brass{display:inline-block;font-size:15px;font-weight:700;color:#1a1509;text-decoration:none;border:none;cursor:pointer;
  background:linear-gradient(180deg,var(--brass2),var(--brass));border-radius:999px;padding:15px 30px;
  box-shadow:0 8px 30px -8px rgba(201,162,75,.5);transition:.2s;font-family:var(--body);}
.rm-brass:hover{transform:translateY(-2px);}
.rm-sec{max-width:1000px;margin:0 auto;padding:56px 28px;position:relative;}
.rm-kick{font-size:11px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--brass);}
.skyrm h2{font-family:var(--disp);font-weight:600;color:var(--cream);font-size:clamp(24px,3.4vw,36px);line-height:1.12;letter-spacing:-.015em;margin:12px 0 26px;}
.rm-body{max-width:640px;font-size:16px;line-height:1.75;}
.rm-body b{color:var(--cream);font-weight:600;}
.rm-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;}
.rm-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;}
.rm-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;}
.rm-card{border:1px solid var(--line);border-radius:16px;padding:26px 24px;background:var(--ink2);}
.rm-card.big{padding:32px 28px;}
.rm-ic{color:var(--brass);font-size:20px;margin-bottom:12px;}
.rm-card b{display:block;color:var(--cream);font-size:17px;font-weight:600;margin-bottom:10px;}
.rm-card p{font-size:14px;margin:0;}
.rm-link{display:inline-block;margin-top:12px;color:var(--brass2);font-size:13.5px;font-weight:600;text-decoration:none;}
.rm-step{border:1px solid var(--line);border-radius:16px;padding:24px 22px;background:linear-gradient(180deg,rgba(236,231,220,.02),transparent);}
.rm-n{width:34px;height:34px;border-radius:50%;background:rgba(201,162,75,.15);border:1px solid rgba(201,162,75,.45);
  color:var(--brass2);display:grid;place-items:center;font-weight:800;font-size:15px;margin-bottom:14px;font-family:var(--disp);}
.rm-step b{display:block;color:var(--cream);font-size:15.5px;font-weight:600;margin-bottom:8px;}
.rm-step p{font-size:13.5px;margin:0;}
.rm-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
.rm-gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;border:1px solid var(--line);}
.rm-form{max-width:640px;display:flex;flex-direction:column;gap:14px;}
.rm-frow{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:560px){.rm-frow{grid-template-columns:1fr}}
.rm-form input,.rm-form textarea{width:100%;background:var(--ink2);border:1px solid var(--line);border-radius:12px;
  padding:13px 16px;font-size:14.5px;color:var(--cream);font-family:var(--body);outline:none;}
.rm-form input:focus,.rm-form textarea:focus{border-color:var(--brass);}
.rm-form textarea{resize:vertical;}
.rm-err{color:#f0a8a8;font-size:13.5px;}
.rm-done{max-width:640px;background:rgba(96,190,120,.1);border:1px solid rgba(96,190,120,.35);color:#a8e0b8;
  border-radius:14px;padding:20px 22px;font-size:15px;}
.rm-note{font-size:13px;color:var(--text);}
.rm-foot{max-width:1000px;margin:0 auto;padding:28px;border-top:1px solid var(--line);display:flex;
  justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;position:relative;}
`
