/**
 * Render Saniga PWA app icons (S + arch) from icon-saniga.svg.
 * Usage: node scripts/render-app-icon.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const svgPath = path.join(__dirname, '..', 'public', 'assets', 'icon-saniga.svg');
  const outDir = path.join(__dirname, '..', 'public', 'assets');
  const svg = fs.readFileSync(svgPath);

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    // Apple touch / generic fallback name used in HTML
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    const buf = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, buf);
    const meta = await sharp(buf).metadata();
    console.log(`wrote ${name} ${meta.width}x${meta.height}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
