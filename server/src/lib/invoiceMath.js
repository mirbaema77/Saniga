/** Flat billing rate for invoice line items (CHF per hour). */
const HOURLY_RATE_CHF = 70.0;

/** Default Swiss VAT rate for invoices. */
const DEFAULT_VAT_RATE = 8.1;

function entryHours(e) {
  if (e.hours != null) return Number(e.hours);
  return (e.toMinutes - e.fromMinutes - e.breakMinutes) / 60;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Swiss amount: 3'150.00 */
function formatSwissAmount(n) {
  const fixed = round2(n).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${withSep}.${dec}`;
}

/** Hours: 45.00 */
function formatHoursQty(n) {
  return round2(n).toFixed(2);
}

/**
 * Group entries by work type, then employee; sum hours.
 * @returns {{ workTypeId: string|null, workTypeLabel: string, employees: { employeeId, employeeName, hours, amount }[], hours, amount }[]}
 */
function buildLineItems(entries) {
  const byWork = new Map();

  for (const e of entries) {
    const wtId = e.workTypeId || '__none__';
    const wtLabel = e.workType?.label || 'Ohne Arbeitstyp';
    if (!byWork.has(wtId)) {
      byWork.set(wtId, {
        workTypeId: e.workTypeId || null,
        workTypeLabel: wtLabel,
        byEmp: new Map(),
      });
    }
    const group = byWork.get(wtId);
    const empId = e.userId;
    const empName = `${e.user.firstName} ${e.user.lastName}`.trim();
    if (!group.byEmp.has(empId)) {
      group.byEmp.set(empId, { employeeId: empId, employeeName: empName, hours: 0 });
    }
    const row = group.byEmp.get(empId);
    row.hours = round2(row.hours + entryHours(e));
  }

  const lines = [...byWork.values()]
    .map((g) => {
      const employees = [...g.byEmp.values()]
        .map((emp) => ({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          hours: emp.hours,
          amount: round2(emp.hours * HOURLY_RATE_CHF),
        }))
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'de'));
      const hours = round2(employees.reduce((s, e) => s + e.hours, 0));
      const amount = round2(employees.reduce((s, e) => s + e.amount, 0));
      return {
        workTypeId: g.workTypeId,
        workTypeLabel: g.workTypeLabel,
        employees,
        hours,
        amount,
      };
    })
    .sort((a, b) => a.workTypeLabel.localeCompare(b.workTypeLabel, 'de'));

  return lines;
}

function totalsFromLines(lines, vatRate) {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const vat = round2(subtotal * (Number(vatRate) / 100));
  const total = round2(subtotal + vat);
  return { subtotal, vat, total };
}

module.exports = {
  HOURLY_RATE_CHF,
  DEFAULT_VAT_RATE,
  entryHours,
  round2,
  formatSwissAmount,
  formatHoursQty,
  buildLineItems,
  totalsFromLines,
};
