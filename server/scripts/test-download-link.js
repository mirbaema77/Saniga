/**
 * Download keys are single-use and expire after 60s.
 * Usage: node scripts/test-download-link.js
 */
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { issueDownloadLink, consumeDownloadLink, TTL_MS } = require('../src/lib/downloadLink');

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT) || 3000;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path, method: 'GET', timeout: 8000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), type: res.headers['content-type'] })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

async function main() {
  const invoice = await prisma.invoice.findFirst({ orderBy: { createdAt: 'desc' } });
  assert(invoice, 'need at least one invoice in DB');

  // --- unit: consume helpers ---
  const issued = await issueDownloadLink(invoice.id, 'pdf');
  const first = await consumeDownloadLink(issued.key, invoice.id, 'pdf');
  assert(first === null, 'first consume succeeds');
  const second = await consumeDownloadLink(issued.key, invoice.id, 'pdf');
  assert(second && second.status === 410, `second consume rejected (got ${second && second.status})`);
  assert(/bereits verwendet/i.test(second.error || ''), `used message: ${second.error}`);

  const expired = await prisma.invoiceDownloadLink.create({
    data: {
      key: `expired_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      invoiceId: invoice.id,
      format: 'pdf',
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  const expiredResult = await consumeDownloadLink(expired.key, invoice.id, 'pdf');
  assert(expiredResult && expiredResult.status === 410, 'expired key rejected');
  assert(/abgelaufen/i.test(expiredResult.error || ''), `expired message: ${expiredResult.error}`);

  // --- HTTP: first download OK, second 410 ---
  const live = await issueDownloadLink(invoice.id, 'pdf');
  const r1 = await httpGet(live.urlPath);
  assert(r1.status === 200, `first HTTP download 200 (got ${r1.status})`);
  assert(/pdf/i.test(r1.type || ''), `content-type pdf (got ${r1.type})`);
  const r2 = await httpGet(live.urlPath);
  assert(r2.status === 410, `second HTTP download 410 (got ${r2.status})`);

  const liveExpired = await prisma.invoiceDownloadLink.create({
    data: {
      key: `http_exp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      invoiceId: invoice.id,
      format: 'pdf',
      expiresAt: new Date(Date.now() - TTL_MS),
    },
  });
  const r3 = await httpGet(
    `/api/invoices/${encodeURIComponent(invoice.id)}/pdf?key=${encodeURIComponent(liveExpired.key)}`
  );
  assert(r3.status === 410, `expired HTTP download 410 (got ${r3.status})`);

  // JWT in query must not work anymore
  const r4 = await httpGet(`/api/invoices/${encodeURIComponent(invoice.id)}/pdf?token=not-a-real-jwt`);
  assert(r4.status === 401 || r4.status === 410, `no session via ?token= (got ${r4.status})`);

  console.log('PASS: download key single-use and expired rejected');
  console.log(`  invoice=${invoice.number} ttlMs=${TTL_MS}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
