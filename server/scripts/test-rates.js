/**
 * Server-side tests for Rate specificity, historisation, 409 missing rate,
 * and frozen InvoiceLine after rate change.
 */
const { PrismaClient } = require('@prisma/client');
const {
  pickRate,
  buildFrozenLines,
  MissingRateError,
  ymdToUtcDate,
  createRateClosingPrevious,
  groupFrozenLines,
} = require('../src/lib/rate');
const { buildInvoiceView, totalsFromLines } = require('../src/lib/invoiceMath');

const prisma = new PrismaClient();
const PREFIX = `rate_test_${Date.now()}_`;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

async function cleanup(ids) {
  if (ids.invoiceIds?.length) {
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids.invoiceIds } } });
    await prisma.timeEntry.updateMany({
      where: { invoiceId: { in: ids.invoiceIds } },
      data: { invoiceId: null },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: ids.invoiceIds } } });
  }
  if (ids.entryIds?.length) {
    await prisma.timeEntry.deleteMany({ where: { id: { in: ids.entryIds } } });
  }
  if (ids.rateIds?.length) {
    await prisma.rate.deleteMany({ where: { id: { in: ids.rateIds } } });
  }
  if (ids.siteIds?.length) {
    await prisma.site.deleteMany({ where: { id: { in: ids.siteIds } } });
  }
  if (ids.customerIds?.length) {
    await prisma.customer.deleteMany({ where: { id: { in: ids.customerIds } } });
  }
  if (ids.workTypeIds?.length) {
    await prisma.workType.deleteMany({ where: { id: { in: ids.workTypeIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

async function testSpecificity() {
  console.log('\n1) Specificity: customer+workType over customer alone');
  const rates = [
    {
      id: 'r1',
      customerId: 'c1',
      workTypeId: null,
      userId: null,
      chfPerHour: 80,
      validFrom: ymdToUtcDate('2020-01-01'),
      validTo: null,
    },
    {
      id: 'r2',
      customerId: 'c1',
      workTypeId: 'wt1',
      userId: null,
      chfPerHour: 95,
      validFrom: ymdToUtcDate('2020-01-01'),
      validTo: null,
    },
    {
      id: 'r0',
      customerId: null,
      workTypeId: null,
      userId: null,
      chfPerHour: 70,
      validFrom: ymdToUtcDate('2020-01-01'),
      validTo: null,
    },
  ];
  const picked = pickRate(
    rates,
    { customerId: 'c1', workTypeId: 'wt1', userId: 'u1' },
    '2026-06-15'
  );
  assert(picked?.id === 'r2', `picked customer+workType (got ${picked?.id}, chf=${picked?.chfPerHour})`);
  assert(Number(picked?.chfPerHour) === 95, 'rate is 95');
}

async function testJulyChangeLeavesJune() {
  console.log('\n2) Rate change on 1 July does not affect June invoice lines');
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

    const wt = await prisma.workType.create({
      data: { label: `${PREFIX}Montage`, billable: true },
    });
    ids.workTypeIds.push(wt.id);

    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}emp@test.local`,
        passwordHash: 'x',
        role: 'EMPLOYEE',
        firstName: 'Rate',
        lastName: 'Tester',
        hourlyRate: 35,
      },
    });
    ids.userIds.push(user.id);

    // Close global for this customer period by adding customer rate 70 until June, 90 from July
    const rJune = await prisma.rate.create({
      data: {
        customerId: customer.id,
        workTypeId: null,
        userId: null,
        chfPerHour: 70,
        validFrom: ymdToUtcDate('2020-01-01'),
        validTo: ymdToUtcDate('2026-06-30'),
      },
    });
    ids.rateIds.push(rJune.id);
    const rJuly = await prisma.rate.create({
      data: {
        customerId: customer.id,
        workTypeId: null,
        userId: null,
        chfPerHour: 90,
        validFrom: ymdToUtcDate('2026-07-01'),
        validTo: null,
      },
    });
    ids.rateIds.push(rJuly.id);

    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: wt.id,
        date: '2026-06-15',
        fromMinutes: 7 * 60,
        toMinutes: 15 * 60,
        breakMinutes: 0,
        hours: 8,
        note: 'june',
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        workType: { select: { id: true, label: true } },
      },
    });
    ids.entryIds.push(entry.id);

    const rates = await prisma.rate.findMany();
    const frozen = buildFrozenLines([entry], customer, rates);
    assert(frozen.length === 1, 'one frozen line');
    assert(frozen[0].chfPerHour === 70, `June line uses 70 (got ${frozen[0].chfPerHour})`);
    assert(frozen[0].total === 560, `June total 560 (got ${frozen[0].total})`);

    const inv = await prisma.invoice.create({
      data: {
        number: `${PREFIX}1/2026`,
        customerId: customer.id,
        siteId: site.id,
        issueDate: ymdToUtcDate('2026-06-15'),
        periodFrom: ymdToUtcDate('2026-06-15'),
        periodTo: ymdToUtcDate('2026-06-15'),
        vatRate: 8.1,
        lines: {
          create: frozen.map((l) => ({
            workTypeId: l.workTypeId,
            userId: l.userId,
            hours: l.hours,
            chfPerHour: l.chfPerHour,
            total: l.total,
          })),
        },
      },
      include: {
        lines: true,
        customer: true,
        site: true,
        entries: true,
      },
    });
    ids.invoiceIds.push(inv.id);
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { invoiceId: inv.id },
    });

    // Raise rate further after invoice
    const rAug = await createRateClosingPrevious({
      customerId: customer.id,
      workTypeId: null,
      userId: null,
      chfPerHour: 110,
      validFrom: '2026-08-01',
      validTo: null,
    });
    ids.rateIds.push(rAug.id);

    const fresh = await prisma.invoice.findUnique({
      where: { id: inv.id },
      include: {
        lines: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
            workType: { select: { id: true, label: true } },
          },
        },
        customer: true,
        site: true,
        entries: true,
      },
    });
    const view = buildInvoiceView(fresh, { vatRate: 8.1, name: 'Saniga AG', city: 'Hinwil', uid: 'CHE' });
    assert(view.lineItems[0].employees[0].chfPerHour === 70, 'frozen invoice still shows 70');
    assert(view.subtotal === 560, `frozen subtotal 560 (got ${view.subtotal})`);
  } finally {
    await cleanup(ids);
  }
}

async function testMissingRate409() {
  console.log('\n3) Missing rate throws MissingRateError (API maps to 409)');
  const rates = [
    // only a customer-specific rate for someone else — and no global
    {
      id: 'rx',
      customerId: 'other',
      workTypeId: null,
      userId: null,
      chfPerHour: 70,
      validFrom: ymdToUtcDate('2020-01-01'),
      validTo: null,
    },
  ];
  const entries = [
    {
      date: '2026-03-01',
      hours: 4,
      userId: 'u1',
      workTypeId: 'wt1',
      user: { firstName: 'A', lastName: 'B' },
      workType: { label: 'Rohr' },
    },
  ];
  let caught = null;
  try {
    buildFrozenLines(entries, { id: 'c-missing', name: 'FehlKunde AG' }, rates);
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof MissingRateError, 'MissingRateError thrown');
  assert(caught?.code === 'MISSING_RATE', 'code MISSING_RATE');
  assert(
    /Kein Ansatz für FehlKunde AG, Rohr, 2026-03-01/.test(caught?.message || ''),
    `message names customer/workType/date (got: ${caught?.message})`
  );
}

async function testFreezeAfterChange() {
  console.log('\n4) Invoice keeps frozen line rate after later rate change');
  const lines = [
    {
      workTypeId: 'w',
      userId: 'u',
      hours: 10,
      chfPerHour: 70,
      total: 700,
      workType: { label: 'Service' },
      user: { firstName: 'Max', lastName: 'Muster' },
    },
  ];
  const grouped = groupFrozenLines(lines);
  const totals = totalsFromLines(grouped, 8.1);
  assert(grouped[0].employees[0].chfPerHour === 70, 'line rate 70');
  assert(totals.subtotal === 700, 'subtotal 700');

  // Simulate "rate changed to 99" — view still built from frozen lines
  const view = buildInvoiceView(
    {
      number: '99/2026',
      vatRate: 8.1,
      issueDate: new Date('2026-01-01'),
      periodFrom: new Date('2026-01-01'),
      periodTo: new Date('2026-01-01'),
      customer: { name: 'X', paymentTermDays: 14 },
      site: { label: 'Y', objectNumber: '' },
      entries: [],
      lines,
    },
    { vatRate: 8.1, name: 'Saniga AG', city: 'Hinwil', uid: 'CHE' }
  );
  assert(view.lineItems[0].employees[0].chfPerHour === 70, 'view still 70 after hypothetical rate hike');
  assert(view.subtotal === 700, 'view subtotal unchanged');
}

async function main() {
  console.log('=== Rate / InvoiceLine tests ===');
  await testSpecificity();
  await testMissingRate409();
  await testFreezeAfterChange();
  await testJulyChangeLeavesJune();
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
