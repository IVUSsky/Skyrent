// Лек i18n за тенант портала. BG по подразбиране; EN/RU/UA опционални.
// Език се пази в localStorage 'skyrent_tenant_lang'. Покрива навигацията и
// потока за интернет (критичния път). Непокрити низове остават на BG —
// браузърният auto-translate ги хваща като fallback.
// Всеки запис: [BG, EN, RU, UA].
import { useState, useEffect } from 'react'

const DICT = {
  // Tabs
  'tab.home':        ['Начало', 'Home', 'Главная', 'Головна'],
  'tab.chat':        ['Помощник', 'Assistant', 'Помощник', 'Помічник'],
  'tab.photos':      ['Снимки', 'Photos', 'Фото', 'Фото'],
  'tab.contract':    ['Договор', 'Contract', 'Договор', 'Договір'],
  'tab.invoices':    ['Фактури', 'Invoices', 'Счета', 'Рахунки'],
  'tab.addons':      ['Услуги', 'Services', 'Услуги', 'Послуги'],
  'tab.internet':    ['Интернет', 'Internet', 'Интернет', 'Інтернет'],
  'tab.support':     ['Поддръжка', 'Support', 'Поддержка', 'Підтримка'],
  'tab.consumption': ['Сметки', 'Utilities', 'Коммуналка', 'Комуналка'],
  'tab.profile':     ['Профил', 'Profile', 'Профиль', 'Профіль'],
  // Common
  'common.logout':   ['Изход', 'Log out', 'Выход', 'Вихід'],
  'common.loading':  ['Зареждане...', 'Loading...', 'Загрузка...', 'Завантаження...'],
  'common.hello':    ['Здравей,', 'Hello,', 'Привет,', 'Привіт,'],
  'common.tenant':   ['наемател', 'tenant', 'арендатор', 'орендар'],
  'common.save':     ['Запази', 'Save', 'Сохранить', 'Зберегти'],
  'common.error':    ['Грешка', 'Error', 'Ошибка', 'Помилка'],
  // Internet
  'net.title':       ['Достъп до Wi-Fi', 'Wi-Fi Access', 'Доступ к Wi-Fi', 'Доступ до Wi-Fi'],
  'net.active':      ['✅ Активен', '✅ Active', '✅ Активен', '✅ Активний'],
  'net.expired':     ['Изтекъл', 'Expired', 'Истёк', 'Закінчився'],
  'net.validUntil':  ['Активен до', 'Active until', 'Активен до', 'Активний до'],
  'net.timeLeft':    ['Оставащо време', 'Time remaining', 'Осталось времени', 'Залишилось часу'],
  'net.choosePlan':  ['Изберете план', 'Choose a plan', 'Выберите план', 'Виберіть план'],
  'net.buy':         ['Купи', 'Buy', 'Купить', 'Купити'],
  'net.pay':         ['Плати', 'Pay', 'Оплатить', 'Сплатити'],
  'net.perMonth':    ['/мес', '/mo', '/мес', '/міс'],
  'net.username':    ['Потребител', 'Username', 'Пользователь', 'Користувач'],
  'net.password':    ['Парола', 'Password', 'Пароль', 'Пароль'],
  'net.mac':         ['MAC адрес на устройството', 'Device MAC address', 'MAC-адрес устройства', 'MAC-адреса пристрою'],
  'net.macHint':     ['Запази MAC, за да се връзваш без вход всеки път', 'Save your MAC to connect without logging in each time',
                      'Сохраните MAC, чтобы подключаться без входа каждый раз', 'Збережіть MAC, щоб підключатися без входу щоразу'],
  'net.macSave':     ['Запази MAC', 'Save MAC', 'Сохранить MAC', 'Зберегти MAC'],
  'net.noService':   ['Интернет услугата все още не е налична за този имот. Ако имате интерес, свържете се с нас през „Поддръжка“.',
                      'Internet service is not available for this property yet. If interested, contact us via “Support”.',
                      'Интернет-услуга пока недоступна для этого объекта. Если интересно, свяжитесь с нами через «Поддержка».',
                      'Інтернет-послуга поки недоступна для цього житла. Якщо цікаво, звертайтеся до нас через «Підтримка».'],
  'net.payNote':     ['Плати с карта, Google Pay или Apple Pay. Достъпът се активира автоматично.',
                      'Pay by card, Google Pay or Apple Pay. Access activates automatically.',
                      'Оплатите картой, Google Pay или Apple Pay. Доступ активируется автоматически.',
                      'Сплатіть карткою, Google Pay або Apple Pay. Доступ активується автоматично.'],
  'net.howto':       ['Как да се свържа', 'How to connect', 'Как подключиться', 'Як підключитися'],
  'net.step1':       ['Плати план тук', 'Pay for a plan here', 'Оплатите план здесь', 'Сплатіть план тут'],
  'net.step2':       ['Свържи се към Wi-Fi мрежата на имота', 'Connect to the property Wi-Fi',
                      'Подключитесь к Wi-Fi сети объекта', 'Підключіться до Wi-Fi мережі житла'],
  'net.step3':       ['Влез с потребителя и паролата по-долу', 'Log in with the username and password below',
                      'Войдите с именем пользователя и паролем ниже', 'Увійдіть з іменем користувача та паролем нижче'],
}

// Метаданни за превключвателя (code = ISO 639-1; UA е етикетът за uk).
export const TENANT_LANGS = [
  { code: 'bg', label: 'BG' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UA' },
]
const LANG_CODES = TENANT_LANGS.map(l => l.code)
const IDX = { bg: 0, en: 1, ru: 2, uk: 3 }

export function getTenantLang() {
  const v = localStorage.getItem('skyrent_tenant_lang')
  return LANG_CODES.includes(v) ? v : 'bg'
}
export function setTenantLang(l) {
  if (!LANG_CODES.includes(l)) return
  localStorage.setItem('skyrent_tenant_lang', l)
  try { document.documentElement.lang = l } catch {}
  window.dispatchEvent(new CustomEvent('skyrent:tenant-lang', { detail: l }))
}

// React hook: връща { lang, t, setLang, toggle, langs }
export function useTenantI18n() {
  const [lang, setLang] = useState(getTenantLang)
  useEffect(() => {
    try { document.documentElement.lang = lang } catch {}
    const h = (e) => setLang(e.detail)
    window.addEventListener('skyrent:tenant-lang', h)
    return () => window.removeEventListener('skyrent:tenant-lang', h)
  }, [lang])
  const idx = IDX[lang] ?? 0
  const t = (key, fallback) => (DICT[key] ? (DICT[key][idx] ?? DICT[key][0]) : (fallback ?? key))
  // toggle = циклично през езиците (запазено за съвместимост)
  const toggle = () => {
    const i = LANG_CODES.indexOf(lang)
    setTenantLang(LANG_CODES[(i + 1) % LANG_CODES.length])
  }
  return { lang, t, setLang: setTenantLang, toggle, langs: TENANT_LANGS }
}
