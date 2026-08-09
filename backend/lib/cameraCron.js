// Cron-като worker за видео домофоните (Reolink) — на всеки 20 сек пита всяка камера
// дали е засякла движение; при ново засичане (false→true) сваля снимка и я логва.
//
// Идентификация по лице НЕ е част от този файл — detected_user_id/confidence в
// camera_events остават NULL засега; biometric разпознаване е отделна бъдеща стъпка,
// изисква изрично tenant съгласие (виж camera_events.detected_user_id коментара в
// db/migrations.js).

const fs = require('fs');
const path = require('path');
const { getMdState, snap } = require('./reolinkClient');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const CAMERA_SNAPSHOTS_DIR = path.join(DATA_DIR, 'camera_snapshots');
if (!fs.existsSync(CAMERA_SNAPSHOTS_DIR)) fs.mkdirSync(CAMERA_SNAPSHOTS_DIR, { recursive: true });

// camera.id -> последно известно състояние на движение (за false→true детекция)
const lastMotionState = new Map();

async function reconcileCameras(db, opts = {}) {
  const stats = { checked: 0, events: 0, errors: 0 };
  const cameras = db.prepare('SELECT * FROM cameras WHERE forwarded_port IS NOT NULL').all();

  for (const camera of cameras) {
    stats.checked++;
    const router = db.prepare('SELECT * FROM routers WHERE id=?').get(camera.router_id);
    if (!router) continue;

    try {
      const { motion } = await getMdState(camera, router);
      const wasMotion = lastMotionState.get(camera.id) || false;
      lastMotionState.set(camera.id, motion);

      db.prepare(`UPDATE cameras SET status='online', last_seen_at=datetime('now'), last_error=NULL WHERE id=?`).run(camera.id);

      if (motion && !wasMotion) {
        // Дебоунс: ако вече има събитие за тази камера от последните 15 сек, пропусни
        // (пази от дублирани логове при "трептящо" detection state).
        const recent = db.prepare(`
          SELECT id FROM camera_events WHERE camera_id=? AND created_at > datetime('now', '-15 seconds')
          ORDER BY id DESC LIMIT 1
        `).get(camera.id);
        if (!recent) {
          let snapshotPath = null;
          try {
            const buf = await snap(camera, router);
            const filename = `${camera.id}_${Date.now()}.jpg`;
            fs.writeFileSync(path.join(CAMERA_SNAPSHOTS_DIR, filename), buf);
            snapshotPath = `camera_snapshots/${filename}`;
          } catch (snapErr) {
            console.error(`[cameraCron] snap failed за camera ${camera.id}:`, snapErr.message);
          }
          db.prepare(`INSERT INTO camera_events (camera_id, snapshot_path, kind) VALUES (?, ?, 'motion')`)
            .run(camera.id, snapshotPath);
          stats.events++;
        }
      }
    } catch (err) {
      stats.errors++;
      db.prepare(`UPDATE cameras SET status='offline', last_error=? WHERE id=?`).run(err.message, camera.id);
    }
  }

  if (!opts.silent) console.log('[cameraCron] reconcile done:', stats);
  return stats;
}

function startCameraCron(db) {
  setTimeout(() => reconcileCameras(db).catch(e => console.error('[cameraCron] startup error:', e)), 20_000);
  setInterval(() => reconcileCameras(db).catch(e => console.error('[cameraCron] tick error:', e)), 20_000);
  console.log('[cameraCron] scheduled every 20 seconds');
}

module.exports = { reconcileCameras, startCameraCron };
