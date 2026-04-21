import React, { useState } from 'react'

export default function Login({ API, onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data.token) {
          localStorage.setItem('skyrent_token', data.token)
          onLogin()
        } else {
          setError(data.error || 'Грешка при вход')
        }
      })
      .catch(() => { setLoading(false); setError('Не може да се свърже със сървъра') })
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f2f8' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '8px 20px' }}>
            <img src="/sky_capital_logo.png" alt="Sky Capital" style={{ height: '48px' }} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Вход в системата</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Потребителско име</label>
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
      </div>
    </div>
  )
}
