import React, { useState, useRef, useEffect } from 'react'

export default function Login({ API, onLogin }) {
  const [step, setStep]         = useState('credentials')  // 'credentials' | 'totp'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [stageToken, setStageToken] = useState('')
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
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

  const goBack = () => {
    setStep('credentials'); setStageToken(''); setCode(''); setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f2f8' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '8px 20px' }}>
            <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '48px' }} />
          </div>
        </div>

        {step === 'credentials' ? (
          <>
            <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Вход в системата</h2>
            <form onSubmit={submitCreds} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Потребителско име или имейл</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Парола</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? 'Влизане...' : 'Вход'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800 text-center mb-1">🔐 Двуфакторна автентикация</h2>
            <p className="text-sm text-gray-500 text-center mb-5">Въведи 6-цифрения код от приложението</p>
            <form onSubmit={submitTotp} className="space-y-4">
              <div>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="000000"
                  maxLength={20}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-1 text-center">или backup код (XXXX-XXXX)</p>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? 'Проверка...' : 'Потвърди'}
              </button>
              <button type="button" onClick={goBack}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                ← обратно
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
