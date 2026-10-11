const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  weekdaysInRange,
  dailyHoursFromWeekly,
  minutesFromHours,
  groupAbsenceEntries,
  ABSENCE_WORK_TYPE_LABELS,
} = require('../lib/absenceExpand');
const { zhHolidaysAll, holidayYearsAround } = require('../lib/swissHolidays');
const EntryLimits = require('../../public/entry-limits');

const router = express.Router();
const { ENTRY_HOURS_MAX, entryHoursValue, round1 } = EntryLimits;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z
  .object({
    userId: z.string().min(1).optional(),
    workTypeId: z.string().min(1),
    from: ymd,
    to: ymd,
    halfDay: z.boolean().optional().default(false),
    note: z.string().max(500).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Von-Datum muss vor Bis-Datum liegen',
        path: ['to'],
      });
    }
  });

const entryInclude = {
  workType: { select: { id: true, label: true, billable: true } },
  user: { select: { id: true, firstName: true, lastName: true, weeklyHours: true } },
};

router.use(requireAuth);

/** Official ZH public holidays (Saniga AG / Hinwil). */
router.get('/holidays', async (req, res) => {
  const yearParam = req.query.year != null ? Number(req.query.year) : null;
  const years =
    yearParam && Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? [yearParam]
      : holidayYearsAround();
  const holidays = years.flatMap((y) =>
    zhHolidaysAll(y).map((h) => ({ ...h, year: y, canton: 'ZH' }))
  );
  res.json({ canton: 'ZH', years, holidays });
});

/** List absence groups for current user, or ?userId= for admin. */
router.get('/', async (req, res) => {
  let userId = req.user.id;
  if (req.query.userId) {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin-Rechte erforderlich' });
    }
    userId = String(req.query.userId);
  }

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      OR: [{ workType: { billable: false } }, { absenceGroupId: { not: null } }],
    },
    include: entryInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  const absences = entries.filter((e) => e.workType && e.workType.billable === false);
  const groups = groupAbsenceEntries(absences);
  res.json({ groups });
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  let targetUserId = req.user.id;
  if (body.userId && body.userId !== req.user.id) {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin-Rechte erforderlich' });
    }
    targetUserId = body.userId;
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) {
    return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  }

  const wt = await prisma.workType.findFirst({
    where: { id: body.workTypeId, active: true, billable: false },
  });
  if (!wt) {
    return res.status(400).json({ error: 'Bitte eine gültige Absenz-Art wählen' });
  }
  if (!ABSENCE_WORK_TYPE_LABELS.includes(wt.label)) {
    return res.status(400).json({ error: 'Ungültige Absenz-Art' });
  }

  const dates = weekdaysInRange(body.from, body.to);
  if (!dates.length) {
    return res.status(400).json({
      error: 'Im gewählten Zeitraum liegt kein Werktag (Mo–Fr)',
    });
  }

  const hoursPerDay = dailyHoursFromWeekly(user.weeklyHours, body.halfDay);
  if (!(hoursPerDay > 0) || hoursPerDay > ENTRY_HOURS_MAX) {
    return res.status(400).json({ error: 'Ungültige Tagesstunden für Absenz' });
  }

  // Block if any weekday already exceeds remaining capacity
  for (const date of dates) {
    const existing = await prisma.timeEntry.findMany({ where: { userId: targetUserId, date } });
    const otherSum = existing.reduce((s, e) => s + entryHoursValue(e), 0);
    if (round1(otherSum + hoursPerDay) > ENTRY_HOURS_MAX) {
      return res.status(409).json({
        error: `Am ${date} wären mehr als ${ENTRY_HOURS_MAX} Stunden erfasst`,
      });
    }
  }

  const groupId = crypto.randomBytes(16).toString('hex');
  const note = (body.note || '').trim();
  const toMinutes = minutesFromHours(hoursPerDay);

  const created = await prisma.$transaction(
    dates.map((date) =>
      prisma.timeEntry.create({
        data: {
          userId: targetUserId,
          date,
          fromMinutes: 0,
          toMinutes,
          breakMinutes: 0,
          hours: hoursPerDay,
          note,
          siteId: null,
          workTypeId: wt.id,
          absenceGroupId: groupId,
        },
        include: entryInclude,
      })
    )
  );

  const totalHours = Math.round(created.length * hoursPerDay * 100) / 100;
  res.status(201).json({
    groupId,
    days: created.length,
    hours: totalHours,
    halfDay: !!body.halfDay,
    from: body.from,
    to: body.to,
    workType: { id: wt.id, label: wt.label },
    entries: created.map((e) => ({
      id: e.id,
      date: e.date,
      hours: Number(e.hours),
      absenceGroupId: e.absenceGroupId,
    })),
  });
});

/** Admin month matrix helper. */
router.get('/summary', requireAdmin, async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Monat im Format YYYY-MM erforderlich' });
  }
  const entries = await prisma.timeEntry.findMany({
    where: {
      date: { startsWith: month },
      workType: { billable: false },
    },
    include: {
      workType: { select: { id: true, label: true, billable: true } },
      user: { select: { id: true, firstName: true, lastName: true, isTimeTracked: true } },
    },
  });
  res.json({
    month,
    entries: entries.map((e) => ({
      userId: e.userId,
      workTypeId: e.workTypeId,
      workTypeLabel: e.workType?.label,
      date: e.date,
      hours: e.hours == null ? null : Number(e.hours),
      absenceGroupId: e.absenceGroupId,
    })),
  });
});

router.delete('/:groupId', async (req, res) => {
  const groupId = req.params.groupId;
  if (!groupId) {
    return res.status(400).json({ error: 'Gruppen-ID fehlt' });
  }

  // Prefer real absence groups; fall back to single legacy entry id
  let entries = await prisma.timeEntry.findMany({
    where: { absenceGroupId: groupId },
    include: { invoice: { select: { cancelledAt: true } }, workType: true },
  });

  if (!entries.length) {
    const one = await prisma.timeEntry.findUnique({
      where: { id: groupId },
      include: { invoice: { select: { cancelledAt: true } }, workType: true },
    });
    if (one && one.workType && one.workType.billable === false) {
      entries = [one];
    }
  }

  if (!entries.length) {
    return res.status(404).json({ error: 'Absenz nicht gefunden' });
  }

  if (req.user.role !== 'ADMIN') {
    if (entries.some((e) => e.userId !== req.user.id)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
  }

  if (entries.some((e) => e.invoice && !e.invoice.cancelledAt)) {
    return res.status(409).json({ error: 'Absenz ist verrechnet und kann nicht gelöscht werden' });
  }

  const ids = entries.map((e) => e.id);
  await prisma.timeEntry.deleteMany({ where: { id: { in: ids } } });
  res.json({ deleted: ids.length, groupId });
});

module.exports = router;
