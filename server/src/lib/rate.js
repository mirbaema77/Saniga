const { Prisma } = require('@prisma/client');
const { prisma } = require('./prisma');
const { round2, entryHours, groupFrozenLines } = require('./invoiceMath');

/** Specificity score — higher wins. Matches task order. */
function specificityScore(rate) {
  let score = 0;
  if (rate.customerId) score += 4;
  if (rate.workTypeId) score += 2;
  if (rate.userId) score += 1;
  return score;
}

function ymdToUtcDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToYmd(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd, delta) {
  const dt = ymdToUtcDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return utcDateToYmd(dt);
}

function rateMatchesDims(rate, { customerId, workTypeId, userId }) {
  if (rate.customerId != null && rate.customerId !== customerId) return false;
  if (rate.workTypeId != null && rate.workTypeId !== workTypeId) return false;
  if (rate.userId != null && rate.userId !== userId) return false;
  return true;
}

function rateValidOnYmd(rate, ymd) {
  const from = utcDateToYmd(rate.validFrom);
  if (ymd < from) return false;
  if (rate.validTo == null) return true;
  const to = utcDateToYmd(rate.validTo);
  return ymd <= to;
}

/**
 * Pick most specific rate valid on ymd among candidates.
 * @returns {object|null}
 */
function pickRate(rates, dims, ymd) {
  const matches = rates.filter(
    (r) => rateMatchesDims(r, dims) && rateValidOnYmd(r, ymd)
  );
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ds = specificityScore(b) - specificityScore(a);
    if (ds !== 0) return ds;
    return utcDateToYmd(b.validFrom).localeCompare(utcDateToYmd(a.validFrom));
  });
  return matches[0];
}

class MissingRateError extends Error {
  constructor({ customerName, workTypeLabel, date }) {
    const msg = `Kein Ansatz für ${customerName}, ${workTypeLabel || 'Ohne Arbeitstyp'}, ${date}`;
    super(msg);
    this.name = 'MissingRateError';
    this.code = 'MISSING_RATE';
    this.customerName = customerName;
    this.workTypeLabel = workTypeLabel;
    this.date = date;
  }
}

/**
 * Resolve selling rate for one entry context.
 */
function resolveRateFromList(rates, { customerId, workTypeId, userId, date }) {
  return pickRate(rates, { customerId, workTypeId, userId }, date);
}

async function loadRates(db = prisma) {
  return db.rate.findMany({ orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }] });
}

/**
 * Build frozen invoice lines from entries + resolved rates.
 * Groups by workTypeId + userId + chfPerHour.
 * Throws MissingRateError if any entry lacks a rate.
 */
function buildFrozenLines(entries, customer, rates) {
  const customerId = customer.id;
  const customerName = customer.name || 'Kunde';
  const buckets = new Map();

  for (const e of entries) {
    const hours = entryHours(e);
    if (!(hours > 0)) continue;

    const rate = resolveRateFromList(rates, {
      customerId,
      workTypeId: e.workTypeId || null,
      userId: e.userId,
      date: e.date,
    });

    if (!rate) {
      throw new MissingRateError({
        customerName,
        workTypeLabel: e.workType?.label || 'Ohne Arbeitstyp',
        date: e.date,
      });
    }

    const chf = round2(Number(rate.chfPerHour));
    const key = `${e.workTypeId || ''}::${e.userId}::${chf.toFixed(2)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        workTypeId: e.workTypeId || null,
        workTypeLabel: e.workType?.label || 'Ohne Arbeitstyp',
        userId: e.userId,
        employeeName: `${e.user.firstName} ${e.user.lastName}`.trim(),
        hours: 0,
        chfPerHour: chf,
      });
    }
    const row = buckets.get(key);
    row.hours = round2(row.hours + hours);
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      total: round2(row.hours * row.chfPerHour),
    }))
    .sort((a, b) => {
      const wt = a.workTypeLabel.localeCompare(b.workTypeLabel, 'de');
      if (wt !== 0) return wt;
      const emp = a.employeeName.localeCompare(b.employeeName, 'de');
      if (emp !== 0) return emp;
      return a.chfPerHour - b.chfPerHour;
    });
}

function sameDims(a, b) {
  return (
    (a.customerId || null) === (b.customerId || null) &&
    (a.workTypeId || null) === (b.workTypeId || null) &&
    (a.userId || null) === (b.userId || null)
  );
}

/**
 * Create a rate; close any open overlapping rate for the same dims
 * by setting validTo to the day before the new validFrom.
 */
async function createRateClosingPrevious(data, db = prisma) {
  const customerId = data.customerId || null;
  const workTypeId = data.workTypeId || null;
  const userId = data.userId || null;
  const validFromYmd =
    typeof data.validFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.validFrom)
      ? data.validFrom
      : utcDateToYmd(data.validFrom);
  const validFrom = ymdToUtcDate(validFromYmd);
  const validTo =
    data.validTo == null || data.validTo === ''
      ? null
      : ymdToUtcDate(
          typeof data.validTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.validTo)
            ? data.validTo
            : utcDateToYmd(data.validTo)
        );

  const chfPerHour = new Prisma.Decimal(round2(Number(data.chfPerHour)).toFixed(2));

  return db.$transaction(async (tx) => {
    const open = await tx.rate.findMany({
      where: {
        customerId,
        workTypeId,
        userId,
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
    });

    const dayBefore = addDaysYmd(validFromYmd, -1);
    for (const prev of open) {
      if (!sameDims(prev, { customerId, workTypeId, userId })) continue;
      const prevFrom = utcDateToYmd(prev.validFrom);
      if (prevFrom >= validFromYmd) {
        // New rate starts on/before previous — close previous to day before if possible
        if (prevFrom === validFromYmd) {
          await tx.rate.update({
            where: { id: prev.id },
            data: { validTo: ymdToUtcDate(dayBefore) },
          });
        } else {
          await tx.rate.update({
            where: { id: prev.id },
            data: { validTo: ymdToUtcDate(dayBefore) },
          });
        }
        continue;
      }
      const prevTo = prev.validTo ? utcDateToYmd(prev.validTo) : null;
      if (prevTo == null || prevTo >= validFromYmd) {
        await tx.rate.update({
          where: { id: prev.id },
          data: { validTo: ymdToUtcDate(dayBefore) },
        });
      }
    }

    return tx.rate.create({
      data: {
        customerId,
        workTypeId,
        userId,
        chfPerHour,
        validFrom,
        validTo,
      },
      include: {
        customer: true,
        workType: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  });
}

module.exports = {
  specificityScore,
  ymdToUtcDate,
  utcDateToYmd,
  addDaysYmd,
  pickRate,
  resolveRateFromList,
  loadRates,
  buildFrozenLines,
  groupFrozenLines,
  createRateClosingPrevious,
  MissingRateError,
};
