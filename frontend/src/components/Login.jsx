import React, { useState, useRef, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Sky Capital — "Private Wealth Terminal" login
// Aesthetic: quiet-luxury fintech. Deep ink-green atmosphere, warm bone text,
// brass accent, editorial serif (Fraunces) + grotesque UI (Hanken Grotesk).
// Auth flow (credentials → optional 2FA → token) preserved exactly.
// ─────────────────────────────────────────────────────────────────────────────

const FONT_LINKS = [
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..600&family=Hanken+Grotesk:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap',
]

function useFonts() {
  useEffect(() => {
    const added = []
    if (!document.querySelector('link[data-skygfont]')) {
      const pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com'; pre1.setAttribute('data-skygfont', '1')
      const pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous'; pre2.setAttribute('data-skygfont', '1')
      document.head.append(pre1, pre2); added.push(pre1, pre2)
      for (const href of FONT_LINKS) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-skygfont', '1')
        document.head.append(l); added.push(l)
      }
    }
    return () => {}
  }, [])
}

const C = {
  ink:    '#091310',
  ink2:   '#0C1A15',
  surface:'#11241E',
  bone:   '#ECE6D7',
  boneDim:'#9AA59C',
  brass:  '#D8B66A',
  brassDeep: '#B9923F',
  sage:   '#85B8A0',
  line:   'rgba(236,230,215,0.12)',
  lineSoft:'rgba(236,230,215,0.07)',
}

