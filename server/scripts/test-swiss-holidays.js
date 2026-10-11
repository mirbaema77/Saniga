/**
 * Verify ZH holiday dates + idempotent Feiertag seeding.
 * Usage: node scripts/test-swiss-holidays.js
 */
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/password');
const { easterSunday, zhHolidaysAll, zhHolidaysWeekdays } = require('../src/lib/swissHolidays');
const { ensureSwissHolidays } = require('../src/lib/ensureSwissHolidays');

const prisma = new PrismaClient();
const TAG = `hol-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const e2026 = easterSunday(2026);
  assert(e2026.month === 4 && e2026.day === 5, `Easter 2026 should be Apr 5, got ${e2026.month}-${e2026.day}`);

  const all2026 = zhHolidaysAll(2026);
  const byName = Object.fromEntries(all2026.map((h) => [h.name, h.date]));
  assert(byName.Neujahr === '2026-01-01', 'Neujahr');
  assert(byName.Berchtoldstag === '2026-01-02', 'Berchtoldstag');
  assert(byName.Karfreitag === '2026-04-03', 'Karfreitag');
  assert(byName.Ostermontag === '2026-04-06', 'Ostermontag');
  assert(byName['Tag der Arbeit'] === '2026-05-01', 'Tag der Arbeit');
  assert(byName.Auffahrt === '2026-05-14', 'Auffahrt');
  assert(byName.Pfingstmontag === '2026-05-25', 'Pfingstmontag');
  assert(byName.Bundesfeiertag === '2026-08-01', 'Bundesfeiertag');
  assert(byName.Weihnachtstag === '2026-12-25', 'Weihnachtstag');
  assert(byName.Stephanstag === '2026-12-26', 'Stephanstag');

  const weekdays = zhHolidaysWeekdays(2026);
  // 2026: Bundesfeiertag Sat, Stephanstag Sat → weekday count = 8
  assert(weekdays.length === 8, `expected 8 weekday holidays in 2026, got ${weekdays.length}`);

  const passwordHash = await hashPassword('TestPass123456');
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@test.local`,
      passwordHash,
      role: 'EMPLOYEE',
      firstName: 'Feiertag',
      lastName: 'Test',
      weeklyHours: 45,
      hourlyRate: 35,
      isTimeTracked: true,
    },
  });

  try {
    const r1 = await ensureSwissHolidays(prisma, { userIds: [user.id], years: [2026] });
    assert(r1.created === 8, `first seed created 8, got ${r1.created}`);

    const r2 = await ensureSwissHolidays(prisma, { userIds: [user.id], years: [2026] });
    assert(r2.created === 0, `idempotent: created 0, got ${r2.created}`);
    assert(r2.skipped === 8, `idempotent: skipped 8, got ${r2.skipped}`);

    const rows = await prisma.timeEntry.findMany({
      where: { userId: user.id },
      include: { workType: true },
      orderBy: { date: 'asc' },
    });
    assert(rows.length === 8, `db rows 8, got ${rows.length}`);
    assert(rows.every((r) => r.workType?.label === 'Feiertag'), 'all Feiertag');
    assert(rows.every((r) => Number(r.hours) === 9), 'all 9h');
    assert(rows.some((r) => r.note === 'Karfreitag' && r.date === '2026-04-03'), 'Karfreitag note');

    console.log('OK swiss holidays');
  } finally {
    await prisma.timeEntry.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
