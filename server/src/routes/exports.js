const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { buildHoursExportRows, rowsToCsv } = require('../lib/hoursExport');

const router = express.Router();

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  format: z.enum(['csv', 'json']).optional().default('csv'),
});

router.use(requireAuth, requireAdmin);

router.get('/hours', async (req, res) => {
  const parsed = monthSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Monat im Format YYYY-MM erforderlich' });
  }
  const { month, format } = parsed.data;

  const users = await prisma.user.findMany({
    where: { isTimeTracked: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const entries = await prisma.timeEntry.findMany({
    where: { date: { startsWith: month } },
    select: {
      userId: true,
      date: true,
      hours: true,
      fromMinutes: true,
      toMinutes: true,
      breakMinutes: true,
      workType: { select: { billable: true } },
    },
  });

  const { rows, totals } = buildHoursExportRows(users, entries, month);

  if (format === 'json') {
    return res.json({ month, rows, totals });
  }

  const csv = rowsToCsv(rows);
  const filename = `saniga-stunden-${month}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
