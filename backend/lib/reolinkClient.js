// Клиент за Reolink видео домофон (D340W и подобни), достиган през router-forwarded
// портове — камерата е на локалната мрежа на имота, Skyrent (Railway) не е.
//
// ⚠️ ЗАЩО НЕ CGI: D340W НЯМА вграден уеб сървър. Портове 80/443 остават затворени
// дори след като RTSP/ONVIF се пуснат от настройките, така че `/cgi-bin/api.cgi`
// (cmd=GetMdState / cmd=Snap) е недостижим. Проверено на живо 16.10.2026 на реалната
// камера в ап.4А. Коварно: ONVIF сам обявява snapshot URI към порт 80 — примамка е.
//
// Затова:
//   движение → ONVIF PullPoint (порт 8000), сигнал `IsMotion`
//   снимка   → кадър от RTSP потока (порт 554) през ffmpeg
//
// ONVIF връзката е дълготрайна (библиотеката поддържа абонамента сама и бута
// събития), затова държим по една Cam инстанция на камера в кеш и само четем
// последното състояние. Cron-ът остава прост: пита `getMdState`, както досега.

const { spawn } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const DEFAULT_ONVIF_PORT = 8000;
const DEFAULT_RTSP_PORT = 554;
// Под-потокът стига за снимка на събитие и е в пъти по-лек от главния.
const RTSP_PATH = process.env.REOLINK_RTSP_PATH || 'Preview_01_sub';

// camera.id -> { cam, motion, lastEventAt, connectedAt, host, port }
const connections = new Map();

function onvifTarget(camera, router) {
  return {
    host: router.host,
    port: camera.onvif_port || camera.forwarded_port || DEFAULT_ONVIF_PORT,
  };
}

function rtspUrl(camera, router) {
  const port = camera.rtsp_port || DEFAULT_RTSP_PORT;
  const user = encodeURIComponent(camera.camera_user || 'admin');
  const pass = encodeURIComponent(camera.camera_pass || '');
  return `rtsp://${user}:${pass}@${router.host}:${port}/${RTSP_PATH}`;
}

// Вади `IsMotion` от ONVIF съобщение. Структурата варира по фърмуер, затова
// обхождаме и масив, и единичен елемент.
function readMotion(msg) {
  const data = msg?.message?.message?.data?.simpleItem;
  if (!data) return null;
  const items = Array.isArray(data) ? data : [data];
  for (const item of items) {
    const name = item?.$?.Name;
    if (name === 'IsMotion' || name === 'Motion') {
      const value = item?.$?.Value;
      return value === true || value === 'true' || value === '1';
    }
  }
  return null;
}

function connect(camera, router) {
  const { host, port } = onvifTarget(camera, router);
  const existing = connections.get(camera.id);
  // Ако адресът се е сменил (смяна на рутер/порт), вдигаме връзката наново.
  if (existing && existing.host === host && existing.port === port) return Promise.resolve(existing);
  if (existing) {
    try { existing.cam.removeAllListeners(); } catch (_) {}
    connections.delete(camera.id);
  }

  const { Cam } = require('onvif');
  return new Promise((resolve, reject) => {
    const cam = new Cam({
      hostname: host,
      port,
      username: camera.camera_user || 'admin',
      password: camera.camera_pass || '',
      timeout: 10000,
      preserveAddress: true, // камерата зад NAT обявява локалния си адрес — пазим външния
    }, (err) => {
      if (err) return reject(new Error(`ONVIF ${host}:${port} — ${err.message}`));

      const entry = { cam, motion: false, lastEventAt: null, host, port, connectedAt: Date.now() };
      cam.on('event', (msg) => {
        const motion = readMotion(msg);
        if (motion === null) return;
        entry.motion = motion;
        entry.lastEventAt = Date.now();
      });
      // Без този слушател библиотеката хвърля необработено събитие и сваля процеса.
      cam.on('eventsError', (e) => {
        entry.lastError = e?.message || String(e);
      });
      connections.set(camera.id, entry);
      resolve(entry);
    });
  });
}

// Връща текущото състояние на движението. Съвместим изход със стария CGI клиент,
// за да не се пипа cameraCron.
async function getMdState(camera, router) {
  const entry = await connect(camera, router);
  // Камерата бута събития на няколко секунди; ако дълго няма нито едно, връзката
  // е увиснала и е по-честно да се обяви грешка, отколкото да се връща „няма движение".
  if (entry.lastEventAt && Date.now() - entry.lastEventAt > 180_000) {
    throw new Error('ONVIF: няма събития от 3 минути (връзката вероятно е увиснала)');
  }
  return { motion: entry.motion, raw: `ONVIF IsMotion=${entry.motion}`, lastEventAt: entry.lastEventAt };
}

// Един кадър от RTSP потока. ffmpeg пише на stdout, за да не пипаме диска тук —
// cameraCron решава къде да го запише.
function snap(camera, router) {
  const url = rtspUrl(camera, router);
  return new Promise((resolve, reject) => {
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', url,
      '-frames:v', '1',
      '-q:v', '3',
      '-f', 'image2',
      '-update', '1', // без него ffmpeg 7+ предупреждава за последователност от файлове
      '-loglevel', 'error',
      'pipe:1',
    ];
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    const chunks = [];
    const errChunks = [];
    let done = false;

    const finish = (err, buf) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err); else resolve(buf);
    };

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
      finish(new Error('ffmpeg: изтече времето (20 сек) при вземане на кадър'));
    }, 20_000);

    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => errChunks.push(c));
    proc.on('error', (e) => finish(new Error(
      e.code === 'ENOENT' ? 'ffmpeg липсва на сървъра (виж Dockerfile)' : `ffmpeg: ${e.message}`
    )));
    proc.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code !== 0 || !buf.length) {
        const stderr = Buffer.concat(errChunks).toString().trim().split('\n').slice(-2).join(' ');
        return finish(new Error(`ffmpeg излезе с ${code}${stderr ? ': ' + stderr : ''}`));
      }
      finish(null, buf);
    });
  });
}

async function testConnection(camera, router) {
  let info = null;
  try {
    const entry = await connect(camera, router);
    info = await new Promise((resolve, reject) => {
      entry.cam.getDeviceInformation((err, data) => (err ? reject(err) : resolve(data)));
    });
  } catch (err) {
    return { ok: false, message: `✗ ONVIF: ${err.message}` };
  }

  // ONVIF може да минава, а потокът да не — проверяваме и него, иначе събитията
  // ще се логват без снимки и причината ще е неясна.
  let snapNote = '';
  try {
    const buf = await snap(camera, router);
    snapNote = `, снимка ${Math.round(buf.length / 1024)} KB`;
  } catch (err) {
    snapNote = `, но снимката не минава: ${err.message}`;
  }

  const model = [info?.manufacturer, info?.model].filter(Boolean).join(' ') || 'камера';
  return { ok: true, message: `✓ ${model}${snapNote}` };
}

// Затваря ONVIF абонамента — ползва се при изтриване/редакция на камера.
function disconnect(cameraId) {
  const entry = connections.get(cameraId);
  if (!entry) return;
  try { entry.cam.removeAllListeners(); } catch (_) {}
  connections.delete(cameraId);
}

module.exports = { getMdState, snap, testConnection, disconnect, rtspUrl };
