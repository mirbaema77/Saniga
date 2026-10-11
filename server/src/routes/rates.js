const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createRateClosingPrevious, utcDateToYmd } = require('../lib/rate');

const router = express.Router();

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z
  .object({
    customerId: z.string().min(1).nullable().optional(),
    workTypeId: z.string().min(1).nullable().optional(),
    userId: z.string().min(1).nullable().optional(),
    chfPerHour: z.number().positive().max(999999),
    validFrom: ymd,
    validTo: ymd.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.validTo && val.validTo < val.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'gültig bis muss nach gültig ab liegen',
        path: ['validTo'],
      });
    }
  });

function toRateDto(rate) {
  return {
    id: rate.id,
    customerId: rate.customerId,
    workTypeId: rate.workTypeId,
    userId: rate.userId,
    chfPerHour: Number(rate.chfPerHour),
    validFrom: utcDateToYmd(rate.validFrom),
    validTo: rate.validTo ? utcDateToYmd(rate.validTo) : null,
    createdAt: rate.createdAt,
    customer: rate.customer
      ? { id: rate.customer.id, name: rate.customer.name }
      : null,
    workType: rate.workType
      ? { id: rate.workType.id, label: rate.workType.label }
      : null,
    user: rate.user
      ? {
          id: rate.user.id,
          firstName: rate.user.firstName,
          lastName: rate.user.lastName,
          name: `${rate.user.firstName} ${rate.user.lastName}`.trim(),
        }
      : null,
  };
}

const rateInclude = {
  customer: true,
  workType: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
};

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const rates = await prisma.rate.findMany({
    include: rateInclude,
    orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ rates: rates.map(toRateDto) });
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse({
    ...req.body,
    customerId: req.body.customerId || null,
    workTypeId: req.body.workTypeId || null,
    userId: req.body.userId || null,
    validTo: req.body.validTo || null,
    chfPerHour:
      req.body.chfPerHour != null ? Number(req.body.chfPerHour) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const data = parsed.data;

  if (data.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!c) return res.status(400).json({ error: 'Kunde nicht gefunden' });
  }
  if (data.workTypeId) {
    const w = await prisma.workType.findUnique({ where: { id: data.workTypeId } });
    if (!w) return res.status(400).json({ error: 'Arbeitsart nicht gefunden' });
  }
  if (data.userId) {
    const u = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!u) return res.status(400).json({ error: 'Mitarbeiter nicht gefunden' });
  }

  const rate = await createRateClosingPrevious(data);
  res.status(201).json({ rate: toRateDto(rate) });
});

module.exports = router;
