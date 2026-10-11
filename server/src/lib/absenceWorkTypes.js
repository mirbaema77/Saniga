const ABSENCE_WORK_TYPE_LABELS = ['Ferien', 'Krankheit', 'Unfall', 'Feiertag', 'Militär'];

/**
 * Idempotent seed: ensure standard absence work types exist (billable=false).
 * @returns {{ created: string[], ensured: string[] }}
 */
async function ensureAbsenceWorkTypes(prisma) {
  const created = [];
  const ensured = [];

  for (const label of ABSENCE_WORK_TYPE_LABELS) {
    const existing = await prisma.workType.findFirst({ where: { label } });
    if (existing) {
      if (existing.billable !== false || existing.active === false) {
        await prisma.workType.update({
          where: { id: existing.id },
          data: { billable: false, active: true },
        });
      }
      ensured.push(label);
      continue;
    }
    await prisma.workType.create({
      data: { label, billable: false, active: true },
    });
    created.push(label);
    ensured.push(label);
  }

  return { created, ensured };
}

module.exports = {
  ABSENCE_WORK_TYPE_LABELS,
  ensureAbsenceWorkTypes,
};
