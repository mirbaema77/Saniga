const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { loadRates } = require('../lib/rate');
const { computeOpenDashboard } = require('../lib/dashboardOpen');

const router = express.Router();

router.use(requireAuth, requireAdmin);

/**
 * Billable, non-invoiced open hours + net CHF amounts (Rate model).
 */
router.get('/open', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const where = {
    invoiceId: null,
    siteId: { not: null },
    hours: { not: null },
    OR: [{ workTypeId: null }, { workType: { billable: true } }],
  };
  if (userId) where.userId = userId;

  const [entries, rates] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        workType: { select: { id: true, label: true, billable: true } },
        site: {
          include: {
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    loadRates(),
  ]);

  const stats = computeOpenDashboard(entries, rates);
  res.json(stats);
});

module.exports = router;
