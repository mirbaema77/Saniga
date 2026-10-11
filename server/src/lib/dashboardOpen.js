const { round2, entryHours } = require('./invoiceMath');
const { resolveRateFromList } = require('./rate');

function zurichTodayYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Whole days from aYmd to bYmd (b − a), using calendar YMD strings. */
function daysBetweenYmd(aYmd, bYmd) {
  const [ay, am, ad] = String(aYmd).split('-').map(Number);
  const [by, bm, bd] = String(bYmd).split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

function isBillableOpenEntry(e) {
  if (e.invoiceId) return false;
  if (!e.siteId && !e.site) return false;
  const hours = entryHours(e);
  if (!(hours > 0)) return false;
  if (e.workType && e.workType.billable === false) return false;
  return true;
}

/**
 * @param {Array} entries — TimeEntry with site.customer, workType, user
 * @param {Array} rates
 * @param {string} [todayYmd]
 */
function computeOpenDashboard(entries, rates, todayYmd = zurichTodayYmd()) {
  const bySite = new Map();
  let totalHours = 0;
  let totalAmount = 0;
  let missingRateCount = 0;
  let missingRateHours = 0;

  for (const e of entries || []) {
    if (!isBillableOpenEntry(e)) continue;
    const site = e.site;
    const customer = site?.customer;
    if (!site || !customer) continue;

    const hours = round2(entryHours(e));
    totalHours = round2(totalHours + hours);

    const rate = resolveRateFromList(rates, {
      customerId: customer.id,
      workTypeId: e.workTypeId || null,
      userId: e.userId,
      date: e.date,
    });

    const key = site.id;
    if (!bySite.has(key)) {
      bySite.set(key, {
        customerId: customer.id,
        customerName: customer.name || 'Kunde',
        siteId: site.id,
        siteLabel: site.label || 'Objekt',
        hours: 0,
        amount: 0,
        oldestDate: e.date,
        missingRateCount: 0,
        missingRateHours: 0,
      });
    }
    const row = bySite.get(key);
    row.hours = round2(row.hours + hours);
    if (e.date < row.oldestDate) row.oldestDate = e.date;

    if (!rate) {
      missingRateCount += 1;
      missingRateHours = round2(missingRateHours + hours);
      row.missingRateCount += 1;
      row.missingRateHours = round2(row.missingRateHours + hours);
      continue;
    }

    const amount = round2(hours * Number(rate.chfPerHour));
    totalAmount = round2(totalAmount + amount);
    row.amount = round2(row.amount + amount);
  }

  const sites = [...bySite.values()]
    .map((row) => ({
      ...row,
      ageDays: daysBetweenYmd(row.oldestDate, todayYmd),
    }))
    .sort((a, b) => {
      const age = b.ageDays - a.ageDays;
      if (age !== 0) return age;
      const c = a.customerName.localeCompare(b.customerName, 'de');
      if (c !== 0) return c;
      return a.siteLabel.localeCompare(b.siteLabel, 'de');
    });

  return {
    totalHours,
    totalAmount,
    missingRate: {
      count: missingRateCount,
      hours: missingRateHours,
    },
    sites,
  };
}

module.exports = {
  zurichTodayYmd,
  daysBetweenYmd,
  isBillableOpenEntry,
  computeOpenDashboard,
};
