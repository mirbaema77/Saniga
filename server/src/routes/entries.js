const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const IsoWeek = require('../../public/iso-week');
const EntryLimits = require('../../public/entry-limits');

const router = express.Router();

const {
  ENTRY_HOURS_MIN,
  ENTRY_HOURS_MAX,
  DAILY_HOURS_WARN,
  validateEntryHours,
  validateEntryDate,
  entryHoursValue,
  formatHoursDe,
  round1,
} = EntryLimits;

const INVOICED_LOCKED_MSG = 'Eintrag ist auf einer Rechnung und kann nicht geändert werden';
const SITE_REQUIRED_MSG = 'Für verrechenbare Arbeit ist ein Objekt erforderlich.';
const WORK_TYPE_REQUIRED_MSG = 'Bitte eine Arbeitsart wählen.';

const entryBody = z.object({
  userId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  toMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  note: z.string().max(500).optional().default(''),
  siteId: z.string().min(1).optional().nullable(),
  workTypeId: z.string().min(1),
  hours: z.coerce.number().min(ENTRY_HOURS_MIN).max(ENTRY_HOURS_MAX).optional().nullable(),
  confirmDailyTotal: z.boolean().optional(),
});

const entryListInclude = {
  invoice: { select: { id: true, number: true, cancelledAt: true } },
  workType: { select: { id: true, label: true, billable: true } },
};

function activeInvoice(invoice) {
  if (!invoice || invoice.cancelledAt) return null;
  return invoice;
}

function toEntryDto(e) {
  const inv = activeInvoice(e.invoice);
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
    invoiceId: inv ? inv.id : null,
    invoiceNumber: inv ? inv.number : null,
    billable: e.workType ? !!e.workType.billable : true,
    workTypeLabel: e.workType?.label || null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function minutesFromHours(hours) {
  return Math.round(Number(hours) * 60);
}

async function loadEntry(id) {
  return prisma.timeEntry.findUnique({
    where: { id },
    include: entryListInclude,
  });
}

function assertNotInvoiced(entry) {
  const inv = activeInvoice(entry.invoice);
  if (inv) {
    const err = new Error(`${INVOICED_LOCKED_MSG} (${inv.number})`);
    err.status = 409;
    err.code = 'INVOICED';
    throw err;
  }
}

async function resolveSiteForWorkType(workTypeId, siteId) {
  if (!workTypeId) {
    return { error: WORK_TYPE_REQUIRED_MSG };
  }
  const wt = await prisma.workType.findFirst({ where: { id: workTypeId, active: true } });
  if (!wt) {
    return { error: 'Ungültige Arbeitsart' };
  }
  if (wt.billable) {
    if (!siteId) {
      return { error: SITE_REQUIRED_MSG };
    }
    const site = await prisma.site.findFirst({ where: { id: siteId, active: true } });
    if (!site) {
      return { error: 'Ungültiges Objekt' };
    }
    return { workType: wt, siteId };
  }
  return { workType: wt, siteId: null };
}

function resolveHours(body) {
  if (body.hours != null) {
    const checked = validateEntryHours(body.hours);
    if (!checked.ok) return { error: checked.error };
    return {
      hours: checked.hours,
      fromMinutes: 0,
      toMinutes: minutesFromHours(checked.hours),
      breakMinutes: 0,
      hasHours: true,
    };
  }
  if (body.fromMinutes == null || body.toMinutes == null) {
    return { error: 'Stunden oder Von/Bis erforderlich' };
  }
  const net = body.toMinutes - body.fromMinutes - (body.breakMinutes ?? 0);
  if (net <= 0) {
    return { error: 'Nettoarbeitszeit muss positiv sein' };
  }
  const hours = net / 60;
  const checked = validateEntryHours(hours);
  if (!checked.ok) return { error: checked.error };
  return {
    hours: null,
    fromMinutes: body.fromMinutes,
    toMinutes: body.toMinutes,
    breakMinutes: body.breakMinutes ?? 0,
    hasHours: false,
    hoursForTotal: checked.hours,
  };
}

async function checkDailyTotal({ userId, date, addHours, excludeEntryId, confirmDailyTotal }) {
  const others = await prisma.timeEntry.findMany({
    where: {
      userId,
      date,
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    },
  });
  const otherSum = others.reduce((s, e) => s + entryHoursValue(e), 0);
  const dailyTotal = round1(otherSum + Number(addHours));
  if (dailyTotal > DAILY_HOURS_WARN && !confirmDailyTotal) {
    return {
      blocked: true,
      dailyTotal,
      error: `Tages-Total wäre ${formatHoursDe(dailyTotal)} Stunden. Bitte bestätigen.`,
      code: 'DAILY_TOTAL',
    };
  }
  return { blocked: false, dailyTotal };
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
    include: entryListInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ entries: entries.map(toEntryDto) });
});

