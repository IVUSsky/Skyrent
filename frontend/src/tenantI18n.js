// Лек i18n за тенант портала. BG по подразбиране, EN опционално.
// Език се пази в localStorage 'skyrent_tenant_lang'. Покрива навигацията и
// потока за интернет (критичния път). Непокрити низове остават на BG —
// браузърният auto-translate ги хваща като fallback.
import { useState, useEffect } from 'react'

const DICT = {
  // Tabs
  'tab.home': ['Начало', 'Home'],
  'tab.chat': ['Помощник', 'Assistant'],
  'tab.photos': ['Снимки', 'Photos'],
  'tab.contract': ['Договор', 'Contract'],
  'tab.invoices': ['Фактури', 'Invoices'],
  'tab.addons': ['Услуги', 'Services'],
  'tab.internet': ['Интернет', 'Internet'],
  'tab.support': ['Поддръжка', 'Support'],
  'tab.consumption': ['Сметки', 'Utilities'],
  'tab.profile': ['Профил', 'Profile'],
  // Common
  'common.logout': ['Изход', 'Log out'],
  'common.loading': ['Зареждане...', 'Loading...'],
  'common.hello': ['Здравей,', 'Hello,'],
  'common.tenant': ['наемател', 'tenant'],
  'common.save': ['Запази', 'Save'],
  'common.error': ['Грешка', 'Error'],
  // Internet
  'net.title': ['Достъп до Wi-Fi', 'Wi-Fi Access'],
  'net.active': ['✅ Активен', '✅ Active'],
  'net.expired': ['Изтекъл', 'Expired'],
  'net.validUntil': ['Активен до', 'Active until'],
  'net.timeLeft': ['Оставащо време', 'Time remaining'],
  'net.choosePlan': ['Изберете план', 'Choose a plan'],
  'net.buy': ['Купи', 'Buy'],
  'net.pay': ['Плати', 'Pay'],
  'net.perMonth': ['/мес', '/mo'],
  'net.username': ['Потребител', 'Username'],
  'net.password': ['Парола', 'Password'],
  'net.mac': ['MAC адрес на устройството', 'Device MAC address'],
  'net.macHint': ['Запази MAC, за да се връзваш без вход всеки път', 'Save your MAC to connect without logging in each time'],
  'net.macSave': ['Запази MAC', 'Save MAC'],
  'net.noService': ['Интернет услугата все още не е налична за този имот. Ако имате интерес, свържете се с нас през „Поддръжка“.',
                    'Internet service is not available for this property yet. If interested, contact us via “Support”.'],
  'net.payNote': ['Плати с карта, Google Pay или Apple Pay. Достъпът се активира автоматично.',
                  'Pay by card, Google Pay or Apple Pay. Access activates automatically.'],
  'net.howto': ['Как да се свържа', 'How to connect'],
  'net.step1': ['Плати план тук', 'Pay for a plan here'],
  'net.step2': ['Свържи се към Wi-Fi мрежата на имота', 'Connect to the property Wi-Fi'],
  'net.step3': ['Влез с потребителя и паролата по-долу', 'Log in with the username and password below'],
}

const langs = ['bg', 'en']
export function getTenantLang() {
  const v = localStorage.getItem('skyrent_tenant_lang')
  return langs.includes(v) ? v : 'bg'
}
export function setTenantLang(l) {
  if (!langs.includes(l)) return
  localStorage.setItem('skyrent_tenant_lang', l)
  try { document.documentElement.lang = l } catch {}
  window.dispatchEvent(new CustomEvent('skyrent:tenant-lang', { detail: l }))
}

// React hook: връща { lang, t, toggle }
export function useTenantI18n() {
  const [lang, setLang] = useState(getTenantLang)
  useEffect(() => {
    try { document.documentElement.lang = lang } catch {}
    const h = (e) => setLang(e.detail)
    window.addEventListener('skyrent:tenant-lang', h)
    return () => window.removeEventListener('skyrent:tenant-lang', h)
  }, [lang])
  const idx = lang === 'en' ? 1 : 0
  const t = (key, fallback) => (DICT[key] ? DICT[key][idx] : (fallback ?? key))
  const toggle = () => setTenantLang(lang === 'bg' ? 'en' : 'bg')
  return { lang, t, toggle }
}
