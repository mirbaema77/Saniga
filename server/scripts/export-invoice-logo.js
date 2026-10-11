const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const svgPath = path.join(__dirname, '..', 'public', 'assets', 'logo-saniga.svg');
  const outPath = path.join(__dirname, '..', 'assets', 'logo-saniga.png');
  const svg = fs.readFileSync(svgPath);

  // Render on transparent canvas (explicit alpha), then trim empty padding.
  const rendered = await sharp(svg, {
    density: 384,
    // Avoid opaque default backdrops from some SVG renderers.
  })
    .ensureAlpha()
    .png()
    .toBuffer();

  // Force near-black (and pure black) pixels to transparent so invoices stay white.
  const { data, info } = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 25 && g < 25 && b < 25) {
      data[i + 3] = 0;
    }
  }

  const cleared = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const trimmed = await sharp(cleared).trim({ threshold: 0 }).png().toBuffer();
  const out = await sharp(trimmed).resize({ width: 624, kernel: 'lanczos3' }).png().toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);

  const meta = await sharp(out).metadata();
  console.log(`Wrote ${outPath} (${meta.width}×${meta.height}, alpha=${meta.hasAlpha})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
