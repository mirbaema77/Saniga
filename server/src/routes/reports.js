const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function entryHours(e) {
  if (e.hours != null) return Number(e.hours);
  return (e.toMinutes - e.fromMinutes - e.breakMinutes) / 60;
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z
  .object({
    mode: z.enum(['open', 'range']).optional().default('open'),
    from: ymd.optional(),
    to: ymd.optional(),
    customerId: z.string().min(1).optional(),
    workTypeId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'range') {
      if (!val.from) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from erforderlich', path: ['from'] });
      }
      if (!val.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'to erforderlich', path: ['to'] });
      }
      if (val.from && val.to && val.from > val.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from muss vor to liegen', path: ['to'] });
      }
    }
  });

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }

  const { mode, from, to, customerId, workTypeId } = parsed.data;

  const where = {
    siteId: { not: null },
  };

  if (mode === 'open') {
    where.hours = { not: null };
    where.invoiceId = null;
  } else {
    where.date = { gte: from, lte: to };
  }

  if (workTypeId) {
    where.workTypeId = workTypeId;
  }

  if (customerId) {
    where.site = { customerId };
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true } },
      site: { include: { customer: true } },
      workType: { select: { id: true, label: true, billable: true } },
      invoice: { select: { id: true, number: true, cancelledAt: true } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const byCustomer = new Map();

  for (const e of rows) {
    if (!e.site || !e.site.customer) continue;
    const customer = e.site.customer;
    const hours = Math.round(entryHours(e) * 100) / 100;
    const billable = e.workType ? !!e.workType.billable : true;
    const activeInvoice = e.invoice && !e.invoice.cancelledAt ? e.invoice : null;
    const entryDto = {
      id: e.id,
      date: e.date,
      employeeName: `${e.user.firstName} ${e.user.lastName}`.trim(),
      workTypeId: e.workTypeId || null,
      workType: e.workType?.label || '—',
      billable,
      hours,
      note: e.note || '',
      invoiceId: activeInvoice ? activeInvoice.id : null,
      invoiceNumber: activeInvoice ? activeInvoice.number : null,
    };

    if (!byCustomer.has(customer.id)) {
      byCustomer.set(customer.id, {
        id: customer.id,
        name: customer.name,
        totalHours: 0,
        sites: new Map(),
      });
    }
    const cust = byCustomer.get(customer.id);

    if (!cust.sites.has(e.site.id)) {
      cust.sites.set(e.site.id, {
        id: e.site.id,
        label: e.site.label,
        totalHours: 0,
        billableOpenHours: 0,
        billableOpenCount: 0,
        entries: [],
      });
    }
    const site = cust.sites.get(e.site.id);
    site.entries.push(entryDto);
    site.totalHours = Math.round((site.totalHours + hours) * 100) / 100;
    cust.totalHours = Math.round((cust.totalHours + hours) * 100) / 100;
    if (billable && !e.invoiceId && e.hours != null) {
      site.billableOpenHours = Math.round((site.billableOpenHours + hours) * 100) / 100;
      site.billableOpenCount += 1;
    }
  }

  const customers = [...byCustomer.values()]
    .map((c) => ({
      id: c.id,
      name: c.name,
      totalHours: c.totalHours,
      sites: [...c.sites.values()].sort((a, b) => a.label.localeCompare(b.label, 'de')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  res.json({
    mode,
    from: mode === 'range' ? from : null,
    to: mode === 'range' ? to : null,
    customerId: customerId || null,
    workTypeId: workTypeId || null,
    customers,
  });
});

module.exports = router;
