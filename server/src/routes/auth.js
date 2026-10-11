const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { verifyPassword, hashPassword } = require('../lib/password');
const { signToken } = require('../lib/jwt');
const { toPublicUser } = require('../lib/userDto');
const { requireAuth } = require('../middleware/auth');
const { authRateLimiter } = require('../lib/rateLimit');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const patchMeSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Vorname erforderlich').max(80).optional(),
    lastName: z.string().trim().min(1, 'Nachname erforderlich').max(80).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, 'Neues Passwort mindestens 8 Zeichen').optional(),
  })
  .refine((d) => d.firstName !== undefined || d.lastName !== undefined || d.newPassword !== undefined, {
    message: 'Keine Änderungen',
  })
  .refine((d) => !d.newPassword || (d.currentPassword && d.currentPassword.length > 0), {
    message: 'Aktuelles Passwort erforderlich',
    path: ['currentPassword'],
  });

const loginLimiter = authRateLimiter({ max: 30 });
const profileLimiter = authRateLimiter({ max: 40 });

router.post('/login', loginLimiter, async (req, res) => {
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

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.userPublic });
});

router.patch('/me', requireAuth, profileLimiter, async (req, res) => {
  const parsed = patchMeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const msg =
      parsed.error.issues?.[0]?.message || 'Ungültige Eingabe';
    return res.status(400).json({ error: msg, details: parsed.error.flatten() });
  }
  const { firstName, lastName, currentPassword, newPassword } = parsed.data;
  const data = {};
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (newPassword) {
    const ok = await verifyPassword(currentPassword, req.user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }
    data.passwordHash = await hashPassword(newPassword);
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  return res.json({ user: toPublicUser(user) });
});

module.exports = router;
