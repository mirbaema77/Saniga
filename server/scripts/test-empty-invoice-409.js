/**
 * Asserts POST /api/invoices returns 409 when the filter matches nothing.
 */
require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { signToken } = require('../src/lib/jwt');
const { hashPassword } = require('../src/lib/password');
const invoicesRoutes = require('../src/routes/invoices');

const prisma = new PrismaClient();
const TAG = `empty-inv-${Date.now()}`;

async function main() {
  const ids = {};
  let server;
  try {
    const passwordHash = await hashPassword('TestPass123456');
    const user = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Empty',
        lastName: 'Test',
        jobTitle: 'Tester',
        hourlyRate: 0,
        weeklyHours: 0,
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

    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoicesRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const token = signToken({ sub: user.id, role: 'ADMIN' });

    const before = await prisma.invoice.count();
    const res = await fetch(`http://127.0.0.1:${port}/api/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        siteId: site.id,
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    });
    const body = await res.json();
    const after = await prisma.invoice.count();

    if (res.status !== 409) {
      throw new Error(`Expected 409, got ${res.status} ${JSON.stringify(body)}`);
    }
    if (!String(body.error || '').includes('Keine unverrechneten')) {
      throw new Error(`Unexpected error message: ${body.error}`);
    }
    if (after !== before) {
      throw new Error(`Invoice count changed (${before} -> ${after}); empty invoice was created`);
    }

    console.log('PASS: empty selection returns 409 and creates nothing');
    console.log(`  error=${body.error}`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
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
