/**
 * Set Urim Gashi hourlyRate=70 and report October Lohnkosten.
 * Usage: node scripts/set-urim-rate-and-report-lohn.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { monthHoursAndLaborCost } = require('../src/lib/dashboardStats');

const prisma = new PrismaClient();

async function main() {
  const urim = await prisma.user.findFirst({
    where: {
      OR: [
        { firstName: 'Urim', lastName: 'Gashi' },
        { role: 'ADMIN' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!urim) {
    throw new Error('Admin/Urim not found');
  }

  const updated = await prisma.user.update({
    where: { id: urim.id },
    data: {
      hourlyRate: 70,
      weeklyHours: urim.weeklyHours > 0 ? urim.weeklyHours : 45,
      isTimeTracked: true,
    },
  });

  const users = await prisma.user.findMany({
    where: { isTimeTracked: true },
    select: { id: true, firstName: true, lastName: true, hourlyRate: true, isTimeTracked: true },
  });
  const entries = await prisma.timeEntry.findMany({
    where: { date: { startsWith: '2026-10' } },
    select: {
      userId: true,
      date: true,
      hours: true,
      fromMinutes: true,
      toMinutes: true,
      breakMinutes: true,
    },
  });

  const stats = monthHoursAndLaborCost(
    entries,
    users.map((u) => ({
      id: u.id,
      hourlyRate: Number(u.hourlyRate),
      isTimeTracked: u.isTimeTracked,
    })),
    '2026-10'
  );

  console.log(`Urim: ${updated.firstName} ${updated.lastName} rate=${Number(updated.hourlyRate)} isTimeTracked=${updated.isTimeTracked}`);
  console.log(`Oktober Stunden (tracked): ${stats.totalHours.toFixed(2)} h`);
  console.log(`Oktober Lohnkosten: CHF ${Math.round(stats.laborCost).toLocaleString('de-CH')}.–`);
  console.log(`  (raw=${stats.laborCost})`);
}

main()
  .catch((e) => {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
