/**
 * One-off: cancel empty invoice 54/2026 and unlink any entries.
 * Usage: node scripts/cancel-invoice-54-2026.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const NUMBER = '54/2026';
const REASON = 'Fehlerhaft erstellt, keine Positionen';

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT id, number, "cancelledAt", "cancelledReason"
    FROM "Invoice"
    WHERE number = ${NUMBER}
    LIMIT 1
  `;
  const inv = rows[0];

  if (!inv) {
    console.log(`NOT FOUND: invoice ${NUMBER}`);
    return;
  }

  if (inv.cancelledAt) {
    console.log(`ALREADY CANCELLED: ${NUMBER}`);
    console.log(`  cancelledAt=${new Date(inv.cancelledAt).toISOString()}`);
    console.log(`  reason=${inv.cancelledReason || '—'}`);
    return;
  }

  const unlinked = await prisma.$executeRaw`
    UPDATE "TimeEntry"
    SET "invoiceId" = NULL
    WHERE "invoiceId" = ${inv.id}
  `;

  await prisma.$executeRaw`
    UPDATE "Invoice"
    SET "cancelledAt" = NOW(),
        "cancelledReason" = ${REASON}
    WHERE id = ${inv.id}
  `;

  const after = await prisma.$queryRaw`
    SELECT id, number, "cancelledAt", "cancelledReason"
    FROM "Invoice"
    WHERE id = ${inv.id}
    LIMIT 1
  `;
  const updated = after[0];

  console.log(`CANCELLED: ${NUMBER}`);
  console.log(`  id=${updated.id}`);
  console.log(`  cancelledAt=${new Date(updated.cancelledAt).toISOString()}`);
  console.log(`  reason=${updated.cancelledReason}`);
  console.log(`  unlinkedEntries=${unlinked}`);
}

main()
  .catch((e) => {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
