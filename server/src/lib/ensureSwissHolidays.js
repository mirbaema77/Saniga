const crypto = require('crypto');
const { ensureAbsenceWorkTypes } = require('./absenceWorkTypes');
const { dailyHoursFromWeekly, minutesFromHours } = require('./absenceExpand');
const { zhHolidaysWeekdays, holidayYearsAround } = require('./swissHolidays');
const EntryLimits = require('../../public/entry-limits');

const { ENTRY_HOURS_MAX, entryHoursValue, round1 } = EntryLimits;

/**
 * Idempotently create Feiertag absences for ZH official holidays.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userIds?: string[], years?: number[] }} [opts]
 */
async function ensureSwissHolidays(prisma, opts = {}) {
  await ensureAbsenceWorkTypes(prisma);
  const feiertag = await prisma.workType.findFirst({
    where: { label: 'Feiertag', billable: false, active: true },
  });
  if (!feiertag) {
    return { created: 0, skipped: 0, holidays: [] };
  }

  const years = opts.years || holidayYearsAround();
  const holidays = years.flatMap((y) => zhHolidaysWeekdays(y));

  let users;
  if (opts.userIds?.length) {
    users = await prisma.user.findMany({
      where: { id: { in: opts.userIds }, isTimeTracked: true },
      select: { id: true, weeklyHours: true },
    });
  } else {
    users = await prisma.user.findMany({
      where: { isTimeTracked: true },
      select: { id: true, weeklyHours: true },
    });
  }

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const hoursPerDay = dailyHoursFromWeekly(user.weeklyHours, false);
    if (!(hoursPerDay > 0) || hoursPerDay > ENTRY_HOURS_MAX) {
      skipped += holidays.length;
      continue;
    }
    const toMinutes = minutesFromHours(hoursPerDay);

    for (const h of holidays) {
      const existingFeiertag = await prisma.timeEntry.findFirst({
        where: {
          userId: user.id,
          date: h.date,
          workTypeId: feiertag.id,
        },
        select: { id: true },
      });
      if (existingFeiertag) {
        skipped += 1;
        continue;
      }

      const existing = await prisma.timeEntry.findMany({
        where: { userId: user.id, date: h.date },
      });
      const otherSum = existing.reduce((s, e) => s + entryHoursValue(e), 0);
      if (round1(otherSum + hoursPerDay) > ENTRY_HOURS_MAX) {
        skipped += 1;
        continue;
      }

      const groupId = crypto.randomBytes(16).toString('hex');
      await prisma.timeEntry.create({
        data: {
          userId: user.id,
          date: h.date,
          fromMinutes: 0,
          toMinutes,
          breakMinutes: 0,
          hours: hoursPerDay,
          note: h.name,
          siteId: null,
          workTypeId: feiertag.id,
          absenceGroupId: groupId,
        },
      });
      created += 1;
    }
  }

  return { created, skipped, holidays, years, users: users.length };
}

module.exports = { ensureSwissHolidays };
