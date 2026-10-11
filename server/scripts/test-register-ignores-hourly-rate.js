/**
 * POST /api/invitations/:token/accept with hourlyRate 500 must create a user
 * at the Invitation's rate (not 500).
 * Usage: node scripts/test-register-ignores-hourly-rate.js
 */
const crypto = require('crypto');
const http = require('http');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PREFIX = `reg_rate_${Date.now()}_`;
const INVITE_RATE = 42;
const PORT = Number(process.env.PORT) || 3000;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function postJson(path, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const email = `${PREFIX}@test.local`;
  const token = crypto.randomBytes(32).toString('hex');
  let invitationId = null;
  let userId = null;

  try {
    const invitation = await prisma.invitation.create({
      data: {
        token,
        email,
        firstName: 'Reg',
        lastName: 'Test',
        jobTitle: 'Monteur',
        hourlyRate: INVITE_RATE,
        weeklyHours: 40,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    invitationId = invitation.id;

    const res = await postJson(`/api/invitations/${token}/accept`, {
      password: 'SecurePass1',
      hourlyRate: 500,
      weeklyHours: 60,
      role: 'ADMIN',
      isTimeTracked: false,
    });

    assert(res.status === 201, `expected 201, got ${res.status}: ${res.raw}`);
    assert(res.json?.user, 'response includes user');

    const user = await prisma.user.findUnique({ where: { email } });
    assert(user, 'user created in DB');
    userId = user.id;

    assert(
      Number(user.hourlyRate) === INVITE_RATE,
      `hourlyRate must be invitation ${INVITE_RATE}, got ${user.hourlyRate}`
    );
    assert(Number(user.hourlyRate) !== 500, 'client hourlyRate 500 must be ignored');
    assert(Number(user.weeklyHours) === 40, `weeklyHours must be invitation 40, got ${user.weeklyHours}`);
    assert(user.role === 'EMPLOYEE', `role must be EMPLOYEE, got ${user.role}`);
    assert(user.isTimeTracked === true, 'isTimeTracked must be true');

    console.log('PASS: registration ignores client hourlyRate 500; uses invitation rate');
    console.log(`  rate=${Number(user.hourlyRate)} weeklyHours=${user.weeklyHours} role=${user.role}`);
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    if (invitationId) {
      await prisma.invitation.delete({ where: { id: invitationId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
