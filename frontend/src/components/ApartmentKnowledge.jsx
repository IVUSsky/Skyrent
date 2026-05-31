import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const EMPTY_APPLIANCE = { name: '', brand_model: '', instructions: '' }
const EMPTY_CONTACT   = { role: '', name: '', phone: '', notes: '' }

const EMPTY_KNOWLEDGE = {
  wifi_ssid: '',
  wifi_password: '',
  internet_provider: '',
  internet_account: '',
  building_info: '',
  payment_instructions: '',
  free_faq: '',
  appliances: [],
  contacts: [],
}

export default function ApartmentKnowledge({ API, property, onClose }) {
  const [form, setForm] = useState(EMPTY_KNOWLEDGE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    if (!property?.id) return
    setLoading(true)
    apiFetch(`${API}/api/properties/${property.id}/knowledge`)
      .then(r => r.json())
      .then(data => {
        setForm({
          wifi_ssid: data.wifi_ssid || '',
          wifi_password: data.wifi_password || '',
          internet_provider: data.internet_provider || '',
          internet_account: data.internet_account || '',
          building_info: data.building_info || '',
          payment_instructions: data.payment_instructions || '',
          free_faq: data.free_faq || '',
          appliances: Array.isArray(data.appliances) ? data.appliances : [],
          contacts:   Array.isArray(data.contacts)   ? data.contacts   : [],
        })
        setUpdatedAt(data.updated_at)
        setLoading(false)
      })
      .catch(e => { console.error(e); setLoading(false) })
  }, [property?.id, API])

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const addAppliance = () => setForm(f => ({ ...f, appliances: [...f.appliances, { ...EMPTY_APPLIANCE }] }))
  const updateAppliance = (i, key, value) => setForm(f => ({
    ...f,
    appliances: f.appliances.map((a, idx) => idx === i ? { ...a, [key]: value } : a),
  }))
  const removeAppliance = (i) => setForm(f => ({ ...f, appliances: f.appliances.filter((_, idx) => idx !== i) }))

  const addContact = () => setForm(f => ({ ...f, contacts: [...f.contacts, { ...EMPTY_CONTACT }] }))
  const updateContact = (i, key, value) => setForm(f => ({
    ...f,
    contacts: f.contacts.map((c, idx) => idx === i ? { ...c, [key]: value } : c),
  }))
  const removeContact = (i) => setForm(f => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }))

  const save = () => {
    setSaving(true)
    apiFetch(`${API}/api/properties/${property.id}/knowledge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(r => r.json())
      .then(() => { setSaving(false); onClose() })
      .catch(e => { setSaving(false); alert('Грешка: ' + e.message) })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900">💡 База знания за апартамента</h2>
            <div className="text-xs text-gray-500 mt-0.5">{property.адрес}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Info banner */}
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
          Тази информация ще се ползва от AI асистента в Tenant Portal-а, за да отговаря на въпроси на наемателите.
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-8 text-center text-gray-500">Зарежда…</div>
        ) : (
          <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
            {/* WiFi */}
            <section>
              <div className="text-sm font-semibold text-gray-800 mb-2">📶 WiFi</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Име на мрежата (SSID)</label>
                  <input type="text" value={form.wifi_ssid} onChange={e => update('wifi_ssid', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Парола</label>
                  <input type="text" value={form.wifi_password} onChange={e => update('wifi_password', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </section>

            {/* Internet */}
            <section>
              <div className="text-sm font-semibold text-gray-800 mb-2">🌐 Интернет доставчик</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Доставчик</label>
                  <input type="text" value={form.internet_provider} onChange={e => update('internet_provider', e.target.value)}
                    placeholder="напр. Vivacom, A1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Абонатен номер / договор</label>
                  <input type="text" value={form.internet_account} onChange={e => update('internet_account', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </section>

            {/* Appliances */}
            <section>
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-semibold text-gray-800">🔌 Уреди и инструкции</div>
                <button onClick={addAppliance} className="text-xs text-blue-600 hover:text-blue-800">+ добави уред</button>
              </div>
              {form.appliances.length === 0 ? (
                <div className="text-xs text-gray-400 italic">Няма добавени уреди</div>
              ) : (
                <div className="space-y-2">
                  {form.appliances.map((a, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-start bg-gray-50 p-2 rounded">
                      <input type="text" value={a.name} onChange={e => updateAppliance(i, 'name', e.target.value)}
                        placeholder="напр. Климатик"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <input type="text" value={a.brand_model} onChange={e => updateAppliance(i, 'brand_model', e.target.value)}
                        placeholder="марка/модел"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <textarea value={a.instructions} onChange={e => updateAppliance(i, 'instructions', e.target.value)}
                        placeholder="как се ползва, особености…" rows={2}
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <button onClick={() => removeAppliance(i)} className="text-red-500 hover:text-red-700 px-2" title="Премахни">×</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Contacts */}
            <section>
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-semibold text-gray-800">📞 Полезни контакти</div>
                <button onClick={addContact} className="text-xs text-blue-600 hover:text-blue-800">+ добави контакт</button>
              </div>
              {form.contacts.length === 0 ? (
                <div className="text-xs text-gray-400 italic">Няма добавени контакти</div>
              ) : (
                <div className="space-y-2">
                  {form.contacts.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 items-start bg-gray-50 p-2 rounded">
                      <input type="text" value={c.role} onChange={e => updateContact(i, 'role', e.target.value)}
                        placeholder="напр. Домоуправител"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <input type="text" value={c.name} onChange={e => updateContact(i, 'name', e.target.value)}
                        placeholder="Име"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <input type="text" value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)}
                        placeholder="Телефон"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <input type="text" value={c.notes} onChange={e => updateContact(i, 'notes', e.target.value)}
                        placeholder="бележка (по избор)"
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                      <button onClick={() => removeContact(i)} className="text-red-500 hover:text-red-700 px-2" title="Премахни">×</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Building info */}
            <section>
              <div className="text-sm font-semibold text-gray-800 mb-2">🏢 За сградата</div>
              <textarea value={form.building_info} onChange={e => update('building_info', e.target.value)}
                placeholder="вход, етаж, асансьор, паркинг, контейнери, портиер…" rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </section>

            {/* Payment instructions */}
            <section>
              <div className="text-sm font-semibold text-gray-800 mb-2">💳 Указания за плащане</div>
              <textarea value={form.payment_instructions} onChange={e => update('payment_instructions', e.target.value)}
                placeholder="до коя дата, IBAN, основание…" rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </section>

            {/* Free FAQ */}
            <section>
              <div className="text-sm font-semibold text-gray-800 mb-2">📝 Свободен текст / FAQ</div>
              <textarea value={form.free_faq} onChange={e => update('free_faq', e.target.value)}
                placeholder="всичко друго, което AI асистентът трябва да знае…" rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </section>

            {updatedAt && (
              <div className="text-xs text-gray-400">Последна редакция: {new Date(updatedAt).toLocaleString('bg-BG')}</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Отказ
          </button>
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors">
            {saving ? 'Запазва…' : 'Запази'}
          </button>
        </div>
      </div>
    </div>
  )
}
