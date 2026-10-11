const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  totalsFromLines,
  buildInvoiceView,
  workDateBounds,
  groupFrozenLines,
} = require('../lib/invoiceMath');
const {
  loadRates,
  buildFrozenLines,
  MissingRateError,
} = require('../lib/rate');
const { getCompany } = require('../lib/company');
const { renderInvoicePdf } = require('../lib/invoicePdf');
const { renderInvoiceDocx } = require('../lib/invoiceDocx');
const { issueDownloadLink, consumeDownloadLink, isValidFormat } = require('../lib/downloadLink');

const router = express.Router();

const EMPTY_SELECTION_MSG = 'Keine unverrechneten verrechenbaren Einträge für diese Auswahl';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z
  .object({
    siteId: z.string().min(1),
    from: ymd,
    to: ymd,
    workTypeId: z.string().min(1).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.from > val.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from muss vor to liegen', path: ['to'] });
    }
  });

const cancelSchema = z.object({
  reason: z.string().trim().min(1, 'Begründung erforderlich').max(500),
});

/** Shared where-clause for billable, uninvoiced entries matching invoice filters. */
function invoiceEntryWhere({ siteId, from, to, workTypeId }) {
  const where = {
    siteId,
    invoiceId: null,
    hours: { not: null },
    date: { gte: from, lte: to },
    AND: [{ OR: [{ workTypeId: null }, { workType: { billable: true } }] }],
  };
  if (workTypeId) {
    where.workTypeId = workTypeId;
  }
  return where;
}

const invoiceEntryInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  workType: { select: { id: true, label: true } },
};

const invoiceLineInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  workType: { select: { id: true, label: true } },
};

function ymdToUtcDate(ymdStr, endOfDay = false) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  if (endOfDay) return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

async function nextInvoiceNumber(year) {
  const company = await getCompany();
  const start = Math.max(1, Number(company.invoiceStartNumber) || 1);
  const suffix = `/${year}`;
  const existing = await prisma.invoice.findMany({
    where: { number: { endsWith: suffix } },
    select: { number: true },
  });
  let max = start - 1;
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
    createdAt: invoice.createdAt,
    cancelledAt: invoice.cancelledAt || null,
    cancelledReason: invoice.cancelledReason || null,
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          street: invoice.customer.street,
          postalCode: invoice.customer.postalCode,
          city: invoice.customer.city,
          contactPerson: invoice.customer.contactPerson,
          paymentTermDays: invoice.customer.paymentTermDays,
        }
      : undefined,
    site: invoice.site
      ? {
          id: invoice.site.id,
          label: invoice.site.label,
          address: invoice.site.address,
          objectNumber: invoice.site.objectNumber || null,
        }
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
      lines: {
        include: invoiceLineInclude,
        orderBy: { id: 'asc' },
      },
      entries: {
        include: invoiceEntryInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

function lineItemsForInvoice(invoice) {
  if (invoice.lines && invoice.lines.length) {
    return groupFrozenLines(invoice.lines);
  }
  return [];
}

function safeFileName(number) {
  return String(number).replace(/[^\w.-]+/g, '_');
}

class EmptySelectionError extends Error {
  constructor() {
    super(EMPTY_SELECTION_MSG);
    this.code = 'EMPTY_SELECTION';
  }
}

async function resolveSelection(siteId, from, to, workTypeId, db = prisma) {
  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { customer: true },
  });
  if (!site) {
    const err = new Error('Standort nicht gefunden');
    err.code = 'SITE_NOT_FOUND';
    throw err;
  }

  const where = invoiceEntryWhere({
    siteId,
    from,
    to,
    workTypeId: workTypeId || null,
  });

  const entries = await db.timeEntry.findMany({
    where,
    include: invoiceEntryInclude,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  if (!entries.length) {
    throw new EmptySelectionError();
  }

  const rates = await loadRates(db);
  const frozen = buildFrozenLines(entries, site.customer, rates);
  if (!frozen.length) {
    throw new EmptySelectionError();
  }

  const lineItems = groupFrozenLines(frozen);
  return { site, entries, frozen, lineItems };
}

/** PDF/Word: one-time download key only (no session JWT in query). */
router.get('/:id/pdf', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const denied = await consumeDownloadLink(key, req.params.id, 'pdf');
  if (denied) {
    return res.status(denied.status).json({ error: denied.error });
  }

  const invoice = await loadInvoice(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }

  try {
    const company = await getCompany();
    const pdf = await renderInvoicePdf(invoice, company);
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
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const denied = await consumeDownloadLink(key, req.params.id, 'docx');
  if (denied) {
    return res.status(denied.status).json({ error: denied.error });
  }

  const invoice = await loadInvoice(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }

  try {
    const company = await getCompany();
    const docx = await renderInvoiceDocx(invoice, company);
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

router.use(requireAuth, requireAdmin);

const downloadLinkSchema = z.object({
  format: z.enum(['pdf', 'docx']),
});

router.post('/:id/download-link', async (req, res) => {
  const parsed = downloadLinkSchema.safeParse(req.body || {});
  if (!parsed.success || !isValidFormat(parsed.data.format)) {
    return res.status(400).json({ error: 'Format pdf oder docx erforderlich' });
  }
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!invoice) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }
  const issued = await issueDownloadLink(invoice.id, parsed.data.format);
  res.status(201).json({
    url: issued.urlPath,
    expiresAt: issued.expiresAt.toISOString(),
  });
});

router.get('/', async (_req, res) => {
  const company = await getCompany();
  const rows = await prisma.invoice.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      site: { select: { id: true, label: true } },
      lines: { include: invoiceLineInclude },
      entries: { include: invoiceEntryInclude },
    },
    orderBy: { createdAt: 'desc' },
  });

  const invoices = rows.map((inv) => {
    const view = buildInvoiceView(inv, company);
    return {
      id: inv.id,
      number: inv.number,
      customer: inv.customer,
      site: inv.site,
      periodFrom: inv.periodFrom,
      periodTo: inv.periodTo,
      issueDate: inv.issueDate,
      createdAt: inv.createdAt,
      cancelledAt: inv.cancelledAt || null,
      cancelledReason: inv.cancelledReason || null,
      total: view.total,
      subtotal: view.subtotal,
      vat: view.vat,
    };
  });

  res.json({ invoices });
});

