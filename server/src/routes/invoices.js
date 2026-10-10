const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const IsoWeek = require('../../public/iso-week');
const {
  HOURLY_RATE_CHF,
  DEFAULT_VAT_RATE,
  buildLineItems,
  totalsFromLines,
  buildInvoiceView,
} = require('../lib/invoiceMath');
const { renderInvoicePdf } = require('../lib/invoicePdf');
const { renderInvoiceDocx } = require('../lib/invoiceDocx');

const router = express.Router();

const createSchema = z.object({
  siteId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  week: z.coerce.number().int().min(1).max(53),
});

const invoiceEntryInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  workType: { select: { id: true, label: true } },
};

function ymdToUtcDate(ymd, endOfDay = false) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (endOfDay) return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

async function nextInvoiceNumber(year) {
  const suffix = `/${year}`;
  const existing = await prisma.invoice.findMany({
    where: { number: { endsWith: suffix } },
    select: { number: true },
  });
  let max = 0;
  for (const row of existing) {
    const n = parseInt(String(row.number).split('/')[0], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${max + 1}/${year}`;
}

function toInvoiceDto(invoice, lineItems) {
  const vatRate = Number(invoice.vatRate);
  const totals = totalsFromLines(lineItems, vatRate);
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    siteId: invoice.siteId,
    issueDate: invoice.issueDate,
    periodFrom: invoice.periodFrom,
    periodTo: invoice.periodTo,
    vatRate,
    hourlyRate: HOURLY_RATE_CHF,
    createdAt: invoice.createdAt,
    customer: invoice.customer
      ? { id: invoice.customer.id, name: invoice.customer.name, address: invoice.customer.address }
      : undefined,
    site: invoice.site
      ? { id: invoice.site.id, label: invoice.site.label, address: invoice.site.address }
      : undefined,
    lineItems,
    ...totals,
  };
}

async function loadInvoice(id) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      site: true,
      entries: {
        include: invoiceEntryInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

function safeFileName(number) {
  return String(number).replace(/[^\w.-]+/g, '_');
}

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const rows = await prisma.invoice.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      site: { select: { id: true, label: true } },
      entries: { include: invoiceEntryInclude },
    },
    orderBy: { createdAt: 'desc' },
  });

  const invoices = rows.map((inv) => {
    const view = buildInvoiceView(inv);
    return {
      id: inv.id,
      number: inv.number,
      customer: inv.customer,
      site: inv.site,
      periodFrom: inv.periodFrom,
      periodTo: inv.periodTo,
      issueDate: inv.issueDate,
      createdAt: inv.createdAt,
      total: view.total,
      subtotal: view.subtotal,
      vat: view.vat,
    };
  });

  res.json({ invoices });
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const { siteId, year, week } = parsed.data;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { customer: true },
  });
  if (!site) {
    return res.status(404).json({ error: 'Standort nicht gefunden' });
  }

  const { from, to } = IsoWeek.isoWeekBounds(year, week);
  const entries = await prisma.timeEntry.findMany({
    where: {
      siteId,
      invoiceId: null,
      hours: { not: null },
      date: { gte: from, lte: to },
    },
    include: invoiceEntryInclude,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  if (!entries.length) {
    return res.status(409).json({ error: 'Keine unverrechneten Einträge für dieses Objekt und diese Woche' });
  }

  const lineItems = buildLineItems(entries);
  const number = await nextInvoiceNumber(year);
  const issueDate = new Date();
  const periodFrom = ymdToUtcDate(from, false);
  const periodTo = ymdToUtcDate(to, true);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        number,
        customerId: site.customerId,
        siteId: site.id,
        issueDate,
        periodFrom,
        periodTo,
        vatRate: DEFAULT_VAT_RATE,
      },
      include: {
        customer: true,
        site: true,
      },
    });
    await tx.timeEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { invoiceId: created.id },
    });
    return created;
  });

  res.status(201).json({
    invoice: toInvoiceDto(invoice, lineItems),
  });
});

router.get('/:id/pdf', async (req, res) => {
  const invoice = await loadInvoice(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }

  try {
    const pdf = await renderInvoicePdf(invoice);
    const safeName = safeFileName(invoice.number);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Rechnung-${safeName}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'PDF konnte nicht erzeugt werden' });
  }
});

router.get('/:id/docx', async (req, res) => {
  const invoice = await loadInvoice(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }

  try {
    const docx = await renderInvoiceDocx(invoice);
    const safeName = safeFileName(invoice.number);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${safeName}.docx"`);
    res.send(docx);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Word-Datei konnte nicht erzeugt werden' });
  }
});

module.exports = router;
