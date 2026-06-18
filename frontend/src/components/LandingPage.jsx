import React from 'react'

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

export default function LandingPage({ onEnter }) {
  return (
    <div className="skylp">
      <style>{CSS}</style>
      <div className="skylp-grain" aria-hidden />
      <div className="skylp-glow" aria-hidden />

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-word">Skyrent<span>°</span></div>
        <button className="lp-ghost" onClick={onEnter}>Вход</button>
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
      </section>

      {/* Final CTA */}
      <section className="lp-final">
        <h2 className="lp-h1 sm">Дай на бизнеса си<br /><em>да работи сам.</em></h2>
        <button className="lp-brass big" onClick={onEnter}>Започни безплатно →</button>
        <div className="lp-final-note">Без карта за Basic. Минути до първата фактура.</div>
      </section>

      <footer className="lp-foot">
        <span>Skyrent°</span>
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
