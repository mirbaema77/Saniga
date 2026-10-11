require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { ensureAbsenceWorkTypes } = require('../src/lib/absenceWorkTypes');

const prisma = new PrismaClient();

async function main() {
  const result = await ensureAbsenceWorkTypes(prisma);
  console.log('SEED ABSENCE WORK TYPES');
  console.log(`  created: ${result.created.length ? result.created.join(', ') : '(none)'}`);
  console.log(`  ensured: ${result.ensured.join(', ')}`);
}

main()
  .catch((e) => {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
