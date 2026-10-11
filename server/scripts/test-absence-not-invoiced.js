/**
 * Asserts non-billable absence entries are never linked by POST /api/invoices.
 */
require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { signToken } = require('../src/lib/jwt');
const { hashPassword } = require('../src/lib/password');
const invoicesRoutes = require('../src/routes/invoices');
const { getCompany } = require('../src/lib/company');
const { ensureAbsenceWorkTypes } = require('../src/lib/absenceWorkTypes');

const prisma = new PrismaClient();
const TAG = `abs-inv-${Date.now()}`;

async function main() {
  const ids = { entryIds: [] };
  let server;
  try {
    await getCompany();
    await ensureAbsenceWorkTypes(prisma);

    const passwordHash = await hashPassword('TestPass123456');
    const user = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Abs',
        lastName: 'Test',
        jobTitle: 'Tester',
        hourlyRate: 35,
        weeklyHours: 45,
        isTimeTracked: true,
        avatarColor: '#12B8E1',
      },
    });
    ids.userId = user.id;

    const customer = await prisma.customer.create({ data: { name: `Kunde ${TAG}` } });
    ids.customerId = customer.id;
    const site = await prisma.site.create({
      data: { customerId: customer.id, label: `Objekt ${TAG}` },
    });
    ids.siteId = site.id;

    const ferien = await prisma.workType.findFirst({ where: { label: 'Ferien', billable: false } });
    if (!ferien) throw new Error('Ferien work type missing after seed');

    const billableWt = await prisma.workType.create({
      data: { label: `Montage ${TAG}`, billable: true },
    });
    ids.wtId = billableWt.id;

    // Absence deliberately attached to a site — still must not be invoiced
    const absence = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: ferien.id,
        date: '2026-10-08',
        fromMinutes: 0,
        toMinutes: 480,
        breakMinutes: 0,
        hours: 8,
        note: 'Ferien',
      },
    });
    ids.entryIds.push(absence.id);

    const billable = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: billableWt.id,
        date: '2026-10-09',
        fromMinutes: 0,
        toMinutes: 480,
        breakMinutes: 0,
        hours: 8,
        note: 'Arbeit',
      },
    });
    ids.entryIds.push(billable.id);

    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoicesRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const token = signToken({ sub: user.id, role: 'ADMIN' });

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
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Invoice create failed: ${res.status} ${JSON.stringify(body)}`);
    }
    ids.invoiceId = body.invoice.id;

    const linked = await prisma.timeEntry.findMany({
      where: { invoiceId: ids.invoiceId },
      select: { id: true, workTypeId: true },
    });
    if (linked.some((e) => e.id === absence.id || e.workTypeId === ferien.id)) {
      throw new Error('Absence entry was linked to invoice');
    }
    if (linked.length !== 1 || linked[0].id !== billable.id) {
      throw new Error(`Expected only billable entry linked, got ${JSON.stringify(linked)}`);
    }

    const absFresh = await prisma.timeEntry.findUnique({ where: { id: absence.id } });
    if (absFresh.invoiceId != null) {
      throw new Error('Absence invoiceId was set');
    }

    console.log('PASS: absence entries cannot be invoiced');
    console.log(`  invoice=${ids.invoiceId} linked=${linked[0].id} absenceOpen=${absence.id}`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
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
    if (ids.wtId) await prisma.workType.delete({ where: { id: ids.wtId } }).catch(() => {});
    if (ids.siteId) await prisma.site.delete({ where: { id: ids.siteId } }).catch(() => {});
    if (ids.customerId) await prisma.customer.delete({ where: { id: ids.customerId } }).catch(() => {});
    if (ids.userId) await prisma.user.delete({ where: { id: ids.userId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message || e);
  process.exit(1);
});
