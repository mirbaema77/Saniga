/**
 * Asserts Stunden and Lohnkosten use the same tracked users and month period.
 * Usage: node scripts/test-dashboard-lohnkosten.js
 */
const { monthHoursAndLaborCost } = require('../src/lib/dashboardStats');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const month = '2026-10';
  const users = [
    { id: 'u1', hourlyRate: 40, isTimeTracked: true },
    { id: 'u2', hourlyRate: 70, isTimeTracked: true },
    { id: 'u3', hourlyRate: 100, isTimeTracked: false },
  ];
  const entries = [
    { userId: 'u1', date: '2026-10-01', hours: 10 },
    { userId: 'u1', date: '2026-10-02', hours: 5 },
    { userId: 'u2', date: '2026-10-03', hours: 8 },
    { userId: 'u2', date: '2026-09-30', hours: 99 }, // other month
    { userId: 'u3', date: '2026-10-04', hours: 20 }, // not tracked
  ];

  const stats = monthHoursAndLaborCost(entries, users, month);

  // Expected: u1 15h + u2 8h = 23h; cost = 15*40 + 8*70 = 600 + 560 = 1160
  assert(Math.abs(stats.totalHours - 23) < 1e-9, `hours expected 23, got ${stats.totalHours}`);
  assert(Math.abs(stats.laborCost - 1160) < 1e-9, `cost expected 1160, got ${stats.laborCost}`);

  // Consistency: recompute from per-user hours × rate
  let reconHours = 0;
  let reconCost = 0;
  for (const u of users.filter((x) => x.isTimeTracked !== false)) {
    const h = entries
      .filter((e) => e.userId === u.id && e.date.startsWith(month))
      .reduce((s, e) => s + Number(e.hours), 0);
    reconHours += h;
    reconCost += h * Number(u.hourlyRate);
  }
  assert(Math.abs(reconHours - stats.totalHours) < 1e-9, 'hours card inconsistent with per-user sum');
  assert(Math.abs(reconCost - stats.laborCost) < 1e-9, 'Lohnkosten inconsistent with hours × rates');

  console.log('PASS: Stunden and Lohnkosten consistent for tracked users');
  console.log(`  hours=${stats.totalHours} cost=${stats.laborCost}`);
}

main();
