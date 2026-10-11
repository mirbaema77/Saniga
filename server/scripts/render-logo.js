const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function renderWithCanvas() {
  const { createCanvas } = require('canvas');
  const W = 900;
  const H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12B8E1';
  ctx.strokeStyle = '#12B8E1';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.font = '900 120px "Arial Black"';
  const text = 'SANIGA';
  const x = 40;
  const baseline = 155;
  const upToN = ctx.measureText('SA').width;
  const nW = ctx.measureText('N').width;
  const nCenter = x + upToN + nW / 2;
  ctx.beginPath();
  ctx.arc(nCenter, 70, nW * 0.42, Math.PI, 0, false);
  ctx.stroke();
  ctx.fillText(text, x, baseline);
  return canvas.toBuffer('image/png');
}

async function renderWithSvg() {
  const svgPath = path.join(__dirname, '..', 'public', 'assets', 'logo-saniga.svg');
  const svg = fs.readFileSync(svgPath);
  return sharp(svg, { density: 512 }).ensureAlpha().png().toBuffer();
}

async function main() {
  let out;
  try {
    out = await renderWithCanvas();
    console.log('renderer=canvas');
  } catch (e) {
    console.log('renderer=svg-fallback', e.message);
    out = await renderWithSvg();
  }

  const trimmed = await sharp(out)
    .ensureAlpha()
    .trim({ threshold: 5 })
    .resize({ width: 800, kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const publicPng = path.join(__dirname, '..', 'public', 'assets', 'logo-saniga.png');
  const serverAssetsPng = path.join(__dirname, '..', 'assets', 'logo-saniga.png');
  const rootAssetsPng = path.join(__dirname, '..', '..', 'assets', 'logo-saniga.png');
  fs.writeFileSync(publicPng, trimmed);
  fs.writeFileSync(serverAssetsPng, trimmed);
  fs.mkdirSync(path.dirname(rootAssetsPng), { recursive: true });
  fs.writeFileSync(rootAssetsPng, trimmed);

  const meta = await sharp(trimmed).metadata();
  console.log(`wrote ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
