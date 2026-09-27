// tools/toWebp.cjs — wandelt die PNG-Screenshots eines Ordners in WebP (Qualität 0,62) um und löscht die PNGs.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const out = await p.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.62);
    }, 'data:image/png;base64,' + b64);
    fs.writeFileSync(path.join(dir, f.replace(/\.png$/, '.webp')), Buffer.from(out.split(',')[1], 'base64'));
    fs.unlinkSync(path.join(dir, f));
  }
  await b.close();
})();
