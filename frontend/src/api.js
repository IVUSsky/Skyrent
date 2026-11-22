// Отказите на middleware/auth.js за изтекъл, подправен или липсващ токен.
//
// Разпознават се по текста, не само по статуса: 401 връщат и обикновени
// откази на вече влязъл потребител — „Грешна текуща парола“ при смяна на
// паролата в портала, „Грешен 2FA код“ при изключване на 2FA. Ако изхвърлим
// при всеки 401, наемател, сбъркал старата си парола, ще бъде разлогнат.
const SESSION_ERRORS = new Set(['Unauthorized', 'Invalid token']);

export function apiFetch(url, options = {}) {
  const token = localStorage.getItem('skyrent_token');
  const isFormData = options.body instanceof FormData;
  return fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(r => {
    // 402 има два случая:
    //  - спрян/изтекъл абонамент (без `capability`) → прати към таб Абонамент
    //  - capability-gate (липсваща функция в плана, има `capability`) → НЕ пренасочвай;
    //    функцията просто не е достъпна, обработва се локално.
    if (r.status === 402) {
      r.clone().json()
        .then(b => { if (!b || !b.capability) window.dispatchEvent(new CustomEvent('skyrent:billing-required')); })
        .catch(() => window.dispatchEvent(new CustomEvent('skyrent:billing-required')));
    }
    // 401 със сесиен отказ → App разлогва и показва входа. Без това токенът
    // живее 7 дни, а после всеки екран рисува празното си състояние: порталът
    // казваше на платил наемател „няма активен договор“ (22.11.2026), защото
    // `{"error":"Invalid token"}` се парсваше като отговор без договори.
    // Само ако сме пратили токен — публичните страници нямат какво да губят.
    if (r.status === 401 && token) {
      r.clone().json()
        .then(b => { if (b && SESSION_ERRORS.has(b.error)) window.dispatchEvent(new CustomEvent('skyrent:auth-expired')); })
        .catch(() => {});
    }
    return r;
  });
}

// For <a href>, <img src>, window.open — cases where we can't set Authorization
// header. Backend auth middleware accepts ?token= as fallback.
export function authUrl(path) {
  const token = localStorage.getItem('skyrent_token');
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}
