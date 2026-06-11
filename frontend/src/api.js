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
    // 402 = изтекъл trial / спрян абонамент → прати към таб Абонамент
    if (r.status === 402) window.dispatchEvent(new CustomEvent('skyrent:billing-required'));
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
