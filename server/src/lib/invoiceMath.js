/** Fallback VAT if company record is unavailable. */
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
 * Group frozen InvoiceLine rows (or equivalent) by work type for display.
 * Each employee row carries its own chfPerHour.
 */
function groupFrozenLines(lines) {
  const byWork = new Map();
  for (const line of lines || []) {
    const wtId = line.workTypeId || '__none__';
    const wtLabel =
      line.workTypeLabel || line.workType?.label || 'Ohne Arbeitstyp';
    if (!byWork.has(wtId)) {
      byWork.set(wtId, {
        workTypeId: line.workTypeId || null,
        workTypeLabel: wtLabel,
        employees: [],
        hours: 0,
        amount: 0,
      });
    }
    const g = byWork.get(wtId);
    const hours = round2(Number(line.hours));
    const chfPerHour = round2(Number(line.chfPerHour));
    const amount = round2(
      Number(line.total != null ? line.total : hours * chfPerHour)
    );
    const empName =
      line.employeeName ||
      (line.user
        ? `${line.user.firstName} ${line.user.lastName}`.trim()
        : 'Mitarbeiter');
    g.employees.push({
      employeeId: line.userId || null,
      employeeName: empName,
      hours,
      chfPerHour,
      amount,
    });
    g.hours = round2(g.hours + hours);
    g.amount = round2(g.amount + amount);
  }

  return [...byWork.values()]
    .map((g) => ({
      ...g,
      employees: g.employees.sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, 'de')
      ),
    }))
    .sort((a, b) => a.workTypeLabel.localeCompare(b.workTypeLabel, 'de'));
}

function totalsFromLines(lines, vatRate) {
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
  const vat = round2(subtotal * (Number(vatRate) / 100));
  const total = round2(subtotal + vat);
  return { subtotal, vat, total };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

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

/** name / street / "PLZ Ort" */
function buildRecipientLines(customer) {
  const name = (customer?.name || '').trim();
  const street = (customer?.street || '').trim();
  const cityLine = [customer?.postalCode, customer?.city]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');
  return [name, street, cityLine];
}

function workDateBounds(entries) {
  const dates = (entries || [])
    .filter((e) => entryHours(e) > 0)
    .map((e) => e.date)
    .filter(Boolean)
    .sort();
  if (!dates.length) return { from: null, to: null };
  return { from: dates[0], to: dates[dates.length - 1] };
}

function formatYmdDe(ymd) {
  const [y, m, d] = String(ymd).split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

/**
 * @param {object} invoice — must include frozen `lines` (or precomputed lineItems)
 * @param {object} [company]
 */
function buildInvoiceView(invoice, company = null) {
  const lineItems =
    invoice.lineItems ||
    groupFrozenLines(invoice.lines || []);
  const vatRate = Number(
    invoice.vatRate != null ? invoice.vatRate : company?.vatRate ?? DEFAULT_VAT_RATE
  );
  const totals = totalsFromLines(lineItems, vatRate);
  const siteLabel = invoice.site?.label || '';
  const objectNumber = (invoice.site?.objectNumber || '').trim();
  const bounds = workDateBounds(invoice.entries || []);
  const periodFromLabel = bounds.from
    ? formatYmdDe(bounds.from)
    : formatDeDate(invoice.periodFrom, { utc: true });
  const periodToLabel = bounds.to
    ? formatYmdDe(bounds.to)
    : formatDeDate(invoice.periodTo, { utc: true });
  const issueDateLabel = bounds.to
    ? formatYmdDe(bounds.to)
    : formatDeDate(invoice.issueDate, { utc: true });
  const recipientLines = buildRecipientLines(invoice.customer);
  const paymentDays = invoice.customer?.paymentTermDays ?? 14;
  const companyName = company?.name || 'Saniga AG';
  const companyCity = (company?.city || 'Hinwil').trim() || 'Hinwil';
  const uid = (company?.uid || 'CHE-298.414.455').trim();

  return {
    number: invoice.number,
    customerName: recipientLines[0] || '',
    recipientLines,
    siteLabel,
    objectNumber,
    issueDateLabel,
    issuePlaceLabel: companyCity,
    periodFromLabel,
    periodToLabel,
    vatRate,
    vatRateLabel: formatVatRate(vatRate),
    paymentTermDays: paymentDays,
    companyName,
    metaRows: [
      { label: 'MWST.-Nr.', value: uid },
      { label: 'Objekt-Liegenschaft', value: siteLabel },
      { label: 'Objekt-Nr.', value: objectNumber },
      { label: 'Arbeitsgattung', value: 'BKP 250 Sanitäranlagen' },
      { label: 'Ausführungsdatum', value: `${periodFromLabel} – ${periodToLabel}` },
    ],
    footerLines: [
      `Zahlungsbedingungen: ${paymentDays} Tage netto`,
      'Wir bedanken uns für den Auftrag und die Zusammenarbeit.',
      'Freundliche Grüsse',
      companyName,
    ],
    lineItems,
    ...totals,
  };
}

module.exports = {
  DEFAULT_VAT_RATE,
  entryHours,
  round2,
  formatSwissAmount,
  formatHoursQty,
  groupFrozenLines,
  totalsFromLines,
  formatDeDate,
  formatYmdDe,
  formatVatRate,
  buildRecipientLines,
  workDateBounds,
  buildInvoiceView,
};
