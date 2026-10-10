const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} = require('docx');
const {
  HOURLY_RATE_CHF,
  formatSwissAmount,
  formatHoursQty,
  buildInvoiceView,
} = require('./invoiceMath');

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'C5D0D6' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C5D0D6' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function cell(text, opts = {}) {
  const {
    bold = false,
    align = AlignmentType.LEFT,
    width = 2340,
    borders = noBorder,
    color = '152830',
  } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold,
            size: 20,
            font: 'Calibri',
            color,
          }),
        ],
      }),
    ],
  });
}

/**
 * @returns {Promise<Buffer>}
 */
async function renderInvoiceDocx(invoice) {
  const view = buildInvoiceView(invoice);
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: view.customerName, size: 20, font: 'Calibri', color: '152830' })],
    })
  );
  if (view.customerAddress) {
    for (const line of String(view.customerAddress).split(/\r?\n/)) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: line, size: 20, font: 'Calibri', color: '4A6570' })],
        })
      );
    }
  }

  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Hinwil, ${view.issueDateLabel}`,
          size: 22,
          font: 'Calibri',
          color: '152830',
        }),
      ],
    })
  );
  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Rechnung ${view.number}`,
          bold: true,
          size: 32,
          font: 'Calibri',
          color: '152830',
        }),
      ],
    })
  );
  children.push(new Paragraph({ children: [] }));

  const meta = [
    'MWST.-Nr. CHE-298.414.455',
    `Objekt-Liegenschaft ${view.siteLabel}`,
    'Arbeitsgattung "BKP 250 Sanitäranlagen"',
    `Ausführungsdatum ${view.periodFromLabel} – ${view.periodToLabel}`,
  ];
  for (const line of meta) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line, size: 20, font: 'Calibri', color: '2A4A55' })],
      })
    );
  }

  children.push(new Paragraph({ children: [] }));

  const tableRows = [
    new TableRow({
      children: [
        cell('Arbeit', { bold: true, width: 3600, borders: thinBorder }),
        cell('Menge', { bold: true, align: AlignmentType.RIGHT, width: 1400, borders: thinBorder }),
        cell('Preis', { bold: true, align: AlignmentType.RIGHT, width: 1400, borders: thinBorder }),
        cell('Total', { bold: true, align: AlignmentType.RIGHT, width: 1600, borders: thinBorder }),
      ],
    }),
  ];

  for (const group of view.lineItems) {
    tableRows.push(
      new TableRow({
        children: [
          cell(`${group.workTypeLabel}:`, { bold: true, width: 3600 }),
          cell('', { width: 1400 }),
          cell('', { width: 1400 }),
          cell('', { width: 1600 }),
        ],
      })
    );
    for (const emp of group.employees) {
      tableRows.push(
        new TableRow({
          children: [
            cell(`  ${emp.employeeName}`, { width: 3600, color: '2A4A55' }),
            cell(`${formatHoursQty(emp.hours)} h`, {
              align: AlignmentType.RIGHT,
              width: 1400,
              color: '2A4A55',
            }),
            cell(formatSwissAmount(HOURLY_RATE_CHF), {
              align: AlignmentType.RIGHT,
              width: 1400,
              color: '2A4A55',
            }),
            cell(formatSwissAmount(emp.amount), {
              align: AlignmentType.RIGHT,
              width: 1600,
              color: '2A4A55',
            }),
          ],
        })
      );
    }
  }

  children.push(
    new Table({
      width: { size: 8000, type: WidthType.DXA },
      columnWidths: [3600, 1400, 1400, 1600],
      rows: tableRows,
    })
  );

  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `Zwischentotal    CHF ${formatSwissAmount(view.subtotal)}`,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `MWST ${view.vatRateLabel}%    CHF ${formatSwissAmount(view.vat)}`,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 120 },
      children: [
        new TextRun({
          text: `Gesamttotal    CHF ${formatSwissAmount(view.total)}`,
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
    })
  );
  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Zahlungsbedingungen: 14 Tage netto',
          size: 18,
          font: 'Calibri',
          color: '4A6570',
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderInvoiceDocx };
