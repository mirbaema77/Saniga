/**
 * Absence spanning Mon–Sun creates 5 weekday entries; deleting the group removes all.
 * Usage: node scripts/test-absence-group.js
 */
require('dotenv').config();

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/password');
const { ensureAbsenceWorkTypes } = require('../src/lib/absenceWorkTypes');
const {
  weekdaysInRange,
  dailyHoursFromWeekly,
  minutesFromHours,
} = require('../src/lib/absenceExpand');

const prisma = new PrismaClient();
const TAG = `abs-grp-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await ensureAbsenceWorkTypes(prisma);
  const ferien = await prisma.workType.findFirst({ where: { label: 'Ferien', billable: false } });
  assert(ferien, 'Ferien work type missing');

  const weekdays = weekdaysInRange('2026-07-06', '2026-07-12'); // Mon–Sun
  assert(weekdays.length === 5, `expected 5 weekdays, got ${weekdays.length}: ${weekdays.join(',')}`);

  const passwordHash = await hashPassword('TestPass123456');
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@test.local`,
      passwordHash,
      role: 'EMPLOYEE',
      firstName: 'Abs',
      lastName: 'Group',
      weeklyHours: 45,
      hourlyRate: 35,
      isTimeTracked: true,
    },
  });

  try {
    const hoursPerDay = dailyHoursFromWeekly(user.weeklyHours, false);
    assert(hoursPerDay === 9, `daily hours 9, got ${hoursPerDay}`);
    const groupId = crypto.randomBytes(16).toString('hex');
    const toMinutes = minutesFromHours(hoursPerDay);

    await prisma.$transaction(
      weekdays.map((date) =>
        prisma.timeEntry.create({
          data: {
            userId: user.id,
            date,
            fromMinutes: 0,
            toMinutes,
            breakMinutes: 0,
            hours: hoursPerDay,
            note: 'Sommerferien',
            siteId: null,
            workTypeId: ferien.id,
            absenceGroupId: groupId,
          },
        })
      )
    );

    const rows = await prisma.timeEntry.findMany({
      where: { absenceGroupId: groupId },
      orderBy: { date: 'asc' },
    });
    assert(rows.length === 5, `db rows 5, got ${rows.length}`);
    assert(
      rows.every((r) => Number(r.hours) === 9),
      'each day 9h (45/5)'
    );
    assert(
      rows.every((r) => r.siteId == null && r.workTypeId === ferien.id),
      'absence attrs'
    );

    const totalHours = Math.round(rows.length * hoursPerDay * 100) / 100;
    assert(totalHours === 45, `total hours 45, got ${totalHours}`);

    // Same delete semantics as DELETE /api/absences/:groupId
    const del = await prisma.timeEntry.deleteMany({ where: { absenceGroupId: groupId } });
    assert(del.count === 5, `deleted 5, got ${del.count}`);
    const left = await prisma.timeEntry.count({ where: { absenceGroupId: groupId } });
    assert(left === 0, 'all group entries removed');

    console.log('PASS: absence week expands to 5 entries; group delete removes all');
    console.log(`  days=5 hours=45 groupId=${groupId}`);
  } finally {
    await prisma.timeEntry.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
