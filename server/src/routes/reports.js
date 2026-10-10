const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** ISO week number + ISO week-year for a local/UTC calendar date. */
function getISOWeekParts(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Monday–Sunday (UTC dates) for an ISO week. */
function isoWeekBounds(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - day + 1);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: formatYmd(monday),
    to: formatYmd(sunday),
  };
}

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

  const current = getISOWeekParts(new Date());
  const year = parsed.data.year ?? current.year;
  const week = parsed.data.week ?? current.week;
  const { from, to } = isoWeekBounds(year, week);

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
