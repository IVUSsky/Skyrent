// Каноничен домейн за SEO — публичните страници се сервират и на skycapital.pro,
// и на app.skycapital.pro (duplicate content). Каноникът сочи винаги към
// skycapital.pro, за да не се разделя ранкингът между двата домейна.

const SITE = 'https://skycapital.pro';

export function setCanonical(path) {
  const href = SITE + (path != null ? path : window.location.pathname);
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el); }
  el.setAttribute('href', href);
}
