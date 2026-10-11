/**
 * Asserts PATCH/DELETE on an invoiced entry return 409.
 */
require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { signToken } = require('../src/lib/jwt');
const { hashPassword } = require('../src/lib/password');
const entriesRoutes = require('../src/routes/entries');
const { getCompany } = require('../src/lib/company');

const prisma = new PrismaClient();
const TAG = `lock-${Date.now()}`;

async function main() {
  const ids = {};
  let server;
  try {
    await getCompany();
    const passwordHash = await hashPassword('TestPass123456');
    const user = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Lock',
        lastName: 'Test',
        jobTitle: 'Tester',
        hourlyRate: 35,
        weeklyHours: 45,
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
    const wt = await prisma.workType.create({
      data: { label: `Arbeit ${TAG}`, billable: true },
    });
    ids.wtId = wt.id;

    const inv = await prisma.invoice.create({
      data: {
        number: `LOCK-${Date.now()}/2026`,
        customerId: customer.id,
        siteId: site.id,
        issueDate: new Date('2026-10-10'),
        periodFrom: new Date('2026-10-01'),
        periodTo: new Date('2026-10-10'),
        vatRate: 8.1,
      },
    });
    ids.invoiceId = inv.id;

    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: site.id,
        workTypeId: wt.id,
        date: '2026-10-06',
        fromMinutes: 0,
        toMinutes: 480,
        breakMinutes: 0,
        hours: 8,
        invoiceId: inv.id,
      },
    });
    ids.entryId = entry.id;

    const app = express();
    app.use(express.json());
    app.use('/api/time-entries', entriesRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const token = signToken({ sub: user.id, role: 'ADMIN' });
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const patch = await fetch(`http://127.0.0.1:${port}/api/time-entries/${entry.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ hours: 4, date: '2026-10-06', note: 'x' }),
    });
    const patchBody = await patch.json();
    if (patch.status !== 409) {
      throw new Error(`PATCH expected 409, got ${patch.status} ${JSON.stringify(patchBody)}`);
    }

    const del = await fetch(`http://127.0.0.1:${port}/api/time-entries/${entry.id}`, {
      method: 'DELETE',
      headers,
    });
    const delText = await del.text();
    let delBody = {};
    try {
      delBody = delText ? JSON.parse(delText) : {};
    } catch {
      delBody = { raw: delText };
    }
    if (del.status !== 409) {
      throw new Error(`DELETE expected 409, got ${del.status} ${JSON.stringify(delBody)}`);
    }

    const still = await prisma.timeEntry.findUnique({ where: { id: entry.id } });
    if (!still || still.invoiceId !== inv.id) {
      throw new Error('Entry was modified despite lock');
    }

    console.log('PASS: invoiced entry PATCH/DELETE return 409');
    console.log(`  patch=${patchBody.error}`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (ids.entryId) await prisma.timeEntry.delete({ where: { id: ids.entryId } }).catch(() => {});
    if (ids.invoiceId) await prisma.invoice.delete({ where: { id: ids.invoiceId } }).catch(() => {});
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
