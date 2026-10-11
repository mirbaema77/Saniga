/**
 * Monthly hours export for the fiduciary (Treuhänder).
 */

function entryHours(e) {
  if (e.hours != null && !Number.isNaN(Number(e.hours))) {
    return Number(e.hours);
  }
  const from = e.fromMinutes ?? 0;
  const to = e.toMinutes ?? 0;
  const brk = e.breakMinutes ?? 0;
  return Math.max(0, (to - from - brk) / 60);
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/** One decimal, German comma. */
function formatHoursDe(n) {
  return round1(n).toFixed(1).replace('.', ',');
}

/**
 * @param {Array<{id:string,firstName:string,lastName:string}>} users time-tracked
 * @param {Array} entries with userId, date, hours/minutes, workType.billable
 * @param {string} month YYYY-MM
 */
function buildHoursExportRows(users, entries, month) {
  const monthEntries = (entries || []).filter((e) => String(e.date || '').startsWith(month));
  const sorted = [...(users || [])].sort((a, b) => {
    const ln = (a.lastName || '').localeCompare(b.lastName || '', 'de');
    if (ln !== 0) return ln;
    return (a.firstName || '').localeCompare(b.firstName || '', 'de');
  });

  const rows = sorted.map((u) => {
    const mine = monthEntries.filter((e) => e.userId === u.id);
    let total = 0;
    let billable = 0;
    let nonBillable = 0;
    for (const e of mine) {
      const h = entryHours(e);
      total += h;
      const isBillable = e.workType ? e.workType.billable !== false : e.billable !== false;
      if (isBillable) billable += h;
      else nonBillable += h;
    }
    return {
      employeeName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      personnelNumber: '',
      month,
      hoursTotal: round1(total),
      hoursBillable: round1(billable),
      hoursNonBillable: round1(nonBillable),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.hoursTotal = round1(acc.hoursTotal + r.hoursTotal);
      acc.hoursBillable = round1(acc.hoursBillable + r.hoursBillable);
      acc.hoursNonBillable = round1(acc.hoursNonBillable + r.hoursNonBillable);
      return acc;
    },
    { hoursTotal: 0, hoursBillable: 0, hoursNonBillable: 0 }
  );

  return { rows, totals };
}

function rowsToCsv(rows) {
  const header = [
    'Mitarbeiter',
    'Personalnummer',
    'Monat',
    'Stunden total',
    'davon verrechenbar',
    'davon nicht verrechenbar',
  ].join(';');
  const lines = rows.map((r) =>
    [
      r.employeeName,
      r.personnelNumber,
      r.month,
      formatHoursDe(r.hoursTotal),
      formatHoursDe(r.hoursBillable),
      formatHoursDe(r.hoursNonBillable),
    ].join(';')
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

module.exports = {
  entryHours,
  formatHoursDe,
  buildHoursExportRows,
  rowsToCsv,
};
