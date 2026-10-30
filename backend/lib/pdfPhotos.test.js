// Смаляване на снимките преди вграждане в PDF. Същественото: протоколът да
// олекне, но и да НЕ се счупи, когато някоя снимка не може да се прекодира.
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { preparePdfImages, pickImage, protocolImagePaths, PHOTO_WIDTH } = require('./pdfPhotos');

let dir;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfphotos-'));
  // „Снимка от телефон" — голяма, за да личи ефектът.
  await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 120, g: 140, b: 90 } } })
    .jpeg({ quality: 95 }).toFile(path.join(dir, 'big.jpg'));
  fs.writeFileSync(path.join(dir, 'broken.jpg'), 'това не е картинка');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('подготовка на снимките за PDF', () => {
  it('смалява до зададената ширина', async () => {
    const p = path.join(dir, 'big.jpg');
    const map = await preparePdfImages([p], PHOTO_WIDTH);
    expect(map.has(p)).toBe(true);
    const meta = await sharp(map.get(p)).metadata();
    expect(meta.width).toBe(PHOTO_WIDTH);
  });

  it('буферът е драстично по-малък от оригинала', async () => {
    const p = path.join(dir, 'big.jpg');
    const map = await preparePdfImages([p], PHOTO_WIDTH);
    expect(map.get(p).length).toBeLessThan(fs.statSync(p).size / 2);
  });

  it('не увеличава снимка, по-малка от целевата ширина', async () => {
    const small = path.join(dir, 'small.jpg');
    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#333' } }).jpeg().toFile(small);
    const map = await preparePdfImages([small], PHOTO_WIDTH);
    expect((await sharp(map.get(small)).metadata()).width).toBe(300);
  });

  it('счупен файл просто не влиза в картата — протоколът пак се генерира', async () => {
    const bad = path.join(dir, 'broken.jpg');
    const map = await preparePdfImages([bad], PHOTO_WIDTH);
    expect(map.has(bad)).toBe(false);
    expect(pickImage(map, bad)).toBe(bad);   // пада на оригинала
  });

  it('липсващ файл не хвърля', async () => {
    const map = await preparePdfImages([path.join(dir, 'нама.jpg')], PHOTO_WIDTH);
    expect(map.size).toBe(0);
  });

  it('повтореният път се обработва веднъж', async () => {
    const p = path.join(dir, 'big.jpg');
    const map = await preparePdfImages([p, p, p], PHOTO_WIDTH);
    expect(map.size).toBe(1);
  });

  it('pickImage връща буфера, когато го има', async () => {
    const p = path.join(dir, 'big.jpg');
    const map = await preparePdfImages([p], PHOTO_WIDTH);
    expect(Buffer.isBuffer(pickImage(map, p))).toBe(true);
  });
});

describe('кои пътища влизат в протокола', () => {
  it('снимките на имота и по една миниатюра на артикул', () => {
    const r = protocolImagePaths({
      photos: [{ filename: 'a.jpg' }, { filename: 'b.jpg' }],
      inventory: [
        { photos: [{ type: 'photo', filename: 'i1.jpg' }, { type: 'manual', filename: 'm.pdf' }] },
        { photos: [] },
        { photos: [{ type: 'manual', filename: 'm2.pdf' }] },
      ],
      photosDir: '/p', inventoryDir: '/i',
    });
    expect(r.grid).toHaveLength(2);
    expect(r.thumbs).toHaveLength(1);
    expect(r.thumbs[0]).toContain('i1.jpg');
  });

  it('празен имот не дава пътища', () => {
    const r = protocolImagePaths({ photosDir: '/p', inventoryDir: '/i' });
    expect(r.grid).toEqual([]);
    expect(r.thumbs).toEqual([]);
  });
});
