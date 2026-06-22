// ─────────────────────────────────────────────────────────────────────────
// Skyrent — OG prerender Cloudflare Worker
// ─────────────────────────────────────────────────────────────────────────
// Проблем: Skyrent е SPA. Социалните crawler-и (Facebook, LinkedIn, WhatsApp,
// Telegram, Slack…) НЕ изпълняват JavaScript → виждат празен index.html без
// og: тагове → споделените линкове излизат без картинка/заглавие.
//
// Решение: този Worker засича crawler UA и връща лек HTML САМО с og: таговете.
// За всички останали (хора + Googlebot, който рендира JS) подава оригинала
// непроменен. За обявите (/obiava/<org>-<id>) дърпа данните от публичното API
// и слага реалната снимка + цена.
//
// ДЕПЛОЙ (еднократно):
//   1. Cloudflare dash → Workers & Pages → Create → Create Worker
//   2. Постави този код → Deploy
//   3. Worker → Settings → Triggers → Add route: `skycapital.pro/*`
//      (zone: skycapital.pro). По избор и `www.skycapital.pro/*`.
//   НЕ слагай route на app.* или api.* — само маркетинг домейна.
// ─────────────────────────────────────────────────────────────────────────

const API = 'https://api.skycapital.pro';
const SITE = 'https://skycapital.pro';

// Социални/preview ботове, които НЕ пускат JS. (Googlebot НЕ е тук — той рендира
// JS и взима каноничните тагове от самото приложение.)
const BOT = /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|vkShare|Embedly|Quora Link Preview|Skype|nuzzel|Applebot|Google-AMPHTML)/i;

const PT_LABEL = { '1-стаен': 'Едностаен', '2-стаен': 'Двустаен', '3-стаен': 'Тристаен' };

// Статичните маркетинг страници
const PAGES = {
  '/': {
    title: 'Skyrent — операционна система за наемния бизнес',
    desc: 'Имоти, наеми, фактури, договори и тенант портал на едно място. Плащанията идват сами, наемателите се самообслужват. Безплатно до 5 имота.',
  },
  '/kalkulator-naem': {
    title: 'Калкулатор данък наем 2026 — физически лица | Skyrent',
    desc: 'Безплатен калкулатор за данък върху доход от наем в България. 10% върху облагаемата основа (≈9% ефективно). Изчисли за секунда.',
  },
  '/dogovor-naem': {
    title: 'Договор за наем — безплатен образец (PDF) | Skyrent',
    desc: 'Генерирай готов договор за наем по български образец. Попълни данните и свали PDF за минута. Без регистрация.',
  },
  '/imoti': {
    title: 'Имоти под наем | Skyrent',
    desc: 'Актуални оферти за имоти под наем от наемодатели в Skyrent. Филтрирай по град, тип и цена.',
  },
};

const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, c => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
));

function ogHtml({ title, desc, image, url }) {
  const t = esc(title), d = esc(desc), u = esc(url);
  return `<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:site_name" content="Skyrent">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:url" content="${u}">
<meta property="og:locale" content="bg_BG">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
<link rel="canonical" href="${u}">
</head><body><h1>${t}</h1><p>${d}</p><p><a href="${u}">${u}</a></p></body></html>`;
}

export default {
  async fetch(request) {
    const ua = request.headers.get('user-agent') || '';
    if (!BOT.test(ua)) return fetch(request); // хора + Googlebot → оригиналното приложение

    const url = new URL(request.url);
    const path = url.pathname;

    // Обява → реални данни (снимка + цена) от публичното API
    const m = path.match(/^\/obiava\/(\d+)-(\d+)/);
    if (m) {
      try {
        const r = await fetch(`${API}/api/public/listings/${m[1]}/${m[2]}`);
        if (r.ok) {
          const d = await r.json();
          const label = PT_LABEL[d['тип']] || d['тип'] || 'Имот';
          const region = d['район'] ? ' · ' + d['район'] : '';
          const rent = Number(d['наем'] || 0);
          const title = `${label}${region} — ${rent}€/мес | Skyrent`;
          const desc = (d.desc || `${label} под наем${region} — ${rent}€/месец.`).slice(0, 180);
          const img = (d.photo_ids && d.photo_ids[0])
            ? `${API}/api/public/listings/${m[1]}/${m[2]}/photo/${d.photo_ids[0]}` : '';
          return new Response(ogHtml({ title, desc, image: img, url: SITE + path }),
            { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
        }
      } catch (_) { /* fallthrough */ }
    }

    const p = PAGES[path];
    if (p) {
      return new Response(ogHtml({ ...p, url: SITE + path }),
        { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    }

    return fetch(request); // непознат път → оригинала
  },
};