/** Preview resolved rates without creating an invoice. */
router.post('/preview', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const { siteId, from, to, workTypeId } = parsed.data;

  try {
    const company = await getCompany();
    const { site, entries, frozen, lineItems } = await resolveSelection(
      siteId,
      from,
      to,
      workTypeId
    );
    const vatRate = Number(company.vatRate);
    const totals = totalsFromLines(lineItems, vatRate);
    const { from: workFrom, to: workTo } = workDateBounds(entries);
    res.json({
      customer: { id: site.customer.id, name: site.customer.name },
      site: { id: site.id, label: site.label },
      periodFrom: workFrom || from,
      periodTo: workTo || to,
      vatRate,
      lines: frozen,
      lineItems,
      ...totals,
    });
  } catch (e) {
    if (e.code === 'SITE_NOT_FOUND') {
      return res.status(404).json({ error: e.message });
    }
    if (e instanceof EmptySelectionError || e.code === 'EMPTY_SELECTION') {
      return res.status(409).json({ error: EMPTY_SELECTION_MSG });
    }
    if (e instanceof MissingRateError || e.code === 'MISSING_RATE') {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const { siteId, from, to, workTypeId } = parsed.data;

  const company = await getCompany();

  try {
    const { invoice, lineItems } = await prisma.$transaction(async (tx) => {
      const { site, entries, frozen, lineItems: items } = await resolveSelection(
        siteId,
        from,
        to,
        workTypeId,
        tx
      );

      const { from: workFrom, to: workTo } = workDateBounds(entries);
      const periodFromYmd = workFrom || from;
      const periodToYmd = workTo || to || workFrom;
      const year = Number(String(periodToYmd).slice(0, 4));
      const number = await nextInvoiceNumber(year);
      const periodFrom = ymdToUtcDate(periodFromYmd, false);
      const periodTo = ymdToUtcDate(periodToYmd, false);
      const issueDate = ymdToUtcDate(periodToYmd, false);

      const created = await tx.invoice.create({
        data: {
          number,
          customerId: site.customerId,
          siteId: site.id,
          issueDate,
          periodFrom,
          periodTo,
          vatRate: Number(company.vatRate),
          lines: {
            create: frozen.map((l) => ({
              workTypeId: l.workTypeId,
              userId: l.userId,
              hours: l.hours,
              chfPerHour: l.chfPerHour,
              total: l.total,
            })),
          },
        },
        include: {
          customer: true,
          site: true,
          lines: { include: invoiceLineInclude },
        },
      });

      const linked = await tx.timeEntry.updateMany({
        where: {
          id: { in: entries.map((e) => e.id) },
          invoiceId: null,
        },
        data: { invoiceId: created.id },
      });

      if (linked.count === 0) {
        throw new EmptySelectionError();
      }

      return { invoice: created, lineItems: items };
    });

    res.status(201).json({
      invoice: toInvoiceDto(invoice, lineItems),
    });
  } catch (e) {
    if (e.code === 'SITE_NOT_FOUND') {
      return res.status(404).json({ error: e.message });
    }
    if (e instanceof EmptySelectionError || e.code === 'EMPTY_SELECTION') {
      return res.status(409).json({ error: EMPTY_SELECTION_MSG });
    }
    if (e instanceof MissingRateError || e.code === 'MISSING_RATE') {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }
});

router.post('/:id/cancel', async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bitte eine Begründung angeben', details: parsed.error.flatten() });
  }
  const reason = parsed.data.reason.trim();

  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  }
  if (existing.cancelledAt) {
    return res.status(409).json({ error: 'Rechnung ist bereits storniert' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        cancelledAt: new Date(),
        cancelledReason: reason,
      },
    });
    await tx.timeEntry.updateMany({
      where: { invoiceId: existing.id },
      data: { invoiceId: null },
    });
  });

  const fresh = await loadInvoice(existing.id);
  res.json({
    invoice: toInvoiceDto(fresh, lineItemsForInvoice(fresh)),
  });
});

module.exports = router;
module.exports.invoiceEntryWhere = invoiceEntryWhere;
module.exports.EMPTY_SELECTION_MSG = EMPTY_SELECTION_MSG;
