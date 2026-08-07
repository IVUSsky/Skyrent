import { useState, useEffect } from 'react'

// Клонира MIFARE Classic чипове през локален Proxmark3 bridge (localhost:8765),
// пуснат само на тази машина. Работи единствено когато Skyrent се отваря ОТТУК —
// браузърът не може да достигне USB устройство на друга машина.
const BRIDGE_URL = 'http://127.0.0.1:8765'

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
      {title && <h3 className="font-semibold text-gray-800 mb-3">{title}</h3>}
      {children}
    </div>
  )
}

export default function AccessChips() {
  const [token, setToken] = useState(localStorage.getItem('pm3_bridge_token') || '')
  const [tokenInput, setTokenInput] = useState('')
  const [health, setHealth] = useState(null) // null=checking, true/false
  const [healthErr, setHealthErr] = useState(null)
  const [step, setStep] = useState('idle') // idle | reading | read-done | writing | done | error
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [showRaw, setShowRaw] = useState(false)

  const checkHealth = () => {
    setHealth(null); setHealthErr(null)
    fetch(`${BRIDGE_URL}/health`)
      .then(r => r.json())
      .then(() => setHealth(true))
      .catch(e => { setHealth(false); setHealthErr(`${e.name}: ${e.message}`) })
  }
  useEffect(checkHealth, [])

  const saveToken = () => {
    if (!tokenInput.trim()) return
    localStorage.setItem('pm3_bridge_token', tokenInput.trim())
    setToken(tokenInput.trim())
  }

  const call = async (path) => {
    const r = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
    })
    const d = await r.json()
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Грешка от bridge-а')
    return d
  }

  const readSource = async () => {
    setStep('reading'); setErr(null); setResult(null)
    try {
      const d = await call('/clone/read')
      setResult(d); setStep('read-done')
    } catch (e) { setErr(e.message); setStep('error') }
  }

  const writeTarget = async () => {
    setStep('writing'); setErr(null)
    try {
      const d = await call('/clone/write')
      setResult(r => ({ ...r, write: d })); setStep('done')
    } catch (e) { setErr(e.message); setStep('error') }
  }

  const reset = () => { setStep('idle'); setResult(null); setErr(null) }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">🔑 Чипове за вход</h2>
        <p className="text-sm text-gray-500 mt-1">
          Клониране на MIFARE Classic чипове през Proxmark3, свързан локално с тази машина.
        </p>
      </div>

      {!token ? (
        <Card title="Bridge token">
          <p className="text-sm text-gray-600 mb-2">
            Постави token-а, който bridge сървърът отпечата при първо стартиране (конзолата, от която пусна <code>node server.js</code>).
          </p>
          <div className="flex gap-2">
            <input value={tokenInput} onChange={e => setTokenInput(e.target.value)}
              placeholder="bridge token" className="flex-1 border rounded px-3 py-1.5 font-mono text-sm" />
            <button onClick={saveToken} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">Запази</button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                Bridge статус:{' '}
                {health === null && <span className="text-gray-400">проверка...</span>}
                {health === true && <span className="text-green-600 font-medium">🟢 Свързан</span>}
                {health === false && (
                  <>
                    <span className="text-red-600 font-medium">🔴 Няма връзка — пусни <code>node server.js</code> в proxmark-bridge папката</span>
                    {healthErr && <div className="text-xs text-red-500 font-mono mt-1">{healthErr}</div>}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={checkHealth} className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded">↻ Провери</button>
                <button onClick={() => { localStorage.removeItem('pm3_bridge_token'); setToken('') }}
                  className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 border rounded">Смени token</button>
              </div>
            </div>
          </Card>

          <Card title="1️⃣ Прочети оригинала">
            <p className="text-sm text-gray-600 mb-3">Постави съществуващия чип на антената на Proxmark3 и натисни бутона.</p>
            <button onClick={readSource} disabled={step === 'reading' || health !== true}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg">
              {step === 'reading' ? 'Чета... (може да отнеме до 2-3 мин)' : '📖 Прочети оригинал'}
            </button>
            {result?.uid && (
              <div className="mt-3 text-sm bg-green-50 border border-green-200 rounded-lg p-3">
                ✅ Прочетен успешно — UID: <span className="font-mono font-semibold">{result.uid}</span>
                {result.dumpFile && <div className="text-xs text-gray-500 mt-1">Файл: {result.dumpFile}</div>}
              </div>
            )}
          </Card>

          {(step === 'read-done' || step === 'writing' || step === 'done') && (
            <Card title="2️⃣ Запиши на празния чип">
              <p className="text-sm text-gray-600 mb-3">Махни оригинала, постави празния (magic/CUID) чип на антената и натисни бутона.</p>
              <button onClick={writeTarget} disabled={step === 'writing'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg">
                {step === 'writing' ? 'Записвам...' : '✍️ Запиши на празен чип'}
              </button>
              {step === 'done' && (
                <div className="mt-3 text-sm bg-green-50 border border-green-200 rounded-lg p-3">
                  ✅ Клонирането е готово — чипът е копие на UID {result.uid}
                </div>
              )}
            </Card>
          )}

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              ❌ {err}
            </div>
          )}

          {result?.raw && (
            <Card>
              <button onClick={() => setShowRaw(s => !s)} className="text-xs text-gray-500 hover:text-gray-700">
                {showRaw ? '▲ Скрий' : '▼ Покажи'} raw pm3 изход
              </button>
              {showRaw && <pre className="mt-2 text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{result.raw}</pre>}
            </Card>
          )}

          {step !== 'idle' && (
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700">↺ Започни отначало (ново клониране)</button>
          )}
        </>
      )}
    </div>
  )
}
