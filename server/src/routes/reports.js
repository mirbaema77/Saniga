const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const IsoWeek = require('../../public/iso-week');

const router = express.Router();

function entryHours(e) {
  if (e.hours != null) return Number(e.hours);
  return (e.toMinutes - e.fromMinutes - e.breakMinutes) / 60;
}

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  week: z.coerce.number().int().min(1).max(53).optional(),
});

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }

  const current = IsoWeek.getISOWeekParts(new Date());
  const year = parsed.data.year ?? current.year;
  const week = parsed.data.week ?? current.week;
  const { from, to } = IsoWeek.isoWeekBounds(year, week);

  const rows = await prisma.timeEntry.findMany({
    where: {
      siteId: { not: null },
      date: { gte: from, lte: to },
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      site: { include: { customer: true } },
      workType: { select: { label: true } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const byCustomer = new Map();

  for (const e of rows) {
    if (!e.site || !e.site.customer) continue;
    const customer = e.site.customer;
    const hours = Math.round(entryHours(e) * 100) / 100;
    const entryDto = {
      date: e.date,
      employeeName: `${e.user.firstName} ${e.user.lastName}`.trim(),
      workType: e.workType?.label || '—',
      hours,
      note: e.note || '',
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
        entries: [],
      });
    }
    const site = cust.sites.get(e.site.id);
    site.entries.push(entryDto);
    site.totalHours = Math.round((site.totalHours + hours) * 100) / 100;
    cust.totalHours = Math.round((cust.totalHours + hours) * 100) / 100;
  }

  const customers = [...byCustomer.values()]
    .map((c) => ({
      id: c.id,
      name: c.name,
      totalHours: c.totalHours,
      sites: [...c.sites.values()].sort((a, b) => a.label.localeCompare(b.label, 'de')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  res.json({ year, week, from, to, customers });
});

module.exports = router;
