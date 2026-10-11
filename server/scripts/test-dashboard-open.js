/**
 * Open-dashboard: cancelled invoice entries count as open again;
 * non-billable work types never count.
 * Usage: node scripts/test-dashboard-open.js
 */
const { PrismaClient } = require('@prisma/client');
const { computeOpenDashboard } = require('../src/lib/dashboardOpen');
const { ymdToUtcDate } = require('../src/lib/rate');

const prisma = new PrismaClient();
const PREFIX = `dash_open_${Date.now()}_`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const ids = {
    customerIds: [],
    siteIds: [],
    workTypeIds: [],
    userIds: [],
    entryIds: [],
    invoiceIds: [],
    rateIds: [],
  };

  try {
    const customer = await prisma.customer.create({
      data: { name: `${PREFIX}Kunde` },
    });
    ids.customerIds.push(customer.id);

    const site = await prisma.site.create({
      data: { customerId: customer.id, label: `${PREFIX}Objekt` },
    });
    ids.siteIds.push(site.id);

    const wtBillable = await prisma.workType.create({
      data: { label: `${PREFIX}Montage`, billable: true },
    });
    const wtAbsence = await prisma.workType.create({
      data: { label: `${PREFIX}Ferien`, billable: false },
    });
    ids.workTypeIds.push(wtBillable.id, wtAbsence.id);

    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}@test.local`,
        passwordHash: 'x',
        role: 'EMPLOYEE',
        firstName: 'Open',
        lastName: 'Dash',
        hourlyRate: 35,
      },
    });
    ids.userIds.push(user.id);

    const rate = await prisma.rate.create({
      data: {
        customerId: customer.id,
        workTypeId: null,
        userId: null,
        chfPerHour: 70,
        validFrom: ymdToUtcDate('2020-01-01'),
        validTo: null,
      },
    });
    ids.rateIds.push(rate.id);

    const billableEntry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: wtBillable.id,
        date: '2026-09-01',
        fromMinutes: 7 * 60,
        toMinutes: 15 * 60,
        breakMinutes: 0,
        hours: 8,
        note: 'open-after-cancel',
      },
    });
    ids.entryIds.push(billableEntry.id);

    const absenceEntry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: wtAbsence.id,
        date: '2026-09-02',
        fromMinutes: 7 * 60,
        toMinutes: 15 * 60,
        breakMinutes: 0,
        hours: 8,
        note: 'absence',
      },
    });
    ids.entryIds.push(absenceEntry.id);

    const invoice = await prisma.invoice.create({
      data: {
        number: `${PREFIX}1/2026`,
        customerId: customer.id,
        siteId: site.id,
        issueDate: ymdToUtcDate('2026-09-01'),
        periodFrom: ymdToUtcDate('2026-09-01'),
        periodTo: ymdToUtcDate('2026-09-01'),
        vatRate: 8.1,
      },
    });
    ids.invoiceIds.push(invoice.id);

    await prisma.timeEntry.update({
      where: { id: billableEntry.id },
      data: { invoiceId: invoice.id },
    });

    const rates = await prisma.rate.findMany();
    const include = {
      user: { select: { id: true, firstName: true, lastName: true } },
      workType: { select: { id: true, label: true, billable: true } },
      site: { include: { customer: { select: { id: true, name: true } } } },
    };

    let rows = await prisma.timeEntry.findMany({
      where: { id: { in: [billableEntry.id, absenceEntry.id] } },
      include,
    });
    let stats = computeOpenDashboard(rows, rates, '2026-10-11');
    assert(stats.totalHours === 0, `invoiced billable must not be open (got hours=${stats.totalHours})`);
    assert(stats.totalAmount === 0, 'invoiced amount must be 0');

    // Cancel: unlink entries (same as POST /invoices/:id/cancel)
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { cancelledAt: new Date(), cancelledReason: 'Test' },
      });
      await tx.timeEntry.updateMany({
        where: { invoiceId: invoice.id },
        data: { invoiceId: null },
      });
    });

    rows = await prisma.timeEntry.findMany({
      where: { id: { in: [billableEntry.id, absenceEntry.id] } },
      include,
    });
    stats = computeOpenDashboard(rows, rates, '2026-10-11');

    assert(
      Math.abs(stats.totalHours - 8) < 1e-9,
      `after cancel, billable 8h open (got ${stats.totalHours})`
    );
    assert(
      Math.abs(stats.totalAmount - 560) < 1e-9,
      `after cancel, amount 560 (got ${stats.totalAmount})`
    );
    assert(stats.sites.length === 1, 'one site row');
    assert(stats.sites[0].oldestDate === '2026-09-01', 'oldest is billable date');
    assert(
      !rows.filter((e) => e.workTypeId === wtAbsence.id).every((e) => e.invoiceId === null) ||
        stats.totalHours === 8,
      'absence hours must not inflate total'
    );

    // Pure unit: non-billable alone never counts
    const absenceOnly = rows.filter((e) => e.id === absenceEntry.id);
    const absStats = computeOpenDashboard(absenceOnly, rates, '2026-10-11');
    assert(absStats.totalHours === 0, 'non-billable alone: hours 0');
    assert(absStats.totalAmount === 0, 'non-billable alone: amount 0');
    assert(absStats.sites.length === 0, 'non-billable alone: no site rows');

    console.log('PASS: cancelled invoice reopens; non-billable excluded');
    console.log(`  hours=${stats.totalHours} amount=${stats.totalAmount} ageDays=${stats.sites[0].ageDays}`);
  } finally {
    if (ids.invoiceIds.length) {
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids.invoiceIds } } });
      await prisma.timeEntry.updateMany({
        where: { invoiceId: { in: ids.invoiceIds } },
        data: { invoiceId: null },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: ids.invoiceIds } } });
    }
    if (ids.entryIds.length) {
      await prisma.timeEntry.deleteMany({ where: { id: { in: ids.entryIds } } });
    }
    if (ids.rateIds.length) {
      await prisma.rate.deleteMany({ where: { id: { in: ids.rateIds } } });
    }
    if (ids.siteIds.length) {
      await prisma.site.deleteMany({ where: { id: { in: ids.siteIds } } });
    }
    if (ids.customerIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: ids.customerIds } } });
    }
    if (ids.workTypeIds.length) {
      await prisma.workType.deleteMany({ where: { id: { in: ids.workTypeIds } } });
    }
    if (ids.userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
