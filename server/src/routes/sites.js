const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const createSchema = z.object({
  customerId: z.string().min(1),
  label: z.string().min(1).max(200),
  objectNumber: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

const patchSchema = z.object({
  customerId: z.string().min(1).optional(),
  label: z.string().min(1).max(200).optional(),
  objectNumber: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const where = {};
  if (req.query.customerId) {
    where.customerId = String(req.query.customerId);
  }
  const sites = await prisma.site.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ sites });
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) {
    return res.status(400).json({ error: 'Ungültiger Kunde' });
  }
  const site = await prisma.site.create({
    data: {
      customerId: body.customerId,
      label: body.label.trim(),
      objectNumber: body.objectNumber?.trim() || null,
      address: body.address?.trim() || null,
    },
    include: { customer: true },
  });
  res.status(201).json({ site });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const target = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Standort nicht gefunden' });
  }
  if (parsed.data.customerId !== undefined) {
    const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
    if (!customer) {
      return res.status(400).json({ error: 'Ungültiger Kunde' });
    }
  }
  const data = {};
  if (parsed.data.customerId !== undefined) data.customerId = parsed.data.customerId;
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim();
  if (parsed.data.objectNumber !== undefined) {
    data.objectNumber =
      parsed.data.objectNumber === null ? null : parsed.data.objectNumber.trim() || null;
  }
  if (parsed.data.address !== undefined) {
    data.address = parsed.data.address === null ? null : parsed.data.address.trim() || null;
  }
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  const site = await prisma.site.update({
    where: { id: target.id },
    data,
    include: { customer: true },
  });
  res.json({ site });
});

module.exports = router;
