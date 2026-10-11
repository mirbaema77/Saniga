const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { verifyPassword } = require('../lib/password');
const { signToken } = require('../lib/jwt');
const { toPublicUser } = require('../lib/userDto');
const { requireAuth } = require('../middleware/auth');
const { authRateLimiter } = require('../lib/rateLimit');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const loginLimiter = authRateLimiter({ max: 30 });

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

module.exports = router;
