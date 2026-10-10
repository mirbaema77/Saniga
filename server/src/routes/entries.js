const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const entryBody = z.object({
  userId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  toMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  note: z.string().max(500).optional().default(''),
  siteId: z.string().min(1).optional().nullable(),
  workTypeId: z.string().min(1).optional().nullable(),
  hours: z.coerce.number().min(0.5).max(24).optional().nullable(),
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
    siteId: e.siteId || null,
    workTypeId: e.workTypeId || null,
    hours: e.hours == null ? null : Number(e.hours),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function minutesFromHours(hours) {
  return Math.round(Number(hours) * 60);
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

  const hasHours = body.hours != null;
  let fromMinutes = body.fromMinutes;
  let toMinutes = body.toMinutes;
  let breakMinutes = body.breakMinutes ?? 0;

  if (hasHours) {
    fromMinutes = 0;
    toMinutes = minutesFromHours(body.hours);
    breakMinutes = 0;
  } else if (fromMinutes == null || toMinutes == null) {
    return res.status(400).json({ error: 'Stunden oder Von/Bis erforderlich' });
  }

  const net = toMinutes - fromMinutes - breakMinutes;
  if (net <= 0) {
    return res.status(400).json({ error: 'Nettoarbeitszeit muss positiv sein' });
  }

  if (body.siteId) {
    const site = await prisma.site.findFirst({ where: { id: body.siteId, active: true } });
    if (!site) return res.status(400).json({ error: 'Ungültiges Objekt' });
  }
  if (body.workTypeId) {
    const wt = await prisma.workType.findFirst({ where: { id: body.workTypeId, active: true } });
    if (!wt) return res.status(400).json({ error: 'Ungültige Arbeitsart' });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: targetUserId,
      date: body.date,
      fromMinutes,
      toMinutes,
      breakMinutes,
      note: body.note || '',
      siteId: body.siteId || null,
      workTypeId: body.workTypeId || null,
      hours: hasHours ? body.hours : null,
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
  if (body.note !== undefined) data.note = body.note;
  if (body.siteId !== undefined) data.siteId = body.siteId;
  if (body.workTypeId !== undefined) data.workTypeId = body.workTypeId;

  if (body.hours !== undefined && body.hours != null) {
    data.hours = body.hours;
    data.fromMinutes = 0;
    data.toMinutes = minutesFromHours(body.hours);
    data.breakMinutes = 0;
  } else {
    if (body.fromMinutes !== undefined) data.fromMinutes = body.fromMinutes;
    if (body.toMinutes !== undefined) data.toMinutes = body.toMinutes;
    if (body.breakMinutes !== undefined) data.breakMinutes = body.breakMinutes;
  }

  if (body.userId !== undefined && req.user.role === 'ADMIN') {
    const emp = await prisma.user.findFirst({
      where: { id: body.userId, role: 'EMPLOYEE' },
    });
    if (!emp) return res.status(400).json({ error: 'Ungültiger Mitarbeiter' });
    data.userId = body.userId;
  }

  if (body.siteId) {
    const site = await prisma.site.findFirst({ where: { id: body.siteId, active: true } });
    if (!site) return res.status(400).json({ error: 'Ungültiges Objekt' });
  }
  if (body.workTypeId) {
    const wt = await prisma.workType.findFirst({ where: { id: body.workTypeId, active: true } });
    if (!wt) return res.status(400).json({ error: 'Ungültige Arbeitsart' });
  }

  const merged = {
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
