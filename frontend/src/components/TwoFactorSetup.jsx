import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function TwoFactorSetup({ API }) {
  const [status, setStatus] = useState(null)        // { enabled }
  const [stage, setStage]   = useState('idle')      // idle | setup | backup-codes | disable
  const [setupData, setSetupData] = useState(null)  // { secret, otpauth_url, qr_data_url }
  const [code, setCode]     = useState('')
  const [password, setPassword] = useState('')
  const [backupCodes, setBackupCodes] = useState([])
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const [toast, setToast]   = useState(null)

  useEffect(() => { loadStatus() }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const loadStatus = () => {
    apiFetch(`${API}/api/auth/2fa/status`).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }))
  }

  const startSetup = async () => {
    setBusy(true); setError(null)
    try {
      const r = await apiFetch(`${API}/api/auth/2fa/setup`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      setSetupData(data); setStage('setup'); setCode('')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const verifySetup = async () => {
    setBusy(true); setError(null)
    try {
      const r = await apiFetch(`${API}/api/auth/2fa/verify-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      setBackupCodes(data.backup_codes || [])
      setStage('backup-codes')
      loadStatus()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setError(null)
    try {
      const r = await apiFetch(`${API}/api/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      setToast({ type: 'success', text: '2FA е изключено.' })
      setStage('idle'); setCode(''); setPassword('')
      loadStatus()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const regenerateBackupCodes = async () => {
    const newCode = prompt('Въведи текущ 2FA код за да генерираш нови backup кодове:')
    if (!newCode) return
    setBusy(true); setError(null)
    try {
      const r = await apiFetch(`${API}/api/auth/2fa/regenerate-backup-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Грешка')
      setBackupCodes(data.backup_codes || [])
      setStage('backup-codes')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const copyBackupCodes = () => {
    const text = backupCodes.join('\n')
    navigator.clipboard?.writeText(text).then(
      () => setToast({ type: 'success', text: '✅ Копирано в clipboard' }),
      () => setToast({ type: 'error',   text: 'Не може да копира — селектирай и копирай ръчно' })
    )
  }

  if (!status) return <div className="text-sm text-gray-500">Зарежда…</div>

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-800">🔐 Двуфакторна автентикация (2FA)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Добавя втора стъпка при вход — 6-цифрен код от Google Authenticator, Authy или 1Password.
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${status.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
          {status.enabled ? '✓ Активно' : 'Изключено'}
        </span>
      </div>

      {toast && (
        <div className="mb-3 px-3 py-2 rounded text-sm"
          style={{ background: toast.type === 'success' ? '#dcfce7' : '#fee2e2', color: toast.type === 'success' ? '#166534' : '#991b1b' }}>
          {toast.text}
        </div>
      )}
      {error && <div className="mb-3 px-3 py-2 rounded text-sm bg-red-50 text-red-700">{error}</div>}

      {/* IDLE: enable or disable button */}
      {stage === 'idle' && !status.enabled && (
        <button onClick={startSetup} disabled={busy}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
          {busy ? 'Зарежда…' : '🔐 Активирай 2FA'}
        </button>
      )}
      {stage === 'idle' && status.enabled && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            2FA е активно. При всеки вход ще трябва да въведеш 6-цифрен код от приложението.
          </p>
          <div className="flex gap-2">
            <button onClick={regenerateBackupCodes} disabled={busy}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium px-3 py-2 rounded disabled:opacity-50">
              🔁 Регенерирай backup кодове
            </button>
            <button onClick={() => { setStage('disable'); setCode(''); setPassword(''); setError(null) }}
              className="bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium px-3 py-2 rounded">
              Изключи 2FA
            </button>
          </div>
        </div>
      )}

      {/* SETUP: show QR + verify input */}
      {stage === 'setup' && setupData && (
        <div className="space-y-4">
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Отвори приложението за 2FA (Google Authenticator / Authy / 1Password).</li>
            <li>Сканирай QR кода долу <strong>или</strong> ръчно въведи кода: <code className="bg-gray-100 px-1 rounded">{setupData.secret}</code></li>
            <li>Въведи 6-цифрения код който приложението показва за потвърждение.</li>
          </ol>
          <div className="flex justify-center bg-white p-3 rounded border border-gray-200">
            <img src={setupData.qr_data_url} alt="QR" style={{ width: 220, height: 220 }} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Код от приложението</label>
              <input
                type="text" inputMode="numeric" value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="000000" maxLength={6}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-lg text-center tracking-widest"
              />
            </div>
            <button onClick={verifySetup} disabled={busy || code.length < 6}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              {busy ? 'Проверка…' : 'Потвърди'}
            </button>
            <button onClick={() => { setStage('idle'); setSetupData(null); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
              Отказ
            </button>
          </div>
        </div>
      )}

      {/* BACKUP CODES: show ONCE */}
      {stage === 'backup-codes' && backupCodes.length > 0 && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
            ⚠️ <strong>Запази тези кодове на сигурно място (password manager, печатна копия и т.н.).</strong>
            Всеки код може да се ползва само веднъж за достъп ако загубиш телефона. След като затвориш този екран
            повече няма да можеш да ги видиш.
          </div>
          <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded p-3 font-mono text-sm">
            {backupCodes.map((c, i) => <div key={i}>{c}</div>)}
          </div>
          <div className="flex gap-2">
            <button onClick={copyBackupCodes}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded">
              📋 Копирай всички
            </button>
            <button onClick={() => { setStage('idle'); setBackupCodes([]); setSetupData(null) }}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium px-3 py-2 rounded">
              Запазих ги — затвори
            </button>
          </div>
        </div>
      )}

      {/* DISABLE form */}
      {stage === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">За да изключиш 2FA, потвърди с паролата + текущ 2FA код:</p>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Парола</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">2FA код (или backup код)</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value)}
              placeholder="000000"
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={disable} disabled={busy || !password || !code}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              Изключи
            </button>
            <button onClick={() => { setStage('idle'); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
              Отказ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
