const PDFDocument = require('pdfkit');
const {
  HOURLY_RATE_CHF,
  formatSwissAmount,
  formatHoursQty,
  buildLineItems,
  totalsFromLines,
} = require('./invoiceMath');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Civil DD.MM.YYYY in Europe/Zurich (issue date) or UTC calendar for stored period bounds. */
function formatDeDate(d, { utc = false } = {}) {
  const dt = d instanceof Date ? d : new Date(d);
  if (utc) {
    return `${pad2(dt.getUTCDate())}.${pad2(dt.getUTCMonth() + 1)}.${dt.getUTCFullYear()}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(dt);
  const day = parts.find((p) => p.type === 'day')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const year = parts.find((p) => p.type === 'year')?.value;
  return `${day}.${month}.${year}`;
}

function formatVatRate(rate) {
  const n = Number(rate);
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(invoice) {
  const lines = buildLineItems(invoice.entries);
  const vatRate = Number(invoice.vatRate);
  const { subtotal, vat, total } = totalsFromLines(lines, vatRate);
  const customer = invoice.customer;
  const site = invoice.site;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const right = pageWidth - 50;

    // Top right: customer
    doc.fontSize(10).fillColor('#152830');
    doc.text(customer.name || '', 320, 50, { width: right - 320, align: 'right' });
    if (customer.address) {
      doc.fillColor('#4a6570').text(customer.address, 320, doc.y, { width: right - 320, align: 'right' });
    }

    let y = 130;
    doc.fillColor('#152830').fontSize(11);
    doc.text(`Hinwil, ${formatDeDate(invoice.issueDate)}`, 50, y);
    y = doc.y + 18;

    doc.fontSize(16).font('Helvetica-Bold').text(`Rechnung ${invoice.number}`, 50, y);
    y = doc.y + 20;

    doc.font('Helvetica').fontSize(10).fillColor('#2a4a55');
    const meta = [
      'MWST.-Nr. CHE-298.414.455',
      `Objekt-Liegenschaft ${site.label}`,
      'Arbeitsgattung "BKP 250 Sanitäranlagen"',
      `Ausführungsdatum ${formatDeDate(invoice.periodFrom, { utc: true })} – ${formatDeDate(invoice.periodTo, { utc: true })}`,
    ];
    for (const line of meta) {
      doc.text(line, 50, y, { width: pageWidth - 100 });
      y = doc.y + 4;
    }

    y += 16;
    // Table header
    doc.font('Helvetica-Bold').fillColor('#152830').fontSize(10);
    const colArbeit = 50;
    const colMenge = 300;
    const colPreis = 380;
    const colTotal = 460;
    doc.text('Arbeit', colArbeit, y);
    doc.text('Menge', colMenge, y, { width: 70, align: 'right' });
    doc.text('Preis', colPreis, y, { width: 70, align: 'right' });
    doc.text('Total', colTotal, y, { width: 85, align: 'right' });
    y += 14;
    doc
      .moveTo(50, y)
      .lineTo(right, y)
      .strokeColor('#c5d0d6')
      .lineWidth(1)
      .stroke();
    y += 10;

    doc.font('Helvetica').fontSize(10);
    for (const group of lines) {
      doc.font('Helvetica-Bold').fillColor('#152830').text(`${group.workTypeLabel}:`, colArbeit, y);
      y = doc.y + 6;
      doc.font('Helvetica').fillColor('#2a4a55');
      for (const emp of group.employees) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.text(emp.employeeName, colArbeit + 12, y, { width: 230 });
        const rowY = y;
        doc.text(`${formatHoursQty(emp.hours)} h`, colMenge, rowY, { width: 70, align: 'right' });
        doc.text(formatSwissAmount(HOURLY_RATE_CHF), colPreis, rowY, { width: 70, align: 'right' });
        doc.text(formatSwissAmount(emp.amount), colTotal, rowY, { width: 85, align: 'right' });
        y = Math.max(doc.y, rowY + 14) + 2;
      }
      y += 6;
    }

    y += 8;
    doc
      .moveTo(300, y)
      .lineTo(right, y)
      .strokeColor('#c5d0d6')
      .stroke();
    y += 12;

    const labelX = 300;
    const valueW = right - 380;
    doc.font('Helvetica').fillColor('#152830');
    doc.text('Zwischentotal', labelX, y);
    doc.text(`CHF ${formatSwissAmount(subtotal)}`, 380, y, { width: valueW, align: 'right' });
    y += 16;
    doc.text(`MWST ${formatVatRate(vatRate)}%`, labelX, y);
    doc.text(`CHF ${formatSwissAmount(vat)}`, 380, y, { width: valueW, align: 'right' });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Gesamttotal', labelX, y);
    doc.text(`CHF ${formatSwissAmount(total)}`, 380, y, { width: valueW, align: 'right' });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4a6570')
      .text('Zahlungsbedingungen: 14 Tage netto', 50, 780, { width: pageWidth - 100, align: 'left' });

    doc.end();
  });
}

module.exports = { renderInvoicePdf };