export default function Login({ API, onLogin, onBack }) {
  useFonts()
  const [step, setStep]         = useState('credentials')  // 'credentials' | 'totp' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [stageToken, setStageToken] = useState('')
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  // signup (закрита бета)
  const [signupCode, setSignupCode] = useState('')
  const [orgName, setOrgName]       = useState('')
  const [email, setEmail]           = useState('')
  const [fullName, setFullName]     = useState('')
  const codeRef = useRef(null)

  useEffect(() => { if (step === 'totp') setTimeout(() => codeRef.current?.focus(), 50) }, [step])

  const submitCreds = (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data.requires_totp && data.stage_token) {
          setStageToken(data.stage_token)
          setStep('totp')
          return
        }
        if (data.token) {
          localStorage.setItem('skyrent_token', data.token)
          onLogin({ role: data.role, name: data.name, must_change_password: data.must_change_password })
        } else {
          setError(data.error || 'Грешка при вход')
        }
      })
      .catch(() => { setLoading(false); setError('Не може да се свърже със сървъра') })
  }

  const submitTotp = (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    fetch(`${API}/api/auth/login-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_token: stageToken, code }),
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data.token) {
          localStorage.setItem('skyrent_token', data.token)
          if (data.used_backup_code) alert('⚠️ Използва се backup код — генерирай нови от Settings → 2FA.')
          onLogin({ role: data.role, name: data.name, must_change_password: data.must_change_password })
        } else {
          setError(data.error || 'Грешка при 2FA')
        }
      })
      .catch(() => { setLoading(false); setError('Не може да се свърже със сървъра') })
  }

  const goBack = () => { setStep('credentials'); setStageToken(''); setCode(''); setError(null) }

  const submitSignup = (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    fetch(`${API}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signup_code: signupCode, org_name: orgName, username, password, email, name: fullName }),
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data.token) {
          localStorage.setItem('skyrent_token', data.token)
          onLogin({ role: data.role, name: data.name, must_change_password: false })
        } else {
          setError(data.error || 'Грешка при регистрация')
        }
      })
      .catch(() => { setLoading(false); setError('Не може да се свърже със сървъра') })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.ink, color: C.bone, fontFamily: "'Hanken Grotesk', system-ui, sans-serif", position: 'relative', overflow: 'hidden' }}>
      <style>{LOGIN_CSS}</style>

      {/* Atmosphere: gradient mesh + grain */}
      <div className="sky-mesh" aria-hidden />
      <div className="sky-grain" aria-hidden />

      {onBack && (
        <button onClick={onBack}
          style={{ position: 'absolute', top: 22, left: 24, zIndex: 5, background: 'transparent',
            border: '1px solid rgba(255,255,255,.16)', color: C.bone, borderRadius: 999, padding: '8px 16px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
          ← Начало
        </button>
      )}

      <div className="sky-shell">
        {/* ── LEFT · brand panel ───────────────────────────────────────────── */}
        <aside className="sky-brand">
          <div className="sky-brand-top sky-rise" style={{ animationDelay: '.05s' }}>
            <div className="sky-mark">
              <span className="sky-mark-glyph">◇</span>
              <span className="sky-mark-word">Sky&nbsp;Capital</span>
            </div>
            <div className="sky-mark-sub">Частно управление на активи</div>
          </div>

          <div className="sky-hero sky-rise" style={{ animationDelay: '.18s' }}>
            <h1 className="sky-hero-title">
              Вашето<br/><em>портфолио</em>,<br/>под един покрив.
            </h1>
            <p className="sky-hero-lead">
              Имоти, наеми, кредити и капитал — измервани с прецизността,
              която заслужават.
            </p>
          </div>

          {/* quiet growth motif — an animated drawing sparkline */}
          <div className="sky-spark sky-rise" style={{ animationDelay: '.34s' }} aria-hidden>
            <svg viewBox="0 0 420 90" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor={C.brass} stopOpacity="0" />
                  <stop offset=".5" stopColor={C.brass} stopOpacity=".9" />
                  <stop offset="1" stopColor={C.sage} stopOpacity=".9" />
                </linearGradient>
              </defs>
              <path className="sky-spark-path"
                d="M0,72 C40,70 56,40 92,42 C128,44 140,66 180,58 C220,50 232,18 274,22 C316,26 330,48 366,38 C396,30 408,16 420,10"
                fill="none" stroke="url(#sg)" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
            <div className="sky-spark-row">
              <span>Портфолио</span><span className="sky-spark-dot">·</span><span>наеми</span>
              <span className="sky-spark-dot">·</span><span>кредити</span>
              <span className="sky-spark-dot">·</span><span>капитал</span>
            </div>
          </div>

          <div className="sky-brand-foot sky-rise" style={{ animationDelay: '.5s' }}>
            <span>Защитено · 2FA</span>
            <span className="sky-foot-sep" />
            <span>Sky Capital OOD</span>
          </div>
        </aside>

        {/* ── RIGHT · form panel ───────────────────────────────────────────── */}
        <main className="sky-form-wrap">
          <div className="sky-card sky-rise" style={{ animationDelay: '.24s' }}>
            {step === 'credentials' ? (
              <>
                <div className="sky-card-head">
                  <div className="sky-eyebrow">Достъп до терминала</div>
                  <h2 className="sky-card-title">Вход</h2>
                </div>
                <form onSubmit={submitCreds} className="sky-fields">
                  <Field id="u" label="Потребител или имейл" value={username}
                         onChange={setUsername} autoFocus />
                  <Field id="p" label="Парола" type="password" value={password}
                         onChange={setPassword} />
                  {error && <div className="sky-error">{error}</div>}
                  <SubmitBtn loading={loading} idle="Влез" busy="Влизане…" />
                  <button type="button" className="sky-back"
                    onClick={() => { setStep('signup'); setError(null) }}>
                    Нямаш акаунт? Регистрация →
                  </button>
                </form>
              </>
            ) : step === 'signup' ? (
              <>
                <div className="sky-card-head">
                  <div className="sky-eyebrow">Закрита бета · с код за достъп</div>
                  <h2 className="sky-card-title">Регистрация</h2>
                  <p className="sky-card-note">Нова организация — собствено изолирано портфолио.</p>
                </div>
                <form onSubmit={submitSignup} className="sky-fields">
                  <Field id="sc" label="Код за достъп" value={signupCode} onChange={setSignupCode} autoFocus />
                  <Field id="on" label="Фирма / организация" value={orgName} onChange={setOrgName} />
                  <Field id="fn" label="Вашето име" value={fullName} onChange={setFullName} />
                  <Field id="em" label="Имейл" type="email" value={email} onChange={setEmail} />
                  <Field id="su" label="Потребителско име" value={username} onChange={setUsername} />
                  <Field id="sp" label="Парола (мин. 8 знака)" type="password" value={password} onChange={setPassword} />
                  {error && <div className="sky-error">{error}</div>}
                  <SubmitBtn loading={loading} idle="Създай акаунт" busy="Създаване…" />
                  <button type="button" onClick={goBack} className="sky-back">← обратно към вход</button>
                </form>
              </>
            ) : (
              <>
                <div className="sky-card-head">
                  <div className="sky-eyebrow">Двуфакторна защита</div>
                  <h2 className="sky-card-title">Потвърждение</h2>
                  <p className="sky-card-note">6-цифрен код от приложението — или backup код.</p>
                </div>
                <form onSubmit={submitTotp} className="sky-fields">
                  <input
                    ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code"
                    value={code} onChange={e => setCode(e.target.value)}
                    placeholder="000000" maxLength={20} className="sky-code" />
                  <div className="sky-code-hint">или backup код · XXXX-XXXX</div>
                  {error && <div className="sky-error">{error}</div>}
                  <SubmitBtn loading={loading} idle="Потвърди" busy="Проверка…" />
                  <button type="button" onClick={goBack} className="sky-back">← обратно</button>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Floating-label field ─────────────────────────────────────────────────────
function Field({ id, label, type = 'text', value, onChange, autoFocus }) {
  const [focus, setFocus] = useState(false)
  const lifted = focus || value.length > 0
  return (
    <div className={`sky-field ${focus ? 'is-focus' : ''} ${lifted ? 'is-lifted' : ''}`}>
      <label htmlFor={id} className="sky-label">{label}</label>
      <input
        id={id} type={type} value={value} autoFocus={autoFocus} required
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        className="sky-input" autoComplete={type === 'password' ? 'current-password' : 'username'} />
      <span className="sky-field-rule" />
    </div>
  )
}

function SubmitBtn({ loading, idle, busy }) {
  return (
    <button type="submit" disabled={loading} className="sky-submit">
      <span>{loading ? busy : idle}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" className="sky-submit-arrow">
        <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

const LOGIN_CSS = `
.sky-mesh{position:absolute;inset:0;z-index:0;
  background:
    radial-gradient(60% 50% at 12% 18%, rgba(216,182,106,.10), transparent 60%),
    radial-gradient(55% 50% at 88% 82%, rgba(133,184,160,.10), transparent 62%),
    radial-gradient(40% 40% at 70% 12%, rgba(216,182,106,.05), transparent 60%),
    linear-gradient(160deg, ${C.ink} 0%, ${C.ink2} 60%, ${C.ink} 100%);
}
.sky-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.5;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
}
.sky-shell{position:relative;z-index:2;min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr;}
@media (max-width:920px){.sky-shell{grid-template-columns:1fr;}}

/* brand panel */
.sky-brand{display:flex;flex-direction:column;justify-content:space-between;
  padding:clamp(28px,5vw,72px);gap:clamp(28px,5vh,56px);
  border-right:1px solid ${C.lineSoft};}
@media (max-width:920px){.sky-brand{border-right:none;border-bottom:1px solid ${C.lineSoft};padding:32px 26px;gap:26px;}}

.sky-mark{display:flex;align-items:center;gap:12px;}
.sky-mark-glyph{color:${C.brass};font-size:20px;transform:translateY(1px);}
.sky-mark-word{font-family:'Fraunces',serif;font-weight:500;font-size:21px;letter-spacing:.01em;color:${C.bone};}
.sky-mark-sub{margin-top:10px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${C.boneDim};}

.sky-hero-title{font-family:'Fraunces',serif;font-weight:300;line-height:1.04;
  font-size:clamp(34px,4.6vw,60px);color:${C.bone};letter-spacing:-.01em;margin:0;}
.sky-hero-title em{font-style:italic;font-weight:400;color:${C.brass};}
.sky-hero-lead{margin:22px 0 0;max-width:30ch;font-size:15.5px;line-height:1.65;color:${C.boneDim};}

.sky-spark{}
.sky-spark svg{width:100%;height:74px;display:block;}
.sky-spark-path{stroke-dasharray:680;stroke-dashoffset:680;animation:skyDraw 2.1s cubic-bezier(.7,0,.2,1) .6s forwards;}
@keyframes skyDraw{to{stroke-dashoffset:0;}}
.sky-spark-row{margin-top:14px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;
  font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:${C.boneDim};}
.sky-spark-dot{color:${C.brass};opacity:.7;}

.sky-brand-foot{display:flex;align-items:center;gap:14px;font-size:12px;letter-spacing:.06em;color:${C.boneDim};}
.sky-foot-sep{width:4px;height:4px;border-radius:50%;background:${C.brass};opacity:.6;}

/* form panel */
.sky-form-wrap{display:flex;align-items:center;justify-content:center;padding:clamp(28px,5vw,72px);}
.sky-card{width:100%;max-width:392px;
  background:linear-gradient(180deg, rgba(19,36,30,.78), rgba(12,26,21,.78));
  border:1px solid ${C.line};border-radius:18px;
  padding:clamp(28px,4vw,40px);
  box-shadow:0 24px 70px -30px rgba(0,0,0,.7), inset 0 1px 0 rgba(236,230,215,.05);
  backdrop-filter:blur(8px);}

.sky-card-head{margin-bottom:30px;}
.sky-eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.brass};margin-bottom:12px;}
.sky-card-title{font-family:'Fraunces',serif;font-weight:400;font-size:32px;margin:0;color:${C.bone};letter-spacing:-.01em;}
.sky-card-note{margin:12px 0 0;font-size:13.5px;line-height:1.6;color:${C.boneDim};}

.sky-fields{display:flex;flex-direction:column;gap:22px;}

.sky-field{position:relative;padding-top:18px;}
.sky-label{position:absolute;left:0;top:18px;font-size:15px;color:${C.boneDim};
  pointer-events:none;transition:all .22s cubic-bezier(.4,0,.2,1);}
.sky-field.is-lifted .sky-label{top:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.brass};}
.sky-input{width:100%;background:transparent;border:none;outline:none;
  font-size:16px;color:${C.bone};padding:6px 0 9px;font-family:inherit;}
.sky-input:-webkit-autofill{-webkit-text-fill-color:${C.bone};transition:background 9999s;}
.sky-field-rule{display:block;height:1px;background:${C.line};position:relative;}
.sky-field-rule::after{content:'';position:absolute;left:0;bottom:0;height:1px;width:0;
  background:linear-gradient(90deg,${C.brass},${C.sage});transition:width .32s cubic-bezier(.4,0,.2,1);}
.sky-field.is-focus .sky-field-rule::after{width:100%;}

.sky-code{width:100%;background:rgba(0,0,0,.22);border:1px solid ${C.line};border-radius:12px;
  padding:18px;text-align:center;font-family:'Space Mono',monospace;font-size:30px;
  letter-spacing:.32em;color:${C.bone};outline:none;transition:border-color .2s;}
.sky-code:focus{border-color:${C.brass};}
.sky-code::placeholder{color:rgba(154,165,156,.4);}
.sky-code-hint{text-align:center;font-size:12px;letter-spacing:.1em;color:${C.boneDim};margin-top:-6px;}

.sky-error{font-size:13.5px;color:#E8927C;background:rgba(232,146,124,.08);
  border:1px solid rgba(232,146,124,.22);border-radius:10px;padding:10px 12px;}

.sky-submit{margin-top:4px;width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
  background:linear-gradient(180deg,${C.brass},${C.brassDeep});color:${C.ink};
  border:none;border-radius:12px;padding:15px 18px;font-family:inherit;font-weight:600;
  font-size:15px;letter-spacing:.02em;cursor:pointer;
  box-shadow:0 10px 30px -12px rgba(216,182,106,.5);
  transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s,filter .18s;}
.sky-submit:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05);
  box-shadow:0 16px 38px -12px rgba(216,182,106,.6);}
.sky-submit:active:not(:disabled){transform:translateY(0);}
.sky-submit:disabled{opacity:.6;cursor:default;}
.sky-submit-arrow{transition:transform .22s cubic-bezier(.4,0,.2,1);}
.sky-submit:hover:not(:disabled) .sky-submit-arrow{transform:translateX(3px);}

.sky-back{margin-top:2px;background:none;border:none;color:${C.boneDim};font-family:inherit;
  font-size:13.5px;cursor:pointer;transition:color .18s;padding:4px;}
.sky-back:hover{color:${C.bone};}

/* entrance */
.sky-rise{opacity:0;transform:translateY(14px);animation:skyRise .7s cubic-bezier(.2,.7,.2,1) forwards;}
@keyframes skyRise{to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){
  .sky-rise,.sky-spark-path{animation:none;opacity:1;transform:none;stroke-dashoffset:0;}
}
`
