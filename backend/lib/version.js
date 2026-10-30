// Кой код върти на този сървър.
//
// Поводът: два пъти за десет дни опря до това, че мърджът в `main` НЕ е
// доказателство, че продът го върти. На 21.10.2026 PR #268 и #269 бяха
// мърджнати, а продът въртя стария код часове — Railway беше паузирал деплоите
// („Limited Access"), а при октомврийския инцидент бяха анулирани и GitHub App
// инсталациите, тоест webhook-ът не сработваше. Признак нямаше: `/api/health`
// отговаря еднакво при стар и нов код, а единственото ново поле беше в отговора
// на POST маршрут, който пипа данни — тоест непроверим без щета.
//
// Комитът идва от средата, която Railway попълва при билда. Нищо не се чете от
// диска и няма стъпка в билда, която да се поддържа — затова работи и локално
// (където променливите ги няма и `commit` е null).
//
// Нарочно НЕ се издават id на деплоя и име на службата: отговорът е публичен
// като `/api/health`, а те не помагат на въпроса „кой код върти" и са излишна
// повърхност.

const STARTED_AT = new Date();

// Railway е сменял имената на променливите, затова се пробват няколко.
const COMMIT_VARS = ['RAILWAY_GIT_COMMIT_SHA', 'RAILWAY_GIT_SHA', 'SOURCE_COMMIT', 'GIT_COMMIT'];
const BRANCH_VARS = ['RAILWAY_GIT_BRANCH', 'GIT_BRANCH'];

function pick(names, env) {
  for (const n of names) {
    const v = env[n];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

// now/startedAt се подават само от тестовете.
function versionInfo(env = process.env, now = new Date(), startedAt = STARTED_AT) {
  const commit = pick(COMMIT_VARS, env);
  return {
    ok: true,
    // Късият SHA стига, за да се сравни с `git log origin/main`.
    commit: commit ? commit.slice(0, 7) : null,
    branch: pick(BRANCH_VARS, env),
    started_at: startedAt.toISOString(),
    uptime_s: Math.max(0, Math.round((now - startedAt) / 1000)),
  };
}

module.exports = { versionInfo, STARTED_AT };
