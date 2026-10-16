// Линк към видео на обява → адрес за вграждане.
//
// Само YouTube и Vimeo: непознат домейн връща null, защото вграждането на
// произволен сайт в iframe е дупка в сигурността.
//
// ⚠️ YouTube има няколко форми за един и същ клип и лесно се изпуска някоя.
// Shorts държи номера в ПЪТЯ (/shorts/XXXX), а не в ?v= — заради това видеото
// на ап.4А не се показваше, без никакво съобщение за грешка.

const YT_ID = /^[A-Za-z0-9_-]{6,}$/;

// Разпознава и съотношението: Shorts са вертикални (9:16), обикновените 16:9.
// Без това вертикалното видео излиза с широки черни ленти отстрани.
function result(src, vertical = false) {
  return { src, vertical, ratio: vertical ? 177.78 : 56.25 };
}

export function parseVideo(url) {
  if (!url) return null;
  let u;
  try { u = new URL(String(url).trim()); } catch (_) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && YT_ID.test(v)) return result(ytEmbed(v, u));
    // /shorts/XXXX, /embed/XXXX, /live/XXXX, /v/XXXX
    if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0]) && YT_ID.test(parts[1])) {
      return result(ytEmbed(parts[1], u), parts[0] === 'shorts');
    }
    return null;   // канал, плейлист, търсене — няма конкретен клип
  }

  if (host === 'youtu.be' && parts[0] && YT_ID.test(parts[0])) {
    return result(ytEmbed(parts[0], u));
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find(p => /^\d+$/.test(p));
    if (id) return result(`https://player.vimeo.com/video/${id}`);
    return null;
  }

  return null;
}

// Запазва началото (?t=), ако е зададено — иначе клипът тръгва отначало
function ytEmbed(id, u) {
  const base = `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  const secs = t ? String(t).replace(/s$/, '') : null;
  return secs && /^\d+$/.test(secs) ? `${base}?start=${secs}` : base;
}

// Старата форма — само адресът, за местата, където съотношението не трябва
export function videoEmbed(url) {
  const r = parseVideo(url);
  return r ? r.src : null;
}

// За формата при въвеждане: какво да каже на човека, ако линкът не става
export function videoHint(url) {
  if (!url || !String(url).trim()) return null;
  if (parseVideo(url)) return null;
  const s = String(url).toLowerCase();
  if (s.includes('drive.google') || s.includes('dropbox') || s.includes('.mp4'))
    return 'Приемат се само YouTube и Vimeo. Качи видеото в YouTube (може „Нелистван“) и сложи линка оттам.';
  if (s.includes('youtube.com/playlist') || s.includes('list='))
    return 'Това е плейлист, не единично видео. Отвори самия клип и копирай неговия линк.';
  if (s.includes('youtube') || s.includes('youtu.be'))
    return 'Линкът не съдържа номер на клип. Отвори видеото и копирай адреса от лентата на браузъра.';
  return 'Непознат адрес — приемат се само YouTube и Vimeo.';
}
