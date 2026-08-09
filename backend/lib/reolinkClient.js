// HTTP клиент за Reolink камера, достигана през router-forwarded порт (камерата е на
// локалната мрежа на имота, Skyrent (Railway) не е — router.host:camera.forwarded_port
// сочи към камерата все едно е директна връзка, виж lib/routerProvider.js#setupCameraForward).

function baseUrl(camera, router) {
  return `http://${router.host}:${camera.forwarded_port}/cgi-bin/api.cgi`;
}

async function getMdState(camera, router) {
  const url = `${baseUrl(camera, router)}?cmd=GetMdState&channel=0&user=${encodeURIComponent(camera.camera_user)}&password=${encodeURIComponent(camera.camera_pass)}&rs=${Date.now()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GetMdState HTTP ${res.status}`);
  const raw = await res.text();
  try {
    const data = JSON.parse(raw);
    const state = data?.[0]?.value?.state;
    return { motion: state === 1 || state === '1', raw };
  } catch (_) {
    return { motion: false, raw, parseError: true };
  }
}

async function snap(camera, router) {
  const url = `${baseUrl(camera, router)}?cmd=Snap&channel=0&user=${encodeURIComponent(camera.camera_user)}&password=${encodeURIComponent(camera.camera_pass)}&rs=${Date.now()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Snap failed за ${camera.name || camera.id}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`Snap за ${camera.name || camera.id} върна празен отговор`);
  return buf;
}

async function testConnection(camera, router) {
  try {
    const { motion, parseError } = await getMdState(camera, router);
    if (parseError) return { ok: false, message: '✗ Камерата отговори, но с неочакван формат' };
    return { ok: true, message: `✓ Свързан (движение: ${motion ? 'да' : 'не'})` };
  } catch (err) {
    return { ok: false, message: `✗ ${err.message}` };
  }
}

module.exports = { getMdState, snap, testConnection };
