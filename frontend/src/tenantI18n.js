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
  // ── Общи (втора вълна, 17.09.2026 — целият портал) ──
  'common.cancel':     ['Отказ', 'Cancel', 'Отмена', 'Скасувати'],
  'common.serverError':['Сървърна грешка', 'Server error', 'Ошибка сервера', 'Помилка сервера'],
  'common.loadError':  ['Грешка при зареждане', 'Loading error', 'Ошибка загрузки', 'Помилка завантаження'],
  'common.property':   ['Имот', 'Property', 'Объект', 'Житло'],
  'common.name':       ['Име', 'Name', 'Имя', 'Ім’я'],
  'common.email':      ['Имейл', 'Email', 'Эл. почта', 'Ел. пошта'],
  'common.phone':      ['Телефон', 'Phone', 'Телефон', 'Телефон'],
  'common.month':      ['/мес.', '/mo.', '/мес.', '/міс.'],
  'common.days':       ['дни', 'days', 'дней', 'днів'],
  // Toasts (Stripe)
  'toast.paid':        ['✅ Плащането е получено! Фактурата е маркирана като платена.', '✅ Payment received! The invoice is marked as paid.', '✅ Платёж получен! Счёт отмечен как оплаченный.', '✅ Платіж отримано! Рахунок позначено як сплачений.'],
  'toast.payCancel':   ['Плащането беше прекратено. Можеш да опиташ отново.', 'Payment was cancelled. You can try again.', 'Платёж отменён. Можно попробовать снова.', 'Платіж скасовано. Можна спробувати ще раз.'],
  'toast.autopayOn':   ['✅ Автоплащането е активирано! От следващия месец наемът ще се тегли автоматично.', '✅ Autopay is on! From next month the rent will be collected automatically.', '✅ Автоплатёж включён! Со следующего месяца аренда будет списываться автоматически.', '✅ Автоплатіж увімкнено! З наступного місяця оренда списуватиметься автоматично.'],
  'toast.autopayCancel':['Активирането беше прекратено.', 'Activation was cancelled.', 'Активация отменена.', 'Активацію скасовано.'],
  // PWA
  'pwa.install':       ['Инсталирай приложението', 'Install the app', 'Установить приложение', 'Встановити застосунок'],
  'pwa.iosHint':       ['В Safari натисни', 'In Safari tap', 'В Safari нажмите', 'У Safari натисніть'],
  'pwa.quick':         ['Бърз достъп от началния екран на телефона', 'Quick access from your phone’s home screen', 'Быстрый доступ с главного экрана телефона', 'Швидкий доступ з головного екрана телефону'],
  'pwa.installBtn':    ['Инсталирай', 'Install', 'Установить', 'Встановити'],
  // Chat
  'chat.empty':        ['Питай ме за апартамента, договора, плащанията…', 'Ask me about the apartment, the contract, payments…', 'Спросите меня о квартире, договоре, платежах…', 'Запитайте мене про квартиру, договір, платежі…'],
  'chat.example':      ['Например: „Каква е WiFi паролата?" или „Колко дължа?"', 'For example: “What is the WiFi password?” or “How much do I owe?”', 'Например: «Какой пароль от WiFi?» или «Сколько я должен?»', 'Наприклад: «Який пароль від WiFi?» або «Скільки я винен?»'],
  'chat.typing':       ['пише…', 'typing…', 'печатает…', 'друкує…'],
  'chat.placeholder':  ['Напиши съобщение…', 'Write a message…', 'Напишите сообщение…', 'Напишіть повідомлення…'],
  'chat.error':        ['Грешка: ', 'Error: ', 'Ошибка: ', 'Помилка: '],
  // Home
  'home.noContract':   ['Все още няма активен договор за имот, свързан с Вашия профил.', 'There is no active contract for a property linked to your profile yet.', 'Пока нет активного договора на объект, связанный с вашим профилем.', 'Поки немає активного договору на житло, пов’язане з вашим профілем.'],
  'home.contactUs':    ['Свържете се с екипа на Sky Capital за повече информация.', 'Contact the Sky Capital team for more information.', 'Свяжитесь с командой Sky Capital для подробностей.', 'Зв’яжіться з командою Sky Capital для деталей.'],
  'home.q1':           ['Колко дължа?', 'How much do I owe?', 'Сколько я должен?', 'Скільки я винен?'],
  'home.q2':           ['Каква е WiFi паролата?', 'What is the WiFi password?', 'Какой пароль от WiFi?', 'Який пароль від WiFi?'],
  'home.q3':           ['До кога е договорът?', 'When does the contract end?', 'До какого числа договор?', 'До якого числа договір?'],
  'home.q4':           ['Как да платя наема?', 'How do I pay the rent?', 'Как оплатить аренду?', 'Як сплатити оренду?'],
  'home.aiTitle':      ['AI Помощник', 'AI Assistant', 'AI Помощник', 'AI Помічник'],
  'home.aiSub':        ['Питай за апартамента, наема, плащане, уредите…', 'Ask about the apartment, rent, payments, appliances…', 'Спросите о квартире, аренде, оплате, технике…', 'Запитайте про квартиру, оренду, оплату, техніку…'],
  'home.type':         ['Тип', 'Type', 'Тип', 'Тип'],
  'home.area':         ['Площ', 'Area', 'Площадь', 'Площа'],
  'home.rent':         ['Наем', 'Rent', 'Аренда', 'Оренда'],
  'home.internet':     ['Интернет', 'Internet', 'Интернет', 'Інтернет'],
  'home.contractEnds': ['Договорът изтича', 'Contract ends', 'Договор истекает', 'Договір закінчується'],
  'home.netContractEnds':['Интернет договорът изтича', 'Internet contract ends', 'Интернет-договор истекает', 'Інтернет-договір закінчується'],
  'home.utilityIds':   ['Абонатни номера за сметки', 'Utility account numbers', 'Абонентские номера для счетов', 'Абонентські номери для рахунків'],
  'home.electricity':  ['Ток', 'Electricity', 'Электричество', 'Електрика'],
  'home.water':        ['Вода', 'Water', 'Вода', 'Вода'],
  'home.heating':      ['Топлофикация', 'District heating', 'Отопление', 'Опалення'],
  'home.entranceFee':  ['Входна такса', 'Building fee', 'Плата за подъезд', 'Плата за під’їзд'],
  'home.contact':      ['Контакт със Sky Capital', 'Contact Sky Capital', 'Связь со Sky Capital', 'Зв’язок зі Sky Capital'],
  // Photos
  'photos.none':       ['Няма имот.', 'No property.', 'Нет объекта.', 'Немає житла.'],
  'photos.loading':    ['Зареждане на снимките...', 'Loading photos...', 'Загрузка фото...', 'Завантаження фото...'],
  'photos.empty':      ['Все още няма снимки на имота.', 'No photos of the property yet.', 'Фото объекта пока нет.', 'Фото житла поки немає.'],
  // Contract
  'contract.none':     ['Няма свързани договори.', 'No linked contracts.', 'Нет связанных договоров.', 'Немає пов’язаних договорів.'],
  'contract.rent':     ['🏠 Договор за наем', '🏠 Rental contract', '🏠 Договор аренды', '🏠 Договір оренди'],
  'contract.internet': ['🌐 Договор за интернет', '🌐 Internet contract', '🌐 Интернет-договор', '🌐 Інтернет-договір'],
  'contract.openEnded':['безсрочен', 'open-ended', 'бессрочный', 'безстроковий'],
  'contract.internetSuffix':[' интернет', ' internet', ' интернет', ' інтернет'],
  'contract.download': ['📄 Изтегли PDF', '📄 Download PDF', '📄 Скачать PDF', '📄 Завантажити PDF'],
  'status.active':     ['Активен', 'Active', 'Активен', 'Активний'],
  'status.draft':      ['Чернова', 'Draft', 'Черновик', 'Чернетка'],
  'status.sent':       ['Изпратен', 'Sent', 'Отправлен', 'Надіслано'],
  'status.terminated': ['Прекратен', 'Terminated', 'Расторгнут', 'Розірвано'],
  // Invoices
  'inv.payError':      ['Грешка при стартиране на плащането', 'Could not start the payment', 'Не удалось начать оплату', 'Не вдалося розпочати оплату'],
  'inv.empty':         ['Все още няма издадени фактури.', 'No invoices issued yet.', 'Счетов пока нет.', 'Рахунків поки немає.'],
  'inv.creditNote':    ['КИ', 'CN', 'КН', 'КН'],
  'inv.paid':          ['✓ Платена', '✓ Paid', '✓ Оплачен', '✓ Сплачено'],
  'inv.includes':      ['Включва (доп. услуги):', 'Includes (extra services):', 'Включает (доп. услуги):', 'Включає (дод. послуги):'],
  'inv.deposit':       [' (депозит)', ' (deposit)', ' (депозит)', ' (депозит)'],
  'inv.due':           ['Падеж: ', 'Due: ', 'Срок: ', 'Термін: '],
  'inv.pay':           ['💳 Плати', '💳 Pay', '💳 Оплатить', '💳 Сплатити'],
  'inv.bankOnly':      ['Само по банков път', 'Bank transfer only', 'Только банковским переводом', 'Лише банківським переказом'],
  // Addons
  'addon.requested':   ['✓ Заявката за "{name}" е изпратена. Управителят ще я прегледа.', '✓ Request for "{name}" sent. The manager will review it.', '✓ Заявка на «{name}» отправлена. Управляющий её рассмотрит.', '✓ Заявку на «{name}» надіслано. Керівник її розгляне.'],
  'addon.cancelAsk':   ['Да отменя ли заявката за {name}?', 'Cancel the request for {name}?', 'Отменить заявку на {name}?', 'Скасувати заявку на {name}?'],
  'addon.pending':     ['⏳ Чакаща', '⏳ Pending', '⏳ Ожидает', '⏳ Очікує'],
  'addon.active':      ['✓ Активна', '✓ Active', '✓ Активна', '✓ Активна'],
  'addon.stopped':     ['⏹ Спряна', '⏹ Stopped', '⏹ Остановлена', '⏹ Зупинена'],
  'addon.rejected':    ['✗ Отказана', '✗ Rejected', '✗ Отклонена', '✗ Відхилена'],
  'addon.mine':        ['Моите услуги', 'My services', 'Мои услуги', 'Мої послуги'],
  'addon.perMonth':    ['€/мес', '€/mo', '€/мес', '€/міс'],
  'addon.depositWord': ['депозит', 'deposit', 'депозит', 'депозит'],
  'addon.depRefunded': [' (върнат)', ' (refunded)', ' (возвращён)', ' (повернуто)'],
  'addon.depHeld':     [' (удържан)', ' (charged)', ' (удержан)', ' (утримано)'],
  'addon.depPending':  [' (предстои)', ' (upcoming)', ' (предстоит)', ' (очікується)'],
  'addon.cancel':      ['Отмени', 'Cancel', 'Отменить', 'Скасувати'],
  'addon.available':   ['Налични услуги', 'Available services', 'Доступные услуги', 'Доступні послуги'],
  'addon.info':        ['Заявката отива до управителя. След одобрение услугата се добавя към следващата ви фактура.', 'The request goes to the manager. Once approved, the service is added to your next invoice.', 'Заявка уходит управляющему. После одобрения услуга добавляется к следующему счёту.', 'Заявка йде до керівника. Після схвалення послуга додається до наступного рахунку.'],
  'addon.depositInfo': [' Някои услуги изискват еднократен депозит, който се връща при прекратяване.', ' Some services require a one-time deposit, refunded on cancellation.', ' Некоторые услуги требуют разовый депозит, возвращаемый при отказе.', ' Деякі послуги потребують разовий депозит, який повертається при відмові.'],
  'addon.plusDeposit': ['+ депозит', '+ deposit', '+ депозит', '+ депозит'],
  'addon.stActive':    ['активна', 'active', 'активна', 'активна'],
  'addon.stRequested': ['заявена', 'requested', 'заявлена', 'заявлена'],
  'addon.request':     ['Заяви', 'Request', 'Заявить', 'Замовити'],
  // Internet (portal)
  'net.noService2':    ['🌐 Интернет услугата все още не е налична за този имот.', '🌐 Internet service is not available for this property yet.', '🌐 Интернет-услуга пока недоступна для этого объекта.', '🌐 Інтернет-послуга поки недоступна для цього житла.'],
  'net.noService3':    ['Ако имате интерес, свържете се с нас през „Поддръжка“.', 'If interested, contact us via “Support”.', 'Если интересно, свяжитесь с нами через «Поддержка».', 'Якщо цікаво, звертайтеся через «Підтримка».'],
  'net.min':           ['мин', 'min', 'мин', 'хв'],
  'net.hours':         ['часа', 'hours', 'ч.', 'год.'],
  'net.daysLeft':      ['дни', 'days', 'дн.', 'дн.'],
  'net.remaining':     ['остават ', 'remaining: ', 'осталось ', 'залишилось '],
  'net.until':         ['До: ', 'Until: ', 'До: ', 'До: '],
  'net.noPackage':     ['❌ Няма активен пакет', '❌ No active package', '❌ Нет активного пакета', '❌ Немає активного пакета'],
  'net.choose':        ['Изберете план по-долу за да активирате интернет.', 'Choose a plan below to activate the internet.', 'Выберите план ниже, чтобы активировать интернет.', 'Виберіть план нижче, щоб активувати інтернет.'],
  'net.wifiCreds':     ['За свързване към Wi-Fi мрежата:', 'To connect to the Wi-Fi network:', 'Для подключения к Wi-Fi:', 'Для підключення до Wi-Fi:'],
  'net.macTitle':      ['MAC адрес на устройството ви (опционално)', 'Your device MAC address (optional)', 'MAC-адрес вашего устройства (необязательно)', 'MAC-адреса вашого пристрою (необов’язково)'],
  'net.macHint2':      ['Ако зададете MAC, ще се свързвате автоматично без парола.', 'With a MAC set you connect automatically, without a password.', 'С указанным MAC вы подключаетесь автоматически, без пароля.', 'Із вказаним MAC ви підключаєтесь автоматично, без пароля.'],
  'net.buyTitle':      ['Купи пакет', 'Buy a package', 'Купить пакет', 'Купити пакет'],
  'net.buyInfo':       ['Изберете пакет — заплащате с карта; интернетът се активира веднага.', 'Choose a package — pay by card; the internet activates immediately.', 'Выберите пакет — оплата картой; интернет активируется сразу.', 'Виберіть пакет — оплата карткою; інтернет активується одразу.'],
  'net.buyBtn':        ['💳 Купи', '💳 Buy', '💳 Купить', '💳 Купити'],
  'net.history':       ['История на покупките', 'Purchase history', 'История покупок', 'Історія покупок'],
  'net.paidSt':        ['✓ Платен', '✓ Paid', '✓ Оплачен', '✓ Сплачено'],
  'net.pendingSt':     ['⏳ Чакащ', '⏳ Pending', '⏳ Ожидает', '⏳ Очікує'],
  // Tickets
  'tk.catPlumbing':    ['🚿 ВиК (теч, запушване)', '🚿 Plumbing (leak, blockage)', '🚿 Сантехника (течь, засор)', '🚿 Сантехніка (протікання, засмічення)'],
  'tk.catElectrical':  ['⚡ Електро (ток, осветление)', '⚡ Electrical (power, lighting)', '⚡ Электрика (свет, розетки)', '⚡ Електрика (світло, розетки)'],
  'tk.catAppliance':   ['🔌 Уред (хладилник, перална)', '🔌 Appliance (fridge, washer)', '🔌 Техника (холодильник, стиралка)', '🔌 Техніка (холодильник, пралка)'],
  'tk.catHeating':     ['🔥 Отопление (бойлер, климатик)', '🔥 Heating (boiler, A/C)', '🔥 Отопление (бойлер, кондиционер)', '🔥 Опалення (бойлер, кондиціонер)'],
  'tk.catInternet':    ['🌐 Интернет / TV', '🌐 Internet / TV', '🌐 Интернет / ТВ', '🌐 Інтернет / ТБ'],
  'tk.catCleaning':    ['🧹 Чистене / битови', '🧹 Cleaning / household', '🧹 Уборка / бытовое', '🧹 Прибирання / побутове'],
  'tk.catOther':       ['📌 Друго', '📌 Other', '📌 Другое', '📌 Інше'],
  'tk.stOpen':         ['⏳ Отворен', '⏳ Open', '⏳ Открыт', '⏳ Відкрито'],
  'tk.stProgress':     ['🔧 В процес', '🔧 In progress', '🔧 В работе', '🔧 У роботі'],
  'tk.stResolved':     ['✓ Разрешен', '✓ Resolved', '✓ Решён', '✓ Вирішено'],
  'tk.stClosed':       ['🔒 Затворен', '🔒 Closed', '🔒 Закрыт', '🔒 Закрито'],
  'tk.titleRequired':  ['Заглавието е задължително', 'Title is required', 'Заголовок обязателен', 'Заголовок обов’язковий'],
  'tk.back':           ['← Към списъка', '← Back to list', '← К списку', '← До списку'],
  'tk.new':            ['➕ Нов сигнал за проблем', '➕ New issue report', '➕ Новая заявка о проблеме', '➕ Нове повідомлення про проблему'],
  'tk.newTitle':       ['Нов сигнал', 'New report', 'Новая заявка', 'Нове повідомлення'],
  'tk.category':       ['Категория', 'Category', 'Категория', 'Категорія'],
  'tk.title':          ['Заглавие', 'Title', 'Заголовок', 'Заголовок'],
  'tk.titlePh':        ["Кратко описание (пр. 'Тече кранът в банята')", "Short description (e.g. 'Bathroom tap is leaking')", "Кратко (напр. «Течёт кран в ванной»)", "Коротко (напр. «Тече кран у ванній»)"],
  'tk.desc':           ['Описание (по желание)', 'Description (optional)', 'Описание (необязательно)', 'Опис (необов’язково)'],
  'tk.descPh':         ['Кога започна? Колко често? Какво забелязахте?', 'When did it start? How often? What did you notice?', 'Когда началось? Как часто? Что заметили?', 'Коли почалося? Як часто? Що помітили?'],
  'tk.priority':       ['Приоритет', 'Priority', 'Приоритет', 'Пріоритет'],
  'tk.prLow':          ['🟢 Ниско', '🟢 Low', '🟢 Низкий', '🟢 Низький'],
  'tk.prNormal':       ['🔵 Нормално', '🔵 Normal', '🔵 Обычный', '🔵 Звичайний'],
  'tk.prHigh':         ['🟠 Високо', '🟠 High', '🟠 Высокий', '🟠 Високий'],
  'tk.prUrgent':       ['🔴 Спешно', '🔴 Urgent', '🔴 Срочно', '🔴 Терміново'],
  'tk.files':          ['Снимки/файлове', 'Photos/files', 'Фото/файлы', 'Фото/файли'],
  'tk.filesChosen':    [' файла избрани', ' files selected', ' файл(ов) выбрано', ' файл(ів) вибрано'],
  'tk.sending':        ['Изпраща...', 'Sending...', 'Отправка...', 'Надсилання...'],
  'tk.send':           ['📤 Изпрати сигнал', '📤 Send report', '📤 Отправить', '📤 Надіслати'],
  'tk.empty':          ['Все още няма подадени сигнали.', 'No reports submitted yet.', 'Заявок пока нет.', 'Повідомлень поки немає.'],
  'tk.manager':        ['👤 Управителят: ', '👤 Manager: ', '👤 Управляющий: ', '👤 Керівник: '],
  'tk.you':            ['🗣️ Вие: ', '🗣️ You: ', '🗣️ Вы: ', '🗣️ Ви: '],
  // Consumption / Profile
  'cons.none':         ['Все още няма обвързан имот.', 'No property linked yet.', 'Объект ещё не привязан.', 'Житло ще не прив’язане.'],
  'prof.title':        ['Моят профил', 'My profile', 'Мой профиль', 'Мій профіль'],
  'prof.username':     ['Потребител', 'Username', 'Пользователь', 'Користувач'],
  'prof.changePwd':    ['🔑 Смяна на парола', '🔑 Change password', '🔑 Сменить пароль', '🔑 Змінити пароль'],
  // Autopay
  'ap.setupError':     ['Грешка при стартиране на настройката', 'Could not start the setup', 'Не удалось начать настройку', 'Не вдалося розпочати налаштування'],
  'ap.title':          ['💳 Автоплащане', '💳 Autopay', '💳 Автоплатёж', '💳 Автоплатіж'],
  'ap.titleFull':      ['💳 Автоплащане (SEPA Direct Debit)', '💳 Autopay (SEPA Direct Debit)', '💳 Автоплатёж (SEPA Direct Debit)', '💳 Автоплатіж (SEPA Direct Debit)'],
  'ap.activeSt':       ['✓ Активно', '✓ Active', '✓ Активно', '✓ Активно'],
  'ap.since':          ['от ', 'since ', 'с ', 'з '],
  'ap.ibanEnding':     ['IBAN завършващ на: ', 'IBAN ending in: ', 'IBAN, оканчивающийся на: ', 'IBAN, що закінчується на: '],
  'ap.monthlyOn':      ['Месечно теглене на: ', 'Monthly debit on the: ', 'Ежемесячное списание: ', 'Щомісячне списання: '],
  'ap.dayOfMonth':     ['-то число', 'th of the month', '-го числа', '-го числа'],
  'ap.infoActive':     ['Наемът ще се тегли автоматично от Вашата банкова сметка всеки месец. Можете да деактивирате по всяко време.', 'The rent is collected automatically from your bank account every month. You can deactivate at any time.', 'Аренда будет списываться автоматически с вашего счёта каждый месяц. Отключить можно в любой момент.', 'Оренда списуватиметься автоматично з вашого рахунку щомісяця. Вимкнути можна будь-коли.'],
  'ap.confirmOff':     ['Да, деактивирай', 'Yes, deactivate', 'Да, отключить', 'Так, вимкнути'],
  'ap.deactivate':     ['🚫 Деактивирай автоплащане', '🚫 Deactivate autopay', '🚫 Отключить автоплатёж', '🚫 Вимкнути автоплатіж'],
  'ap.pitch':          ['Спестете време — оставете наемът да се тегли автоматично от Вашата банкова сметка всеки месец.', 'Save time — let the rent be collected automatically from your bank account every month.', 'Экономьте время — пусть аренда списывается автоматически каждый месяц.', 'Заощаджуйте час — нехай оренда списується автоматично щомісяця.'],
  'ap.b1':             ['✓ Няма повече забравяне на падежи', '✓ No more missed due dates', '✓ Больше никаких пропущенных сроков', '✓ Більше жодних пропущених термінів'],
  'ap.b2':             ['✓ Подписвате SEPA mandate веднъж', '✓ You sign the SEPA mandate once', '✓ SEPA-мандат подписывается один раз', '✓ SEPA-мандат підписується один раз'],
  'ap.b3':             ['✓ Можете да деактивирате по всяко време', '✓ You can deactivate at any time', '✓ Отключить можно в любой момент', '✓ Вимкнути можна будь-коли'],
  'ap.b4':             ['✓ Имате 8 седмици да оспорите всяко теглене', '✓ You have 8 weeks to dispute any debit', '✓ 8 недель на оспаривание любого списания', '✓ 8 тижнів на оскарження будь-якого списання'],
  'ap.starting':       ['Стартиране...', 'Starting...', 'Запуск...', 'Запуск...'],
  'ap.activate':       ['🏦 Активирай SEPA автоплащане', '🏦 Activate SEPA autopay', '🏦 Включить SEPA автоплатёж', '🏦 Увімкнути SEPA автоплатіж'],
  // Change password
  'pwd.min':           ['Паролата трябва да е поне 6 символа', 'Password must be at least 6 characters', 'Пароль должен быть не короче 6 символов', 'Пароль має містити щонайменше 6 символів'],
  'pwd.mismatch':      ['Паролите не съвпадат', 'Passwords do not match', 'Пароли не совпадают', 'Паролі не збігаються'],
  'pwd.serverError':   ['Грешка при сървъра', 'Server error', 'Ошибка сервера', 'Помилка сервера'],
  'pwd.welcome':       ['Добре дошли!', 'Welcome!', 'Добро пожаловать!', 'Ласкаво просимо!'],
  'pwd.title':         ['Смяна на парола', 'Change password', 'Смена пароля', 'Зміна пароля'],
  'pwd.first':         ['Моля задайте Ваша лична парола, преди да продължите.', 'Please set your own password before continuing.', 'Пожалуйста, задайте свой пароль, прежде чем продолжить.', 'Будь ласка, задайте власний пароль, перш ніж продовжити.'],
  'pwd.current':       ['Текуща парола', 'Current password', 'Текущий пароль', 'Поточний пароль'],
  'pwd.new':           ['Нова парола', 'New password', 'Новый пароль', 'Новий пароль'],
  'pwd.repeat':        ['Повторете новата парола', 'Repeat the new password', 'Повторите новый пароль', 'Повторіть новий пароль'],
  'pwd.saving':        ['Запис...', 'Saving...', 'Сохранение...', 'Збереження...'],
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

export function getTenantLocale() {
  return { bg: 'bg-BG', en: 'en-GB', ru: 'ru-RU', uk: 'uk-UA' }[getTenantLang()] || 'bg-BG'
}
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
  // t(key, fallback) или t(key, {name: 'x'}) — {name} в низа се замества
  const t = (key, fallback) => {
    let v = DICT[key] ? (DICT[key][idx] ?? DICT[key][0]) : (typeof fallback === 'string' ? fallback : key)
    if (fallback && typeof fallback === 'object') for (const [k, val] of Object.entries(fallback)) v = v.split('{' + k + '}').join(String(val))
    return v
  }
  // Локал за дати/числа според избрания език
  const locale = { bg: 'bg-BG', en: 'en-GB', ru: 'ru-RU', uk: 'uk-UA' }[lang] || 'bg-BG'
  // toggle = циклично през езиците (запазено за съвместимост)
  const toggle = () => {
    const i = LANG_CODES.indexOf(lang)
    setTenantLang(LANG_CODES[(i + 1) % LANG_CODES.length])
  }
  return { lang, locale, t, setLang: setTenantLang, toggle, langs: TENANT_LANGS }
}
