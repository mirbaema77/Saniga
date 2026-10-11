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
  ImageRun,
  VerticalAlign,
} = require('docx');
const {
  formatSwissAmount,
  formatHoursQty,
  buildInvoiceView,
} = require('./invoiceMath');
const { loadLogoPng } = require('./invoiceLogo');
const { PAGE_CONTENT_DXA, DOCX_COLS, DOCX_COL_WIDTHS } = require('./invoiceLayout');

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const topRule = {
  top: { style: BorderStyle.SINGLE, size: 12, color: '152830' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const bottomRule = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.SINGLE, size: 12, color: '152830' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function cell(text, opts = {}) {
  const {
    bold = false,
    align = AlignmentType.LEFT,
    width = DOCX_COLS.arbeit,
    borders = noBorder,
    color = '152830',
    size = 20,
  } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold,
            size,
            font: 'Calibri',
            color,
          }),
        ],
      }),
    ],
  });
}

function emptyCell(width, borders = noBorder) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    children: [new Paragraph({ children: [] })],
  });
}

/**
 * @returns {Promise<Buffer>}
 */
async function renderInvoiceDocx(invoice, company = null) {
  const view = buildInvoiceView(invoice, company);
  const logoBuf = loadLogoPng();
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [
        new ImageRun({
          type: 'png',
          data: logoBuf,
          transformation: { width: 208, height: 40 },
          altText: { title: 'Saniga AG', description: 'Saniga AG Logo', name: 'logo-saniga' },
        }),
      ],
    })
  );

  const leftSpacer = Math.round(PAGE_CONTENT_DXA * 0.55);
  const rightCol = PAGE_CONTENT_DXA - leftSpacer;
  const recipientLines = view.recipientLines || ['', '', ''];

  const recipientParas = [
    ...recipientLines.map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: line || ' ', size: 20, font: 'Calibri', color: '152830' })],
        })
    ),
    new Paragraph({ spacing: { before: 160 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `${view.issuePlaceLabel}, ${view.issueDateLabel}`,
          size: 20,
          font: 'Calibri',
          color: '152830',
        }),
      ],
    }),
  ];

  children.push(
    new Table({
      width: { size: PAGE_CONTENT_DXA, type: WidthType.DXA },
      columnWidths: [leftSpacer, rightCol],
      rows: [
        new TableRow({
          children: [
            emptyCell(leftSpacer),
            new TableCell({
              width: { size: rightCol, type: WidthType.DXA },
              borders: noBorder,
              children: recipientParas,
            }),
          ],
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Rechnung ${view.number}`,
          bold: true,
          size: 28,
          font: 'Calibri',
          color: '152830',
        }),
      ],
    })
  );
  children.push(new Paragraph({ spacing: { before: 120 }, children: [] }));

  const metaLabelW = 3200;
  const metaValueW = PAGE_CONTENT_DXA - metaLabelW;
  children.push(
    new Table({
      width: { size: PAGE_CONTENT_DXA, type: WidthType.DXA },
      columnWidths: [metaLabelW, metaValueW],
      rows: view.metaRows.map(
        (row) =>
          new TableRow({
            children: [
              cell(row.label, { width: metaLabelW, size: 20 }),
              cell(row.value || '', { width: metaValueW, size: 20 }),
            ],
          })
      ),
    })
  );

  children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));

  const tableRows = [
    new TableRow({
      children: [
        cell('Arbeit', { bold: true, width: DOCX_COLS.arbeit, borders: topRule, size: 18 }),
        cell('Menge', {
          bold: true,
          align: AlignmentType.RIGHT,
          width: DOCX_COLS.menge,
          borders: topRule,
          size: 18,
        }),
        cell('Preis', {
          bold: true,
          align: AlignmentType.RIGHT,
          width: DOCX_COLS.preis,
          borders: topRule,
          size: 18,
        }),
        cell('Total', {
          bold: true,
          align: AlignmentType.RIGHT,
          width: DOCX_COLS.total,
          borders: topRule,
          size: 18,
        }),
      ],
    }),
  ];

  for (const group of view.lineItems) {
    tableRows.push(
      new TableRow({
        children: [
          cell(`${group.workTypeLabel}:`, { bold: true, width: DOCX_COLS.arbeit }),
          emptyCell(DOCX_COLS.menge),
          emptyCell(DOCX_COLS.preis),
          emptyCell(DOCX_COLS.total),
        ],
      })
    );
    for (const emp of group.employees) {
      tableRows.push(
        new TableRow({
          children: [
            cell(`  ${emp.employeeName}`, { width: DOCX_COLS.arbeit }),
            cell(`${formatHoursQty(emp.hours)} h`, {
              align: AlignmentType.RIGHT,
              width: DOCX_COLS.menge,
            }),
            cell(formatSwissAmount(emp.chfPerHour), {
              align: AlignmentType.RIGHT,
              width: DOCX_COLS.preis,
            }),
            cell(formatSwissAmount(emp.amount), {
              align: AlignmentType.RIGHT,
              width: DOCX_COLS.total,
            }),
          ],
        })
      );
    }
  }

  tableRows.push(
    new TableRow({
      children: [
        emptyCell(DOCX_COLS.arbeit, bottomRule),
        emptyCell(DOCX_COLS.menge, bottomRule),
        emptyCell(DOCX_COLS.preis, bottomRule),
        emptyCell(DOCX_COLS.total, bottomRule),
      ],
    })
  );

  for (const t of [
    { label: 'Zwischentotal', amount: view.subtotal, bold: false },
    { label: `MWST ${view.vatRateLabel}%`, amount: view.vat, bold: false },
    { label: 'Gesamttotal CHF', amount: view.total, bold: true },
  ]) {
    tableRows.push(
      new TableRow({
        children: [
          cell(t.label, { bold: t.bold, width: DOCX_COLS.arbeit, size: t.bold ? 22 : 20 }),
          emptyCell(DOCX_COLS.menge),
          emptyCell(DOCX_COLS.preis),
          cell(`CHF ${formatSwissAmount(t.amount)}`, {
            bold: t.bold,
            align: AlignmentType.RIGHT,
            width: DOCX_COLS.total,
            size: t.bold ? 22 : 20,
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: PAGE_CONTENT_DXA, type: WidthType.DXA },
      columnWidths: DOCX_COL_WIDTHS,
      rows: tableRows,
    })
  );

  children.push(new Paragraph({ spacing: { before: 280 }, children: [] }));
  for (const line of view.footerLines) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line, size: 18, font: 'Calibri', color: '152830' })],
      })
    );
  }

  const doc = new Document({
    background: { color: 'FFFFFF' },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 850, right: 850, bottom: 850, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderInvoiceDocx };
