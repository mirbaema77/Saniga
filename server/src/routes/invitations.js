const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { hashPassword } = require('../lib/password');
const { signToken } = require('../lib/jwt');
const { toPublicUser } = require('../lib/userDto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { authRateLimiter } = require('../lib/rateLimit');

const router = express.Router();
const acceptLimiter = authRateLimiter({ max: 20 });

const COLS = ['#12B8E1', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#64748b'];

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  jobTitle: z.string().max(120).optional(),
  hourlyRate: z.coerce.number().min(0).max(500).optional(),
  weeklyHours: z.coerce.number().int().min(1).max(60).optional(),
});

/** Only password is accepted from the client; profile fields come from Invitation. */
const acceptSchema = z.object({
  password: z.string().min(8, 'Passwort mindestens 8 Zeichen'),
});

function isUsable(inv) {
  if (!inv) return false;
  if (inv.usedAt) return false;
  if (inv.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

router.post('/', requireAuth, requireAdmin, async (req, res) => {
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

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const invitation = await prisma.invitation.create({
    data: {
      token,
      email,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      jobTitle: body.jobTitle?.trim() || 'Mitarbeiter',
      hourlyRate: body.hourlyRate ?? 35,
      weeklyHours: body.weeklyHours ?? 45,
      expiresAt,
    },
  });

  res.status(201).json({
    invitation: {
      id: invitation.id,
      token: invitation.token,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      expiresAt: invitation.expiresAt,
    },
  });
});

router.get('/:token', async (req, res) => {
  const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } });
  if (!isUsable(invitation)) {
    return res.status(404).json({ error: 'Einladung ungültig oder abgelaufen' });
  }
  res.json({
    invitation: {
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      jobTitle: invitation.jobTitle,
    },
  });
});

router.post('/:token/accept', acceptLimiter, async (req, res) => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }

  const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } });
  if (!invitation) {
    return res.status(404).json({ error: 'Einladung ungültig oder abgelaufen' });
  }
  if (invitation.usedAt) {
    return res.status(410).json({ error: 'Einladung wurde bereits verwendet' });
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    return res.status(410).json({ error: 'Einladung ist abgelaufen' });
  }

  const email = invitation.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert' });
  }

  // Ignore any client-supplied hourlyRate / weeklyHours / role / isTimeTracked.
  const count = await prisma.user.count();
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'EMPLOYEE',
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        jobTitle: invitation.jobTitle || 'Mitarbeiter',
        hourlyRate: invitation.hourlyRate,
        weeklyHours: invitation.weeklyHours,
        isTimeTracked: true,
        avatarColor: COLS[count % COLS.length],
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    });
    return created;
  });

  const jwt = signToken({ sub: user.id, role: user.role });
  res.status(201).json({ token: jwt, user: toPublicUser(user) });
});

module.exports = router;