router.post('/', async (req, res) => {
  const parsed = entryBody.safeParse(req.body);
  if (!parsed.success) {
    const hoursIssue = parsed.error.issues.find((i) => i.path[0] === 'hours');
    if (hoursIssue) {
      return res.status(400).json({
        error: `Stunden müssen zwischen ${formatHoursDe(ENTRY_HOURS_MIN)} und ${ENTRY_HOURS_MAX} liegen.`,
      });
    }
    return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  let targetUserId = req.user.id;

  if (body.userId && body.userId !== req.user.id) {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target) return res.status(400).json({ error: 'Ungültiger Mitarbeiter' });
    targetUserId = body.userId;
  }

  const dateCheck = validateEntryDate(body.date, {
    todayYmd: IsoWeek.zonedYmd(new Date()),
    isAdmin: req.user.role === 'ADMIN',
  });
  if (!dateCheck.ok) {
    return res.status(400).json({ error: dateCheck.error });
  }

  const resolved = await resolveSiteForWorkType(body.workTypeId, body.siteId || null);
  if (resolved.error) {
    return res.status(400).json({ error: resolved.error });
  }

  const hoursRes = resolveHours(body);
  if (hoursRes.error) {
    return res.status(400).json({ error: hoursRes.error });
  }
  const addHours = hoursRes.hasHours ? hoursRes.hours : hoursRes.hoursForTotal;

  const daily = await checkDailyTotal({
    userId: targetUserId,
    date: body.date,
    addHours,
    confirmDailyTotal: !!body.confirmDailyTotal,
  });
  if (daily.blocked) {
    return res.status(409).json({
      error: daily.error,
      code: daily.code,
      dailyTotal: daily.dailyTotal,
      threshold: DAILY_HOURS_WARN,
    });
  }

  const created = await prisma.timeEntry.create({
    data: {
      userId: targetUserId,
      date: body.date,
      fromMinutes: hoursRes.fromMinutes,
      toMinutes: hoursRes.toMinutes,
      breakMinutes: hoursRes.breakMinutes,
      note: body.note || '',
      siteId: resolved.siteId,
      workTypeId: body.workTypeId,
      hours: hoursRes.hasHours ? hoursRes.hours : null,
    },
  });
  const entry = await loadEntry(created.id);
  res.status(201).json({ entry: toEntryDto(entry) });
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await loadEntry(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    if (req.user.role !== 'ADMIN' && existing.userId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    assertNotInvoiced(existing);

    const parsed = entryBody
      .partial()
      .extend({
        workTypeId: z.string().min(1).optional(),
        confirmDailyTotal: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const hoursIssue = parsed.error.issues.find((i) => i.path[0] === 'hours');
      if (hoursIssue) {
        return res.status(400).json({
          error: `Stunden müssen zwischen ${formatHoursDe(ENTRY_HOURS_MIN)} und ${ENTRY_HOURS_MAX} liegen.`,
        });
      }
      return res.status(400).json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const data = {};

    if (body.date !== undefined) data.date = body.date;
    if (body.note !== undefined) data.note = body.note;

    if (body.userId !== undefined && req.user.role === 'ADMIN') {
      const target = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!target) return res.status(400).json({ error: 'Ungültiger Mitarbeiter' });
      data.userId = body.userId;
    }

    const nextDate = body.date !== undefined ? body.date : existing.date;
    const dateCheck = validateEntryDate(nextDate, {
      todayYmd: IsoWeek.zonedYmd(new Date()),
      isAdmin: req.user.role === 'ADMIN',
    });
    if (!dateCheck.ok) {
      return res.status(400).json({ error: dateCheck.error });
    }

    const nextWorkTypeId = body.workTypeId !== undefined ? body.workTypeId : existing.workTypeId;
    const nextSiteId = body.siteId !== undefined ? body.siteId : existing.siteId;
    if (!nextWorkTypeId) {
      return res.status(400).json({ error: WORK_TYPE_REQUIRED_MSG });
    }
    const resolved = await resolveSiteForWorkType(nextWorkTypeId, nextSiteId || null);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    data.workTypeId = nextWorkTypeId;
    data.siteId = resolved.siteId;

    let addHours;
    if (body.hours !== undefined && body.hours != null) {
      const hoursRes = resolveHours({ hours: body.hours });
      if (hoursRes.error) return res.status(400).json({ error: hoursRes.error });
      data.hours = hoursRes.hours;
      data.fromMinutes = hoursRes.fromMinutes;
      data.toMinutes = hoursRes.toMinutes;
      data.breakMinutes = hoursRes.breakMinutes;
      addHours = hoursRes.hours;
    } else if (
      body.fromMinutes !== undefined ||
      body.toMinutes !== undefined ||
      body.breakMinutes !== undefined
    ) {
      const hoursRes = resolveHours({
        fromMinutes: body.fromMinutes ?? existing.fromMinutes,
        toMinutes: body.toMinutes ?? existing.toMinutes,
        breakMinutes: body.breakMinutes ?? existing.breakMinutes,
      });
      if (hoursRes.error) return res.status(400).json({ error: hoursRes.error });
      data.fromMinutes = hoursRes.fromMinutes;
      data.toMinutes = hoursRes.toMinutes;
      data.breakMinutes = hoursRes.breakMinutes;
      addHours = hoursRes.hoursForTotal;
    } else {
      addHours = entryHoursValue(existing);
    }

    const targetUserId = data.userId || existing.userId;
    const daily = await checkDailyTotal({
      userId: targetUserId,
      date: nextDate,
      addHours,
      excludeEntryId: existing.id,
      confirmDailyTotal: !!body.confirmDailyTotal,
    });
    if (daily.blocked) {
      return res.status(409).json({
        error: daily.error,
        code: daily.code,
        dailyTotal: daily.dailyTotal,
        threshold: DAILY_HOURS_WARN,
      });
    }

    await prisma.timeEntry.update({
      where: { id: existing.id },
      data,
    });
    const entry = await loadEntry(existing.id);
    res.json({ entry: toEntryDto(entry) });
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await loadEntry(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    if (req.user.role !== 'ADMIN' && existing.userId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    assertNotInvoiced(existing);
    await prisma.timeEntry.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }
});

module.exports = router;
module.exports.SITE_REQUIRED_MSG = SITE_REQUIRED_MSG;
module.exports.ENTRY_HOURS_MIN = ENTRY_HOURS_MIN;
module.exports.ENTRY_HOURS_MAX = ENTRY_HOURS_MAX;
module.exports.DAILY_HOURS_WARN = DAILY_HOURS_WARN;
