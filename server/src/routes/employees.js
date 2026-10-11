const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { toPublicUser } = require('../lib/userDto');

const router = express.Router();

const COLS = ['#12B8E1', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#64748b'];

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Passwort mindestens 8 Zeichen'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  jobTitle: z.string().max(120).optional(),
  hourlyRate: z.coerce.number().min(0).max(500).optional(),
  weeklyHours: z.coerce.number().int().min(1).max(60).optional(),
  isTimeTracked: z.boolean().optional(),
});

const patchSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  jobTitle: z.string().max(120).optional(),
  hourlyRate: z.coerce.number().min(0).max(500).optional(),
  weeklyHours: z.coerce.number().int().min(0).max(60).optional(),
  isTimeTracked: z.boolean().optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.use(requireAuth);

/** Time-tracked users (employees and admins who work on site). */
router.get('/', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isTimeTracked: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json({ employees: users.map(toPublicUser) });
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'E-Mail bereits vergeben' });
  }
  const count = await prisma.user.count();
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'EMPLOYEE',
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      jobTitle: body.jobTitle?.trim() || 'Mitarbeiter',
      hourlyRate: body.hourlyRate ?? 35,
      weeklyHours: body.weeklyHours ?? 45,
      isTimeTracked: body.isTimeTracked !== false,
      avatarColor: COLS[count % COLS.length],
    },
  });
  res.status(201).json({ employee: toPublicUser(user) });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  }
  const data = {};
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName.trim();
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName.trim();
  if (parsed.data.jobTitle !== undefined) data.jobTitle = parsed.data.jobTitle.trim();
  if (parsed.data.hourlyRate !== undefined) data.hourlyRate = parsed.data.hourlyRate;
  if (parsed.data.weeklyHours !== undefined) data.weeklyHours = parsed.data.weeklyHours;
  if (parsed.data.isTimeTracked !== undefined) data.isTimeTracked = parsed.data.isTimeTracked;
  if (parsed.data.avatarColor !== undefined) data.avatarColor = parsed.data.avatarColor;
  const user = await prisma.user.update({ where: { id: target.id }, data });
  res.json({ employee: toPublicUser(user) });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== 'EMPLOYEE') {
    return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  }
  await prisma.user.delete({ where: { id: target.id } });
  res.status(204).send();
});

module.exports = router;
