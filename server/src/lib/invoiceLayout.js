const { MM, MARGIN_X, MARGIN_RIGHT, PAGE_W } = require('./invoiceLogo');

/** Usable content width between left/right page margins (PDF points). */
const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;
const CONTENT_WIDTH = CONTENT_RIGHT - MARGIN_X;

/**
 * Shared invoice table columns (PDF points).
 * Same x/width used for header, line items and totals.
 */
const PDF_COLS = {
  arbeit: { x: MARGIN_X, width: CONTENT_WIDTH * 0.5, align: 'left' },
  menge: { x: MARGIN_X + CONTENT_WIDTH * 0.5, width: CONTENT_WIDTH * 0.15, align: 'right' },
  preis: { x: MARGIN_X + CONTENT_WIDTH * 0.65, width: CONTENT_WIDTH * 0.15, align: 'right' },
  total: { x: MARGIN_X + CONTENT_WIDTH * 0.8, width: CONTENT_WIDTH * 0.2, align: 'right' },
};

/** DOCX column widths in DXA — same ratios as PDF_COLS. */
const PAGE_CONTENT_DXA = 9638;
const DOCX_COLS = {
  arbeit: Math.round(PAGE_CONTENT_DXA * 0.5),
  menge: Math.round(PAGE_CONTENT_DXA * 0.15),
  preis: Math.round(PAGE_CONTENT_DXA * 0.15),
  total: 0,
};
DOCX_COLS.total = PAGE_CONTENT_DXA - DOCX_COLS.arbeit - DOCX_COLS.menge - DOCX_COLS.preis;

const DOCX_COL_WIDTHS = [DOCX_COLS.arbeit, DOCX_COLS.menge, DOCX_COLS.preis, DOCX_COLS.total];

module.exports = {
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  PDF_COLS,
  PAGE_CONTENT_DXA,
  DOCX_COLS,
  DOCX_COL_WIDTHS,
  MM,
  MARGIN_X,
};
