const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const optionalStr = z.string().max(500).optional().nullable();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  street: optionalStr,
  postalCode: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  contactPerson: z.string().max(200).optional().nullable(),
  paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  street: optionalStr,
  postalCode: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  contactPerson: z.string().max(200).optional().nullable(),
  paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
});

function trimOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t || null;
}

router.use(requireAuth);

router.get('/', async (_req, res) => {
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
      street: trimOrNull(body.street ?? null),
      postalCode: trimOrNull(body.postalCode ?? null),
      city: trimOrNull(body.city ?? null),
      contactPerson: trimOrNull(body.contactPerson ?? null),
      paymentTermDays: body.paymentTermDays ?? 14,
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
  if (parsed.data.street !== undefined) data.street = trimOrNull(parsed.data.street);
  if (parsed.data.postalCode !== undefined) data.postalCode = trimOrNull(parsed.data.postalCode);
  if (parsed.data.city !== undefined) data.city = trimOrNull(parsed.data.city);
  if (parsed.data.contactPerson !== undefined) data.contactPerson = trimOrNull(parsed.data.contactPerson);
  if (parsed.data.paymentTermDays !== undefined) data.paymentTermDays = parsed.data.paymentTermDays;
  const customer = await prisma.customer.update({ where: { id: target.id }, data });
  res.json({ customer });
});

module.exports = router;
