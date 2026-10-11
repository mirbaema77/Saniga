const PDFDocument = require('pdfkit');
const {
  formatSwissAmount,
  formatHoursQty,
  buildInvoiceView,
} = require('./invoiceMath');
const {
  MARGIN_TOP,
  MARGIN_RIGHT,
  LOGO_BOX_W,
  LOGO_BOX_H,
  RECIPIENT_LEFT,
  loadLogoPng,
  logoImageOptions,
} = require('./invoiceLogo');
const { CONTENT_RIGHT, CONTENT_WIDTH, PDF_COLS, MM, MARGIN_X } = require('./invoiceLayout');

function paintWhitePage(doc) {
  const { width, height } = doc.page;
  doc.save();
  doc.rect(0, 0, width, height).fill('#FFFFFF');
  doc.restore();
}

function drawColText(doc, col, text, y, { bold = false, size = 10 } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#152830');
  doc.text(String(text ?? ''), col.x, y, {
    width: col.width,
    align: col.align,
    lineBreak: false,
  });
}

/**
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(invoice, company = null) {
  const view = buildInvoiceView(invoice, company);
  const logo = loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: true,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    paintWhitePage(doc);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    const ensureSpace = (needY) => {
      if (needY <= pageHeight - 20 * MM) return;
      doc.addPage();
      paintWhitePage(doc);
      return true;
    };

    const logoX = pageWidth - MARGIN_RIGHT - LOGO_BOX_W;
    const logoY = MARGIN_TOP;
    doc.image(logo, logoX, logoY, logoImageOptions());

    const recipientLeft = RECIPIENT_LEFT;
    const recipientWidth = CONTENT_RIGHT - recipientLeft;
    let y = logoY + LOGO_BOX_H + 10 * MM;

    doc.font('Helvetica').fontSize(10).fillColor('#152830');
    for (const line of view.recipientLines) {
      doc.text(line || ' ', recipientLeft, y, {
        width: recipientWidth,
        align: 'right',
      });
      y = doc.y;
    }

    y += 8 * MM;
    doc.fillColor('#152830').fontSize(10);
    doc.text(`${view.issuePlaceLabel}, ${view.issueDateLabel}`, recipientLeft, y, {
      width: recipientWidth,
      align: 'right',
    });
    y = doc.y + 10 * MM;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#152830');
    doc.text(`Rechnung ${view.number}`, MARGIN_X, y, { width: CONTENT_WIDTH, align: 'left' });
    y = doc.y + 6 * MM;

    const labelColW = 45 * MM;
    const valueColX = MARGIN_X + labelColW;
    const valueColW = CONTENT_WIDTH - labelColW;
    doc.fontSize(10);
    for (const row of view.metaRows) {
      const rowY = y;
      doc.font('Helvetica').fillColor('#152830').text(row.label, MARGIN_X, rowY, {
        width: labelColW - 4,
        align: 'left',
      });
      doc.font('Helvetica').fillColor('#152830').text(row.value || '', valueColX, rowY, {
        width: valueColW,
        align: 'left',
      });
      y = Math.max(doc.y, rowY + 14) + 2;
    }

    y += 8 * MM;

    doc
      .moveTo(MARGIN_X, y)
      .lineTo(CONTENT_RIGHT, y)
      .strokeColor('#152830')
      .lineWidth(0.8)
      .stroke();
    y += 6;

    drawColText(doc, PDF_COLS.arbeit, 'Arbeit', y, { bold: true, size: 9 });
    drawColText(doc, PDF_COLS.menge, 'Menge', y, { bold: true, size: 9 });
    drawColText(doc, PDF_COLS.preis, 'Preis', y, { bold: true, size: 9 });
    drawColText(doc, PDF_COLS.total, 'Total', y, { bold: true, size: 9 });
    y += 14;

    for (const group of view.lineItems) {
      if (ensureSpace(y + 40)) y = MARGIN_TOP;
      drawColText(doc, PDF_COLS.arbeit, `${group.workTypeLabel}:`, y, { bold: true, size: 10 });
      y = doc.y + 4;
      for (const emp of group.employees) {
        if (ensureSpace(y + 20)) y = MARGIN_TOP;
        const rowY = y;
        doc.font('Helvetica').fontSize(10).fillColor('#152830');
        doc.text(emp.employeeName, PDF_COLS.arbeit.x + 8, rowY, {
          width: PDF_COLS.arbeit.width - 8,
          align: 'left',
          lineBreak: false,
        });
        drawColText(doc, PDF_COLS.menge, `${formatHoursQty(emp.hours)} h`, rowY, { size: 10 });
        drawColText(doc, PDF_COLS.preis, formatSwissAmount(emp.chfPerHour), rowY, { size: 10 });
        drawColText(doc, PDF_COLS.total, formatSwissAmount(emp.amount), rowY, { size: 10 });
        y = rowY + 13;
      }
      y += 4;
    }

    y += 4;
    doc
      .moveTo(MARGIN_X, y)
      .lineTo(CONTENT_RIGHT, y)
      .strokeColor('#152830')
      .lineWidth(0.8)
      .stroke();
    y += 8;

    const drawTotalRow = (label, amount, { bold = false } = {}) => {
      if (ensureSpace(y + 20)) y = MARGIN_TOP;
      const rowY = y;
      drawColText(doc, PDF_COLS.arbeit, label, rowY, { bold, size: bold ? 11 : 10 });
      drawColText(doc, PDF_COLS.total, `CHF ${formatSwissAmount(amount)}`, rowY, {
        bold,
        size: bold ? 11 : 10,
      });
      y = rowY + (bold ? 16 : 14);
    };

    drawTotalRow('Zwischentotal', view.subtotal);
    drawTotalRow(`MWST ${view.vatRateLabel}%`, view.vat);
    drawTotalRow('Gesamttotal CHF', view.total, { bold: true });

    y += 12 * MM;
    doc.font('Helvetica').fontSize(9).fillColor('#152830');
    for (const line of view.footerLines) {
      if (ensureSpace(y + 16)) y = MARGIN_TOP;
      doc.text(line, MARGIN_X, y, { width: CONTENT_WIDTH, align: 'left' });
      y = doc.y + 3;
    }

    doc.end();
  });
}

module.exports = { renderInvoicePdf };
