const fs = require('fs');
const path = require('path');

const LOGO_PNG_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-saniga.png');

/** A4 geometry helpers (pdfkit points). */
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 20 * MM;
const MARGIN_TOP = 15 * MM;
const MARGIN_RIGHT = 15 * MM;
const LOGO_W = 55 * MM;
const LOGO_H = LOGO_W * (40 / 210);
const RECIPIENT_LEFT = PAGE_W * 0.55;

function loadLogoPng() {
  return fs.readFileSync(LOGO_PNG_PATH);
}

module.exports = {
  LOGO_PNG_PATH,
  MM,
  PAGE_W,
  PAGE_H,
  MARGIN_X,
  MARGIN_TOP,
  MARGIN_RIGHT,
  LOGO_W,
  LOGO_H,
  RECIPIENT_LEFT,
  loadLogoPng,
};
