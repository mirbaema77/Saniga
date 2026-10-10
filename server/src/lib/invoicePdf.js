const PDFDocument = require('pdfkit');
const {
  HOURLY_RATE_CHF,
  formatSwissAmount,
  formatHoursQty,
  buildInvoiceView,
} = require('./invoiceMath');
const {
  MM,
  MARGIN_X,
  MARGIN_TOP,
  MARGIN_RIGHT,
  LOGO_W,
  LOGO_H,
  RECIPIENT_LEFT,
  loadLogoPng,
} = require('./invoiceLogo');

/**
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(invoice) {
  const view = buildInvoiceView(invoice);
  const logo = loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentRight = pageWidth - MARGIN_RIGHT;
    const contentWidth = contentRight - MARGIN_X;

    // Logo top-right: 55mm wide, 15mm from top and right edges
    const logoX = pageWidth - MARGIN_RIGHT - LOGO_W;
    const logoY = MARGIN_TOP;
    doc.image(logo, logoX, logoY, { width: LOGO_W, height: LOGO_H });

    // Recipient below logo, right-aligned, left edge ~55% page width
    const recipientLeft = RECIPIENT_LEFT;
    const recipientWidth = contentRight - recipientLeft;
    let y = logoY + LOGO_H + 10 * MM;

    doc.font('Helvetica').fontSize(10).fillColor('#152830');
    doc.text(view.customerName || '', recipientLeft, y, {
      width: recipientWidth,
      align: 'right',
    });
    y = doc.y;
    if (view.customerAddress) {
      doc.fillColor('#2a4a55').text(String(view.customerAddress), recipientLeft, y, {
        width: recipientWidth,
        align: 'right',
      });
      y = doc.y;
    }

    // "Hinwil, date" below recipient, same left edge
    y += 8 * MM;
    doc.fillColor('#152830').fontSize(10);
    doc.text(`Hinwil, ${view.issueDateLabel}`, recipientLeft, y, {
      width: recipientWidth,
      align: 'right',
    });
    y = doc.y + 10 * MM;

    // Title left-aligned on page margin
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#152830');
    doc.text(`Rechnung ${view.number}`, MARGIN_X, y, { width: contentWidth, align: 'left' });
    y = doc.y + 6 * MM;

    // Meta: two-column label / value
    const labelColW = 45 * MM;
    const valueColX = MARGIN_X + labelColW;
    const valueColW = contentWidth - labelColW;
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

    // Line-item table columns
    const colArbeit = MARGIN_X;
    const colMenge = MARGIN_X + contentWidth * 0.52;
    const colPreis = MARGIN_X + contentWidth * 0.68;
    const colTotal = MARGIN_X + contentWidth * 0.82;
    const mengeW = colPreis - colMenge - 4;
    const preisW = colTotal - colPreis - 4;
    const totalW = contentRight - colTotal;

    // Top rule
    doc
      .moveTo(MARGIN_X, y)
      .lineTo(contentRight, y)
      .strokeColor('#152830')
      .lineWidth(0.8)
      .stroke();
    y += 6;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#152830');
    doc.text('Arbeit', colArbeit, y, { width: colMenge - colArbeit - 6 });
    doc.text('Menge', colMenge, y, { width: mengeW, align: 'right' });
    doc.text('Preis', colPreis, y, { width: preisW, align: 'right' });
    doc.text('Total', colTotal, y, { width: totalW, align: 'right' });
    y += 14;

    doc.font('Helvetica').fontSize(10);
    for (const group of view.lineItems) {
      if (y > pageHeight - 70 * MM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.font('Helvetica-Bold').fillColor('#152830').text(`${group.workTypeLabel}:`, colArbeit, y, {
        width: colMenge - colArbeit - 6,
      });
      y = doc.y + 4;
      doc.font('Helvetica').fillColor('#152830');
      for (const emp of group.employees) {
        if (y > pageHeight - 70 * MM) {
          doc.addPage();
          y = MARGIN_TOP;
        }
        const rowY = y;
        doc.text(emp.employeeName, colArbeit + 8, rowY, { width: colMenge - colArbeit - 14 });
        doc.text(`${formatHoursQty(emp.hours)} h`, colMenge, rowY, { width: mengeW, align: 'right' });
        doc.text(formatSwissAmount(HOURLY_RATE_CHF), colPreis, rowY, { width: preisW, align: 'right' });
        doc.text(formatSwissAmount(emp.amount), colTotal, rowY, { width: totalW, align: 'right' });
        y = Math.max(doc.y, rowY + 13) + 1;
      }
      y += 4;
    }

    y += 4;
    // Bottom rule
    doc
      .moveTo(MARGIN_X, y)
      .lineTo(contentRight, y)
      .strokeColor('#152830')
      .lineWidth(0.8)
      .stroke();
    y += 8;

    const drawTotalRow = (label, amount, { bold = false } = {}) => {
      if (y > pageHeight - 50 * MM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      const rowY = y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#152830');
      doc.text(label, colArbeit, rowY, { width: colTotal - colArbeit - 8 });
      doc.text(`CHF ${formatSwissAmount(amount)}`, colTotal, rowY, { width: totalW, align: 'right' });
      y = rowY + (bold ? 16 : 14);
    };

    drawTotalRow('Zwischentotal', view.subtotal);
    drawTotalRow(`MWST ${view.vatRateLabel}%`, view.vat);
    drawTotalRow('Gesamttotal CHF', view.total, { bold: true });

    y += 12 * MM;
    doc.font('Helvetica').fontSize(9).fillColor('#152830');
    for (const line of view.footerLines) {
      if (y > pageHeight - 20 * MM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.text(line, MARGIN_X, y, { width: contentWidth, align: 'left' });
      y = doc.y + 3;
    }

    doc.end();
  });
}

module.exports = { renderInvoicePdf };
