/**
 * Asserts POST /api/invoices with workTypeId only links matching entries.
 * Usage: node scripts/test-invoice-worktype-filter.js
 */
require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { signToken } = require('../src/lib/jwt');
const { hashPassword } = require('../src/lib/password');
const invoicesRoutes = require('../src/routes/invoices');

const prisma = new PrismaClient();
const TAG = `wt-filter-${Date.now()}`;

async function cleanup(ids) {
  if (ids.invoiceId) {
    await prisma.timeEntry.updateMany({
      where: { invoiceId: ids.invoiceId },
      data: { invoiceId: null },
    });
    await prisma.invoice.delete({ where: { id: ids.invoiceId } }).catch(() => {});
  }
  if (ids.entryIds?.length) {
    await prisma.timeEntry.deleteMany({ where: { id: { in: ids.entryIds } } });
  }
  if (ids.siteId) await prisma.site.delete({ where: { id: ids.siteId } }).catch(() => {});
  if (ids.customerId) await prisma.customer.delete({ where: { id: ids.customerId } }).catch(() => {});
  if (ids.workTypeIds?.length) {
    await prisma.workType.deleteMany({ where: { id: { in: ids.workTypeIds } } });
  }
  if (ids.userId) await prisma.user.delete({ where: { id: ids.userId } }).catch(() => {});
}

async function main() {
  const ids = { entryIds: [], workTypeIds: [] };
  let server;

  try {
    const passwordHash = await hashPassword('TestPass123456');
    const user = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Filter',
        lastName: 'Test',
        jobTitle: 'Tester',
        hourlyRate: 0,
        weeklyHours: 0,
        avatarColor: '#12B8E1',
      },
    });
    ids.userId = user.id;

    const customer = await prisma.customer.create({
      data: { name: `Kunde ${TAG}` },
    });
    ids.customerId = customer.id;

    const site = await prisma.site.create({
      data: {
        customerId: customer.id,
        label: `Objekt ${TAG}`,
        objectNumber: 'OBJ-TEST-1',
      },
    });
    ids.siteId = site.id;

    const roh = await prisma.workType.create({
      data: { label: `Rohmontage ${TAG}`, billable: true },
    });
    const fertig = await prisma.workType.create({
      data: { label: `Fertigmontage ${TAG}`, billable: true },
    });
    ids.workTypeIds = [roh.id, fertig.id];

    const eRoh = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: roh.id,
        date: '2026-10-06',
        fromMinutes: 0,
        toMinutes: 0,
        breakMinutes: 0,
        hours: 8,
        note: 'roh',
      },
    });
    const eFertig = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: fertig.id,
        date: '2026-10-07',
        fromMinutes: 0,
        toMinutes: 0,
        breakMinutes: 0,
        hours: 24,
        note: 'fertig',
      },
    });
    ids.entryIds = [eRoh.id, eFertig.id];

    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoicesRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const token = signToken({ sub: user.id, role: 'ADMIN' });

    const missingDates = await fetch(`http://127.0.0.1:${port}/api/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ siteId: site.id, workTypeId: roh.id }),
    });
    if (missingDates.status !== 400) {
      throw new Error(`Expected 400 without from/to, got ${missingDates.status}`);
    }

    const res = await fetch(`http://127.0.0.1:${port}/api/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        siteId: site.id,
        from: '2026-10-01',
        to: '2026-10-31',
        workTypeId: roh.id,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Invoice create failed: ${res.status} ${JSON.stringify(body)}`);
    }

    ids.invoiceId = body.invoice.id;

    const linked = await prisma.timeEntry.findMany({
      where: { invoiceId: ids.invoiceId },
      select: { id: true, workTypeId: true, hours: true },
    });

    if (linked.length !== 1) {
      throw new Error(`Expected 1 linked entry, got ${linked.length}`);
    }
    if (linked[0].id !== eRoh.id || linked[0].workTypeId !== roh.id) {
      throw new Error(`Wrong entry linked: ${JSON.stringify(linked)}`);
    }

    const stillOpen = await prisma.timeEntry.findUnique({ where: { id: eFertig.id } });
    if (stillOpen.invoiceId != null) {
      throw new Error('Fertigmontage entry was incorrectly invoiced');
    }

    // 8h * 70 = 560
    if (Math.abs(Number(body.invoice.subtotal) - 560) > 0.01) {
      throw new Error(`Expected subtotal 560, got ${body.invoice.subtotal}`);
    }

    console.log('PASS: workTypeId filter invoices only matching entries');
    console.log(`  invoice=${ids.invoiceId} linked=${linked[0].id} hours=${linked[0].hours}`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await cleanup(ids);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message || e);
  process.exit(1);
});
