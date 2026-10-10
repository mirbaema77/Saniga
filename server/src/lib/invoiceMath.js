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

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Civil DD.MM.YYYY in Europe/Zurich (issue date) or UTC calendar for stored period bounds. */
function formatDeDate(d, { utc = false } = {}) {
  const dt = d instanceof Date ? d : new Date(d);
  if (utc) {
    return `${pad2(dt.getUTCDate())}.${pad2(dt.getUTCMonth() + 1)}.${dt.getUTCFullYear()}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(dt);
  const day = parts.find((p) => p.type === 'day')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const year = parts.find((p) => p.type === 'year')?.value;
  return `${day}.${month}.${year}`;
}

function formatVatRate(rate) {
  const n = Number(rate);
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Shared presentation model for PDF and Word renderers. */
function buildInvoiceView(invoice) {
  const lineItems = buildLineItems(invoice.entries || []);
  const vatRate = Number(invoice.vatRate);
  const totals = totalsFromLines(lineItems, vatRate);
  return {
    number: invoice.number,
    customerName: invoice.customer?.name || '',
    customerAddress: invoice.customer?.address || '',
    siteLabel: invoice.site?.label || '',
    issueDateLabel: formatDeDate(invoice.issueDate),
    periodFromLabel: formatDeDate(invoice.periodFrom, { utc: true }),
    periodToLabel: formatDeDate(invoice.periodTo, { utc: true }),
    vatRate,
    vatRateLabel: formatVatRate(vatRate),
    hourlyRate: HOURLY_RATE_CHF,
    lineItems,
    ...totals,
  };
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
  formatDeDate,
  formatVatRate,
  buildInvoiceView,
};
