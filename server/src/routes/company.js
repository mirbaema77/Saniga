const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getCompany, toCompanyDto } = require('../lib/company');

const router = express.Router();

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  street: z.string().max(500).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  uid: z.string().max(40).optional().nullable(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  invoiceStartNumber: z.coerce.number().int().min(1).max(999999).optional(),
});

function trimOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t || null;
}

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const company = await getCompany();
  res.json({ company: toCompanyDto(company) });
});

router.patch('/', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  await getCompany();
  const data = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.street !== undefined) data.street = trimOrNull(parsed.data.street);
  if (parsed.data.postalCode !== undefined) data.postalCode = trimOrNull(parsed.data.postalCode);
  if (parsed.data.city !== undefined) data.city = trimOrNull(parsed.data.city);
  if (parsed.data.uid !== undefined) data.uid = trimOrNull(parsed.data.uid);
  if (parsed.data.vatRate !== undefined) data.vatRate = parsed.data.vatRate;
  if (parsed.data.invoiceStartNumber !== undefined) {
    data.invoiceStartNumber = parsed.data.invoiceStartNumber;
  }
  const company = await prisma.company.update({
    where: { id: 'default' },
    data,
  });
  res.json({ company: toCompanyDto(company) });
});

module.exports = router;
