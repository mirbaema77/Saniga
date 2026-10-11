const { PrismaClient } = require('@prisma/client');
const { buildInvoiceView } = require('../src/lib/invoiceMath');
const layout = require('../src/lib/invoiceLayout');
const { renderInvoicePdf } = require('../src/lib/invoicePdf');
const { renderInvoiceDocx } = require('../src/lib/invoiceDocx');

const prisma = new PrismaClient();

async function main() {
  await prisma.company.update({
    where: { id: 'default' },
    data: { invoiceStartNumber: 55 },
  });
  const co = await prisma.company.findUnique({ where: { id: 'default' } });
  console.log('company', co.name, co.uid, co.invoiceStartNumber, Number(co.vatRate));

  const inv = {
    number: '55/2026',
    vatRate: Number(co.vatRate),
    issueDate: new Date('2026-10-11'),
    periodFrom: new Date('2026-10-05'),
    periodTo: new Date('2026-10-11'),
    customer: {
      name: 'Muster AG',
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zürich',
      paymentTermDays: 30,
    },
    site: { label: 'MFH' },
    entries: [
      {
        date: '2026-10-06',
        hours: 8,
        userId: 'u',
        workTypeId: 'w',
        user: { firstName: 'T', lastName: 'R' },
        workType: { label: 'Rohmontage' },
      },
    ],
    lines: [
      {
        workTypeId: 'w',
        userId: 'u',
        hours: 8,
        chfPerHour: 70,
        total: 560,
        workType: { label: 'Rohmontage' },
        user: { firstName: 'T', lastName: 'R' },
      },
    ],
  };
  const v = buildInvoiceView(inv, co);
  console.log(v.recipientLines);
  console.log(v.footerLines[0]);
  console.log(v.metaRows[0]);
  console.log('cols', layout.PDF_COLS.arbeit.x, layout.PDF_COLS.total.x + layout.PDF_COLS.total.width);
  const [pdf, docx] = await Promise.all([renderInvoicePdf(inv, co), renderInvoiceDocx(inv, co)]);
  console.log('ok', pdf.length, docx.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
