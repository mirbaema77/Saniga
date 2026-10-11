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
/** Placement box: 55mm wide; height from PNG aspect (no clipping). */
const LOGO_BOX_W = 55 * MM;
const LOGO_ASPECT = 119 / 624; // server/assets/logo-saniga.png
const LOGO_BOX_H = LOGO_BOX_W * LOGO_ASPECT;
const RECIPIENT_LEFT = PAGE_W * 0.55;

function loadLogoPng() {
  return fs.readFileSync(LOGO_PNG_PATH);
}

/** pdfkit options: fit inside box, preserve aspect ratio (never clip). */
function logoImageOptions() {
  return {
    fit: [LOGO_BOX_W, LOGO_BOX_H],
    align: 'right',
    valign: 'top',
  };
}

module.exports = {
  LOGO_PNG_PATH,
  MM,
  PAGE_W,
  PAGE_H,
  MARGIN_X,
  MARGIN_TOP,
  MARGIN_RIGHT,
  LOGO_W: LOGO_BOX_W,
  LOGO_H: LOGO_BOX_H,
  LOGO_BOX_W,
  LOGO_BOX_H,
  RECIPIENT_LEFT,
  loadLogoPng,
  logoImageOptions,
};
