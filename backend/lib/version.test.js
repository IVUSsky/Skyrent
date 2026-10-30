// Маршрутът съществува, за да се познае стар код на прода. Значи най-важното,
// което трябва да държи, е да НЕ излъже: липсващ комит се казва (null), а не се
// замазва с нещо правдоподобно.
const { versionInfo } = require('./version');

const T0 = new Date('2026-10-30T10:00:00.000Z');

describe('кой код върти', () => {
  it('взема комита от средата на Railway', () => {
    const v = versionInfo({ RAILWAY_GIT_COMMIT_SHA: 'aaabe49cafe1234567890' }, T0, T0);
    expect(v.commit).toBe('aaabe49');
  });

  it('локално, без променливи, казва null вместо да си измисли', () => {
    expect(versionInfo({}, T0, T0).commit).toBeNull();
    expect(versionInfo({}, T0, T0).branch).toBeNull();
  });

  it('празна променлива се брои за липсваща', () => {
    expect(versionInfo({ RAILWAY_GIT_COMMIT_SHA: '   ' }, T0, T0).commit).toBeNull();
  });

  it('пробва и старите имена, ако Railway смени променливата', () => {
    expect(versionInfo({ SOURCE_COMMIT: 'deadbeef00' }, T0, T0).commit).toBe('deadbee');
    expect(versionInfo({ GIT_BRANCH: 'main' }, T0, T0).branch).toBe('main');
  });

  it('първото налично име печели', () => {
    const v = versionInfo({ RAILWAY_GIT_COMMIT_SHA: 'aaaaaaa1', GIT_COMMIT: 'bbbbbbb2' }, T0, T0);
    expect(v.commit).toBe('aaaaaaa');
  });

  it('дава кога е вдигнат и от колко време — рестартът се вижда', () => {
    const now = new Date(T0.getTime() + 125_000);
    const v = versionInfo({}, now, T0);
    expect(v.started_at).toBe('2026-10-30T10:00:00.000Z');
    expect(v.uptime_s).toBe(125);
  });

  it('не издава id на деплоя и име на службата — отговорът е публичен', () => {
    const v = versionInfo({
      RAILWAY_DEPLOYMENT_ID: 'dep_secret', RAILWAY_SERVICE_NAME: 'skyrent-backend',
    }, T0, T0);
    expect(Object.keys(v).sort()).toEqual(['branch', 'commit', 'ok', 'started_at', 'uptime_s']);
  });
});
