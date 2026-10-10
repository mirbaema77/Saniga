const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const createSchema = z.object({
  label: z.string().min(1).max(200),
  billable: z.boolean().optional(),
});

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  billable: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const workTypes = await prisma.workType.findMany({
    orderBy: { label: 'asc' },
  });
  res.json({ workTypes });
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const workType = await prisma.workType.create({
    data: {
      label: body.label.trim(),
      billable: body.billable ?? true,
    },
  });
  res.status(201).json({ workType });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const target = await prisma.workType.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Arbeitstyp nicht gefunden' });
  }
  const data = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim();
  if (parsed.data.billable !== undefined) data.billable = parsed.data.billable;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  const workType = await prisma.workType.update({ where: { id: target.id }, data });
  res.json({ workType });
});

module.exports = router;
