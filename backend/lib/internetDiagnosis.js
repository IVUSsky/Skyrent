// Диагностика на интернета за конкретен наемател — за AI чата в портала.
//
// Поводът (05–06.10.2026): ап.46 остана без нет, защото кабелът на доставчика
// беше преместен в друг порт на рутера. Наемателката първо пише в чата, затова
// чатът трябва да може да каже КОЕ е счупено, вместо да гадае: платен ли е
// пакетът, обажда ли се рутерът, и ако всичко е наред — проблемът е в самото
// устройство.
//
// Връща структура, готова за модела: причина + стъпки на прост език.

const SILENT_MINUTES = 15; // рутерът се обажда на 2 мин; 15 без вест = офлайн

function minutesSince(ts, now = new Date()) {
  if (!ts) return null;
  const s = String(ts).includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (isNaN(d)) return null;
  return Math.round((now.getTime() - d.getTime()) / 60000);
}

function propertyIdFor(db, userId) {
  const row = db.prepare(
    `SELECT property_id FROM contracts
      WHERE tenant_user_id=? AND status='active' AND property_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  return row ? row.property_id : null;
}

function diagnoseInternet(db, userId, now = new Date()) {
  const propertyId = propertyIdFor(db, userId);
  if (!propertyId) {
    return { has_service: false, likely_cause: 'no_contract',
      steps: ['В системата няма активен договор, към който да е вързана интернет услуга.'] };
  }

  const acc = db.prepare(
    `SELECT status, valid_until FROM internet_accounts WHERE property_id=? ORDER BY id DESC LIMIT 1`
  ).get(propertyId) || null;
  const router = db.prepare(
    `SELECT mode, desired_access, enforce_cutoff, poll_seen_at, status FROM routers WHERE property_id=? LIMIT 1`
  ).get(propertyId) || null;

  if (!acc && !router) {
    return { has_service: false, likely_cause: 'no_service',
      steps: ['За този имот няма интернет услуга през Skyrent — ако ползваш свой доставчик, проблемът е при него.'] };
  }

  const validUntil = acc?.valid_until ? new Date(String(acc.valid_until).endsWith('Z') || String(acc.valid_until).includes('T') ? acc.valid_until : acc.valid_until + 'Z') : null;
  const isPaid = !!(validUntil && validUntil > now);
  const daysLeft = validUntil ? Math.ceil((validUntil - now) / 86400000) : null;
  const silentFor = minutesSince(router?.poll_seen_at, now);
  const routerOnline = silentFor != null && silentFor <= SILENT_MINUTES;

  const out = {
    has_service: true,
    account: acc ? { status: acc.status, paid: isPaid, valid_until: acc.valid_until, days_left: daysLeft } : null,
    router: router ? {
      known: true, online: routerOnline,
      silent_for_minutes: silentFor,
      access_allowed_by_system: router.desired_access === 1,
      cutoff_enforced: router.enforce_cutoff !== 0,
    } : { known: false },
  };

  // 1) Непплатен пакет — системата сама спира достъпа
  if (acc && !isPaid) {
    out.likely_cause = 'expired_package';
    out.steps = [
      'Пакетът за интернет е изтекъл — затова достъпът е спрян автоматично.',
      'Купи нов пакет от раздел „🌐 Интернет" в портала; достъпът се пуска до 5 минути след плащането.',
    ];
    return out;
  }

  // 2) Платено, но рутерът мълчи → няма линия в апартамента
  if (router && !routerOnline) {
    out.likely_cause = 'router_offline';
    out.steps = [
      'Рутерът в апартамента не се е свързвал с нас' + (silentFor != null ? ` от около ${Math.round(silentFor / 60)} часа` : '') + ' — значи няма линия навън, а не че услугата е спряна.',
      'Провери дали рутерът свети (ако всички лампички са угаснали — няма ток или контактът е изключен).',
      'Най-честата причина: кабелът на доставчика е изваден или преместен. Той трябва да е в ПЪРВИЯ порт (ether1) — този най-вляво, до захранването. Ако е в друг порт, рутерът работи, но няма интернет.',
      'Ако кабелът е на място: изключи рутера от тока за 10 секунди и го включи пак; изчакай 2 минути.',
      'Ако и след това няма — пиши ни през „🛟 Поддръжка", за да проверим линията с доставчика.',
    ];
    return out;
  }

  // 3) Рутерът е онлайн, но системата държи достъпа спрян (рядко)
  if (router && routerOnline && router.desired_access !== 1) {
    out.likely_cause = 'blocked_by_system';
    out.steps = [
      'Рутерът работи, но достъпът още стои спрян от системата.',
      'Ако току-що си платил/а, изчакай 5 минути — проверката е на всеки 5 минути.',
      'Ако не се пусне, пиши през „🛟 Поддръжка" и ще го пуснем ръчно.',
    ];
    return out;
  }

  // 4) Всичко отвън е наред → проблемът е при устройството/Wi-Fi
  out.likely_cause = 'device_side';
  out.steps = [
    'Услугата е активна' + (daysLeft != null ? ` (пакетът ти е валиден още ${daysLeft} дни)` : '') + ', а рутерът е онлайн — значи линията работи.',
    'Провери към коя Wi-Fi мрежа си свързан/а — трябва да е мрежата на апартамента, не съседска.',
    'Изключи и включи Wi-Fi на телефона; ако има „забрави мрежата", направи го и се свържи наново.',
    'Пробвай с друго устройство — ако то има интернет, проблемът е само в първото.',
    'Ако нищо не помага, пиши през „🛟 Поддръжка" и опиши какво показва устройството.',
  ];
  return out;
}

module.exports = { diagnoseInternet, minutesSince, SILENT_MINUTES };
