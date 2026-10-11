require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { buildHoursExportRows, rowsToCsv } = require('../src/lib/hoursExport');

const prisma = new PrismaClient();

async function main() {
  const month = '2026-10';
  const users = await prisma.user.findMany({
    where: { isTimeTracked: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  const entries = await prisma.timeEntry.findMany({
    where: { date: { startsWith: month } },
    select: {
      userId: true,
      date: true,
      hours: true,
      fromMinutes: true,
      toMinutes: true,
      breakMinutes: true,
      workType: { select: { billable: true } },
    },
  });
  const { rows } = buildHoursExportRows(users, entries, month);
  const csv = rowsToCsv(rows);
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
  console.log(lines.slice(0, 3).join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
