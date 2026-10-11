const { prisma } = require('./lib/prisma');
const { hashPassword } = require('./lib/password');
const { ensureCompany } = require('./lib/company');
const { ensureAbsenceWorkTypes } = require('./lib/absenceWorkTypes');

async function ensureAdmin() {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) return;

  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn(
      '[bootstrap] No admin user exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin on startup.'
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      firstName: 'Urim',
      lastName: 'Gashi',
      jobTitle: 'Admin',
      hourlyRate: 0,
      weeklyHours: 0,
      avatarColor: '#12B8E1',
    },
  });
  console.log(`[bootstrap] Created admin user: ${email}`);
}

async function bootstrap() {
  await ensureCompany();
  await ensureAdmin();
  const abs = await ensureAbsenceWorkTypes(prisma);
  if (abs.created.length) {
    console.log(`[bootstrap] Absenz-Arbeitsarten angelegt: ${abs.created.join(', ')}`);
  }
}

module.exports = { ensureAdmin, ensureCompany, bootstrap, ensureAbsenceWorkTypes };
