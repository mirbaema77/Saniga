const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signToken } = require('../lib/jwt');
const { toPublicUser } = require('../lib/userDto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COLS = ['#12B8E1', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#64748b'];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  inviteCode: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Passwort mindestens 8 Zeichen'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  jobTitle: z.string().max(120).optional(),
  hourlyRate: z.coerce.number().min(0).max(500).optional(),
  weeklyHours: z.coerce.number().int().min(1).max(60).optional(),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  }
  const token = signToken({ sub: user.id, role: user.role });
  return res.json({ token, user: toPublicUser(user) });
});

router.post('/register-employee', async (req, res) => {
  const expected = process.env.EMPLOYEE_INVITE_CODE;
  if (!expected) {
    return res.status(503).json({ error: 'Registrierung ist nicht konfiguriert' });
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  if (body.inviteCode !== expected) {
    return res.status(403).json({ error: 'Ungültiger Einladungscode' });
  }
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert' });
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
      avatarColor: COLS[count % COLS.length],
    },
  });
  const token = signToken({ sub: user.id, role: user.role });
  return res.status(201).json({ token, user: toPublicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.userPublic });
});

module.exports = router;
