const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const entryBody = z.object({
  userId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromMinutes: z.coerce.number().int().min(0).max(24 * 60),
  toMinutes: z.coerce.number().int().min(0).max(24 * 60),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  note: z.string().max(500).optional().default(''),
});

function toEntryDto(e) {
  return {
    id: e.id,
    userId: e.userId,
    date: e.date,
    fromMinutes: e.fromMinutes,
    toMinutes: e.toMinutes,
    breakMinutes: e.breakMinutes,
    note: e.note || '',
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  const userIdFilter = req.query.userId;

  const where = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }

  if (req.user.role === 'ADMIN') {
    if (userIdFilter) where.userId = userIdFilter;
  } else {
    where.userId = req.user.id;
  }

  const entries = await prisma.timeEntry.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ entries: entries.map(toEntryDto) });
});

router.post('/', async (req, res) => {
  const parsed = entryBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  let targetUserId = req.user.id;

  if (body.userId && body.userId !== req.user.id) {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    const emp = await prisma.user.findFirst({
      where: { id: body.userId, role: 'EMPLOYEE' },
    });
    if (!emp) return res.status(400).json({ error: 'Ungültiger Mitarbeiter' });
    targetUserId = body.userId;
  }

  const net = body.toMinutes - body.fromMinutes - body.breakMinutes;
  if (net <= 0) {
    return res.status(400).json({ error: 'Nettoarbeitszeit muss positiv sein' });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: targetUserId,
      date: body.date,
      fromMinutes: body.fromMinutes,
      toMinutes: body.toMinutes,
      breakMinutes: body.breakMinutes,
      note: body.note || '',
    },
  });
  res.status(201).json({ entry: toEntryDto(entry) });
});

router.patch('/:id', async (req, res) => {
  const existing = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  if (req.user.role !== 'ADMIN' && existing.userId !== req.user.id) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  const parsed = entryBody.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const data = {};

  if (body.date !== undefined) data.date = body.date;
  if (body.fromMinutes !== undefined) data.fromMinutes = body.fromMinutes;
  if (body.toMinutes !== undefined) data.toMinutes = body.toMinutes;
  if (body.breakMinutes !== undefined) data.breakMinutes = body.breakMinutes;
  if (body.note !== undefined) data.note = body.note;

  if (body.userId !== undefined && req.user.role === 'ADMIN') {
    const emp = await prisma.user.findFirst({
      where: { id: body.userId, role: 'EMPLOYEE' },
    });
    if (!emp) return res.status(400).json({ error: 'Ungültiger Mitarbeiter' });
    data.userId = body.userId;
  }

  const merged = {
    date: data.date ?? existing.date,
    fromMinutes: data.fromMinutes ?? existing.fromMinutes,
    toMinutes: data.toMinutes ?? existing.toMinutes,
    breakMinutes: data.breakMinutes ?? existing.breakMinutes,
  };
  const net = merged.toMinutes - merged.fromMinutes - merged.breakMinutes;
  if (net <= 0) {
    return res.status(400).json({ error: 'Nettoarbeitszeit muss positiv sein' });
  }

  const entry = await prisma.timeEntry.update({
    where: { id: existing.id },
    data,
  });
  res.json({ entry: toEntryDto(entry) });
});

router.delete('/:id', async (req, res) => {
  const existing = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  if (req.user.role !== 'ADMIN' && existing.userId !== req.user.id) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  await prisma.timeEntry.delete({ where: { id: existing.id } });
  res.status(204).end();
});

module.exports = router;
