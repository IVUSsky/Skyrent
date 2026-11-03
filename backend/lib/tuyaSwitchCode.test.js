// Коя команда тръгва към устройството.
//
// Повод (03.11.2026): клапанът за вода на ап. 4А (NSB01) разбира `switch_1`,
// а кодът пращаше `switch` на всичко. Бутонът в приложението на наемателя
// щеше да мълчи — Tuya приема заявката и просто не прави нищо.
const { pickSwitchCode, SWITCH_CODES } = require('./tuyaClient');

const status = (...codes) => ({ success: true, result: codes.map(c => ({ code: c, value: false })) });

describe('кой DP код управлява включването', () => {
  it('бушонът tongou → switch', () => {
    expect(pickSwitchCode(status('switch', 'cur_power', 'add_ele'))).toBe('switch');
  });

  it('клапанът NSB01 → switch_1, а НЕ switch', () => {
    expect(pickSwitchCode(status('switch_1', 'countdown_1', 'cur_power'))).toBe('switch_1');
  });

  it('брава с пръстов отпечатък няма ключ за включване', () => {
    expect(pickSwitchCode(status('unlock_fingerprint', 'unlock_card', 'unlock_app', 'doorbell'))).toBeNull();
  });

  it('когато има и двете, печели `switch`', () => {
    expect(pickSwitchCode(status('switch_1', 'switch'))).toBe('switch');
  });

  it('мълчащ или сгрешен отговор → нищо, вместо произволна команда', () => {
    expect(pickSwitchCode({ success: false, msg: 'offline' })).toBeNull();
    expect(pickSwitchCode(null)).toBeNull();
    expect(pickSwitchCode({ success: true })).toBeNull();
    expect(pickSwitchCode({ success: true, result: [null, {}] })).toBeNull();
  });

  it('приема и чист списък от DP-та', () => {
    expect(pickSwitchCode([{ code: 'switch_led' }])).toBe('switch_led');
  });

  it('редът на търсене е същият като в четенето на състоянието', () => {
    expect(SWITCH_CODES.slice(0, 2)).toEqual(['switch', 'switch_1']);
  });
});

describe('моторите за щори', () => {
  const { pickCurtainCode } = require('./tuyaClient');
  const status = (...codes) => ({ success: true, result: codes.map(c => ({ code: c, value: 0 })) });

  it('предпочита `control` (отвори/спри/затвори)', () => {
    expect(pickCurtainCode(status('control', 'percent_control', 'work_state'))).toBe('control');
  });

  it('без `control` минава на процент', () => {
    expect(pickCurtainCode(status('percent_control', 'position'))).toBe('percent_control');
  });

  it('бушон не е завеса', () => {
    expect(pickCurtainCode(status('switch', 'cur_power'))).toBeNull();
  });

  it('мълчащ отговор → нищо', () => {
    expect(pickCurtainCode({ success: false })).toBeNull();
    expect(pickCurtainCode(null)).toBeNull();
  });
});
