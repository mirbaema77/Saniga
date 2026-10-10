const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json({ customers });
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const customer = await prisma.customer.create({
    data: {
      name: body.name.trim(),
      address: body.address?.trim() || null,
    },
  });
  res.status(201).json({ customer });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const target = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }
  const data = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.address !== undefined) {
    data.address = parsed.data.address === null ? null : parsed.data.address.trim() || null;
  }
  const customer = await prisma.customer.update({ where: { id: target.id }, data });
  res.json({ customer });
});

module.exports = router;
