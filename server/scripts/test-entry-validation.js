/**
 * Entry validation: hours bounds, daily total flag, backdating.
 */
require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { signToken } = require('../src/lib/jwt');
const { hashPassword } = require('../src/lib/password');
const entriesRoutes = require('../src/routes/entries');
const IsoWeek = require('../public/iso-week');
const EntryLimits = require('../public/entry-limits');

const prisma = new PrismaClient();
const TAG = `val-${Date.now()}`;

function ymdDaysAgo(days) {
  const today = IsoWeek.zonedYmd(new Date());
  const { y, m, d } = EntryLimits.parseYmd(today);
  const utc = new Date(Date.UTC(y, m - 1, d - days, 12, 0, 0));
  return `${utc.getUTCFullYear()}-${EntryLimits.pad2(utc.getUTCMonth() + 1)}-${EntryLimits.pad2(utc.getUTCDate())}`;
}

async function main() {
  const ids = { entryIds: [] };
  let server;
  const results = [];

  try {
    const passwordHash = await hashPassword('TestPass123456');
    const admin = await prisma.user.create({
      data: {
        email: `${TAG}-admin@test.local`,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Admin',
        lastName: 'Val',
        jobTitle: 'Admin',
        hourlyRate: 35,
        weeklyHours: 45,
        isTimeTracked: true,
        avatarColor: '#12B8E1',
      },
    });
    ids.adminId = admin.id;

    const employee = await prisma.user.create({
      data: {
        email: `${TAG}-emp@test.local`,
        passwordHash,
        role: 'EMPLOYEE',
        firstName: 'Emp',
        lastName: 'Val',
        jobTitle: 'Monteur',
        hourlyRate: 35,
        weeklyHours: 45,
        isTimeTracked: true,
        avatarColor: '#2563eb',
      },
    });
    ids.empId = employee.id;

    const customer = await prisma.customer.create({ data: { name: `Kunde ${TAG}` } });
    ids.customerId = customer.id;
    const siteA = await prisma.site.create({
      data: { customerId: customer.id, label: `SiteA ${TAG}` },
    });
    const siteB = await prisma.site.create({
      data: { customerId: customer.id, label: `SiteB ${TAG}` },
    });
    ids.siteA = siteA.id;
    ids.siteB = siteB.id;

    const wt = await prisma.workType.create({
      data: { label: `Arbeit ${TAG}`, billable: true },
    });
    ids.wtId = wt.id;

    const app = express();
    app.use(express.json());
    app.use('/api/time-entries', entriesRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/time-entries`;

    const adminToken = signToken({ sub: admin.id, role: 'ADMIN' });
    const empToken = signToken({ sub: employee.id, role: 'EMPLOYEE' });
    const today = IsoWeek.zonedYmd(new Date());

    async function post(token, body) {
      const r = await fetch(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      return { status: r.status, data };
    }

    // 1) 17 hours rejected
    {
      const r = await post(adminToken, {
        date: today,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 17,
        note: 'too many',
      });
      if (r.status !== 400) throw new Error(`17h expected 400, got ${r.status}`);
      if (!String(r.data.error || '').includes('16')) {
        throw new Error(`17h unexpected message: ${r.data.error}`);
      }
      results.push('PASS: 17 hours rejected');
    }

    // 2) 14 hours rejected without flag, accepted with flag
    {
      const r1 = await post(adminToken, {
        date: today,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 14,
        userId: employee.id,
      });
      if (r1.status !== 409 || r1.data.code !== 'DAILY_TOTAL') {
        throw new Error(`14h without flag expected 409 DAILY_TOTAL, got ${r1.status} ${JSON.stringify(r1.data)}`);
      }
      if (Math.abs(Number(r1.data.dailyTotal) - 14) > 0.01) {
        throw new Error(`dailyTotal expected 14, got ${r1.data.dailyTotal}`);
      }
      const r2 = await post(adminToken, {
        date: today,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 14,
        userId: employee.id,
        confirmDailyTotal: true,
      });
      if (r2.status !== 201) {
        throw new Error(`14h with flag expected 201, got ${r2.status} ${JSON.stringify(r2.data)}`);
      }
      ids.entryIds.push(r2.data.entry.id);
      // cleanup this entry so next daily checks start clean for employee
      await prisma.timeEntry.delete({ where: { id: r2.data.entry.id } });
      ids.entryIds = ids.entryIds.filter((id) => id !== r2.data.entry.id);
      results.push('PASS: 14 hours rejected without flag, accepted with flag');
    }

    // 3) employee backdating 90 days rejected
    {
      const past = ymdDaysAgo(90);
      const r = await post(empToken, {
        date: past,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 8,
      });
      if (r.status !== 400) throw new Error(`emp 90d expected 400, got ${r.status}`);
      if (!String(r.data.error || '').includes('60')) {
        throw new Error(`emp 90d message: ${r.data.error}`);
      }
      results.push('PASS: employee backdating 90 days rejected');
    }

    // 4) admin backdating 90 days accepted
    {
      const past = ymdDaysAgo(90);
      const r = await post(adminToken, {
        date: past,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 8,
        userId: employee.id,
      });
      if (r.status !== 201) {
        throw new Error(`admin 90d expected 201, got ${r.status} ${JSON.stringify(r.data)}`);
      }
      ids.entryIds.push(r.data.entry.id);
      results.push('PASS: admin backdating 90 days accepted');
    }

    // 5) 8h + 6h on different sites → daily check at 14
    {
      const day = ymdDaysAgo(2);
      const e1 = await post(adminToken, {
        date: day,
        siteId: siteA.id,
        workTypeId: wt.id,
        hours: 8,
        userId: employee.id,
      });
      if (e1.status !== 201) throw new Error(`8h siteA failed: ${JSON.stringify(e1.data)}`);
      ids.entryIds.push(e1.data.entry.id);

      const e2 = await post(adminToken, {
        date: day,
        siteId: siteB.id,
        workTypeId: wt.id,
        hours: 6,
        userId: employee.id,
      });
      if (e2.status !== 409 || e2.data.code !== 'DAILY_TOTAL') {
        throw new Error(`8+6 expected 409 DAILY_TOTAL, got ${e2.status} ${JSON.stringify(e2.data)}`);
      }
      if (Math.abs(Number(e2.data.dailyTotal) - 14) > 0.01) {
        throw new Error(`8+6 dailyTotal expected 14, got ${e2.data.dailyTotal}`);
      }

      const e3 = await post(adminToken, {
        date: day,
        siteId: siteB.id,
        workTypeId: wt.id,
        hours: 6,
        userId: employee.id,
        confirmDailyTotal: true,
      });
      if (e3.status !== 201) {
        throw new Error(`8+6 with confirm expected 201, got ${e3.status}`);
      }
      ids.entryIds.push(e3.data.entry.id);
      results.push('PASS: 8h + 6h different sites triggers daily-total at 14');
    }

    results.forEach((line) => console.log(line));
    console.log('ALL PASS: entry validation');
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (ids.entryIds?.length) {
      await prisma.timeEntry.deleteMany({ where: { id: { in: ids.entryIds } } });
    }
    if (ids.wtId) await prisma.workType.delete({ where: { id: ids.wtId } }).catch(() => {});
    if (ids.siteA) await prisma.site.delete({ where: { id: ids.siteA } }).catch(() => {});
    if (ids.siteB) await prisma.site.delete({ where: { id: ids.siteB } }).catch(() => {});
    if (ids.customerId) await prisma.customer.delete({ where: { id: ids.customerId } }).catch(() => {});
    if (ids.empId) await prisma.user.delete({ where: { id: ids.empId } }).catch(() => {});
    if (ids.adminId) await prisma.user.delete({ where: { id: ids.adminId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message || e);
  process.exit(1);
});
