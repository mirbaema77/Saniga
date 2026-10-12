/**
 * Lightweight UI mock server for phone-nav checks (no DB).
 * Usage: node scripts/mock-ui-server.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ui-mock-secret-16chars';

const path = require('path');
const express = require('express');
const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
} = require('docx');
const { signToken } = require('../src/lib/jwt');

function buildMockPdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text('Saniga AG — Mock-Rechnung', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Rechnung ${invoice.number}`);
    doc.text(`Kunde: ${invoice.customer?.name || '—'}`);
    doc.text(`Objekt: ${invoice.site?.label || '—'}`);
    doc.text(`Zeitraum: ${invoice.periodFrom || '—'} – ${invoice.periodTo || '—'}`);
    doc.text(`Total: CHF ${Number(invoice.total || 0).toFixed(2)}`);
    doc.moveDown();
    doc.fillColor('#666').fontSize(10).text('Lokaler UI-Mock — auf Railway wird die echte Rechnung erzeugt.');
    doc.end();
  });
}

async function buildMockDocx(invoice) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'Saniga AG — Mock-Rechnung', bold: true, size: 32 })],
          }),
          new Paragraph({ children: [new TextRun(`Rechnung ${invoice.number}`)] }),
          new Paragraph({
            children: [new TextRun(`Kunde: ${invoice.customer?.name || '—'}`)],
          }),
          new Paragraph({
            children: [new TextRun(`Objekt: ${invoice.site?.label || '—'}`)],
          }),
          new Paragraph({
            children: [
              new TextRun(
                `Zeitraum: ${invoice.periodFrom || '—'} – ${invoice.periodTo || '—'}`
              ),
            ],
          }),
          new Paragraph({
            children: [new TextRun(`Total: CHF ${Number(invoice.total || 0).toFixed(2)}`)],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Lokaler UI-Mock — auf Railway wird die echte Rechnung erzeugt.',
                italics: true,
                size: 18,
                color: '666666',
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.json());

const admin = {
  id: 'admin-mock',
  email: 'admin@test.local',
  role: 'ADMIN',
  firstName: 'Admin',
  lastName: 'Test',
  jobTitle: 'Admin',
  hourlyRate: 0,
  weeklyHours: 45,
  isTimeTracked: true,
  avatarColor: '#12B8E1',
};

const worker = {
  id: 'emp-2',
  email: 'marco@test.local',
  role: 'EMPLOYEE',
  firstName: 'Marco',
  lastName: 'Huber',
  jobTitle: 'Monteur Sanitär',
  hourlyRate: 35,
  weeklyHours: 45,
  isTimeTracked: true,
  avatarColor: '#0d9488',
};

const customers = [
  {
    id: 'cust-1',
    name: 'Muster AG',
    street: 'Bahnhofstrasse 1',
    postalCode: '8001',
    city: 'Zürich',
    contactPerson: 'Frau Meier',
    paymentTermDays: 14,
  },
  {
    id: 'cust-2',
    name: 'Beispiel GmbH',
    street: 'Industriestrasse 12',
    postalCode: '8340',
    city: 'Hinwil',
    contactPerson: '',
    paymentTermDays: 30,
  },
];

const sites = [
  {
    id: 'site-1',
    label: 'Baustelle Hinwil',
    objectNumber: '2026-014',
    address: 'Dorfstrasse 5, 8340 Hinwil',
    active: true,
    customer: { id: 'cust-1', name: 'Muster AG' },
  },
  {
    id: 'site-2',
    label: 'Sanierung Dach',
    objectNumber: '2026-021',
    address: 'Bergweg 3',
    active: true,
    customer: { id: 'cust-2', name: 'Beispiel GmbH' },
  },
];

const workTypes = [
  { id: 'wt-1', label: 'Montage', billable: true, active: true },
  { id: 'wt-2', label: 'Service', billable: true, active: true },
  { id: 'wt-3', label: 'Intern', billable: false, active: true },
];

const rates = [
  {
    id: 'rate-1',
    customer: { id: 'cust-1', name: 'Muster AG' },
    workType: { id: 'wt-1', label: 'Montage' },
    user: null,
    chfPerHour: 95,
    validFrom: '2026-01-01',
    validTo: null,
  },
  {
    id: 'rate-2',
    customer: { id: 'cust-1', name: 'Muster AG' },
    workType: { id: 'wt-2', label: 'Service' },
    user: null,
    chfPerHour: 110,
    validFrom: '2026-01-01',
    validTo: null,
  },
];

const reportCustomers = [
  {
    id: 'cust-1',
    name: 'Muster AG',
    totalHours: 12,
    sites: [
      {
        id: 'site-1',
        label: 'Baustelle Hinwil',
        totalHours: 12,
        entries: [
          {
            id: 'en-1',
            date: '2026-10-06',
            employeeName: 'Admin Test',
            workType: 'Montage',
            hours: 8,
            note: 'Rohmontage',
            billable: true,
          },
          {
            id: 'en-2',
            date: '2026-10-07',
            employeeName: 'Admin Test',
            workType: 'Service',
            hours: 4,
            note: '',
            billable: true,
          },
        ],
      },
    ],
  },
  {
    id: 'cust-2',
    name: 'Beispiel GmbH',
    totalHours: 6.5,
    sites: [
      {
        id: 'site-2',
        label: 'Sanierung Dach',
        totalHours: 6.5,
        entries: [
          {
            id: 'en-3',
            date: '2026-09-12',
            employeeName: 'Admin Test',
            workType: 'Montage',
            hours: 6.5,
            note: 'Ansatz fehlt',
            billable: true,
          },
        ],
      },
    ],
  },
];

const invoices = [
  {
    id: 'inv-1',
    number: '2026-001',
    customer: { name: 'Muster AG' },
    site: { label: 'Altes Objekt' },
    periodFrom: '2026-08-01',
    periodTo: '2026-08-31',
    total: 2450.5,
    cancelledAt: null,
  },
  {
    id: 'inv-2',
    number: '2026-002',
    customer: { name: 'Beispiel GmbH' },
    site: { label: 'Sanierung Dach' },
    periodFrom: '2026-07-01',
    periodTo: '2026-07-15',
    total: 980,
    cancelledAt: '2026-07-20',
    cancelledReason: 'Falscher Zeitraum',
  },
];

app.post('/api/auth/login', (req, res) => {
  const token = signToken({ sub: admin.id, role: 'ADMIN' });
  res.json({ token, user: admin });
});
app.get('/api/auth/me', (_req, res) => res.json({ user: admin }));
app.get('/api/time-entries', (_req, res) => res.json({ entries: [] }));
app.get('/api/customers', (_req, res) => res.json({ customers }));
app.patch('/api/customers/:id', (req, res) => {
  const c = customers.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  Object.assign(c, {
    name: req.body.name ?? c.name,
    street: req.body.street ?? c.street,
    postalCode: req.body.postalCode ?? c.postalCode,
    city: req.body.city ?? c.city,
    contactPerson: req.body.contactPerson ?? c.contactPerson,
    paymentTermDays: req.body.paymentTermDays ?? c.paymentTermDays,
  });
  res.json({ customer: c });
});
app.post('/api/customers', (req, res) => {
  const c = {
    id: `cust-${Date.now()}`,
    name: req.body.name || 'Neu',
    street: req.body.street || '',
    postalCode: req.body.postalCode || '',
    city: req.body.city || '',
    contactPerson: req.body.contactPerson || '',
    paymentTermDays: req.body.paymentTermDays ?? 14,
  };
  customers.push(c);
  res.status(201).json({ customer: c });
});
app.get('/api/sites', (_req, res) => res.json({ sites }));
app.patch('/api/sites/:id', (req, res) => {
  const s = sites.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (req.body.active != null) s.active = !!req.body.active;
  res.json({ site: s });
});
app.get('/api/work-types', (_req, res) => res.json({ workTypes }));
app.patch('/api/work-types/:id', (req, res) => {
  const w = workTypes.find((x) => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  if (req.body.active != null) w.active = !!req.body.active;
  res.json({ workType: w });
});
app.get('/api/employees', (_req, res) => res.json({ employees: [admin, worker] }));
app.get('/api/company', (_req, res) =>
  res.json({
    company: {
      id: 'default',
      name: 'Saniga AG',
      street: 'Werkstrasse 4',
      postalCode: '8302',
      city: 'Kloten',
      uid: 'CHE-123.456.789',
      vatRate: 8.1,
      invoiceStartNumber: 1,
    },
  })
);
app.patch('/api/company', (req, res) =>
  res.json({
    company: {
      id: 'default',
      name: req.body.name || 'Saniga AG',
      street: req.body.street || '',
      postalCode: req.body.postalCode || '',
      city: req.body.city || '',
      uid: req.body.uid || '',
      vatRate: req.body.vatRate ?? 8.1,
      invoiceStartNumber: req.body.invoiceStartNumber ?? 1,
    },
  })
);
app.get('/api/rates', (_req, res) => res.json({ rates }));
app.get('/api/dashboard', (_req, res) =>
  res.json({
    openHours: 0,
    openAmount: 0,
    openCount: 0,
    weekHours: 0,
    monthHours: 0,
    monthSoll: 0,
    lohn: 0,
    openRows: [],
    teamToday: [],
    weekProgress: [],
    isoWeek: 1,
  })
);
app.get('/api/dashboard/open', (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const allSites = [
    {
      customerName: 'Muster AG',
      siteLabel: 'Baustelle Hinwil',
      hours: 12,
      amount: 840,
      ageDays: 9,
      oldestDate: '2026-10-01',
      missingRateCount: 0,
    },
    {
      customerName: 'Beispiel GmbH',
      siteLabel: 'Sanierung Dach',
      hours: 6.5,
      amount: 0,
      ageDays: 28,
      oldestDate: '2026-09-12',
      missingRateCount: 2,
    },
  ];
  // Mock: Alle = full open set; a specific person = first site only (demo filter).
  const sites = userId && userId !== admin.id ? [allSites[0]] : allSites;
  const totalHours = sites.reduce((s, r) => s + r.hours, 0);
  const totalAmount = sites.reduce((s, r) => s + r.amount, 0);
  const missingRate = {
    count: sites.reduce((s, r) => s + (r.missingRateCount || 0), 0),
    hours: sites.reduce((s, r) => s + (r.missingRateCount ? r.hours : 0), 0),
  };
  res.json({ totalHours, totalAmount, missingRate, sites });
});
app.get('/api/reports', (_req, res) => res.json({ customers: reportCustomers }));
app.get('/api/invoices', (_req, res) => res.json({ invoices }));

function findReportSite(siteId) {
  for (const c of reportCustomers) {
    const site = (c.sites || []).find((s) => s.id === siteId);
    if (site) return { customer: c, site };
  }
  return null;
}

function rateFor(customerId, workTypeLabel) {
  const wt = workTypes.find((w) => w.label === workTypeLabel);
  if (!wt) return null;
  const hit = rates.find(
    (r) => r.customer.id === customerId && r.workType.id === wt.id && !r.validTo
  );
  return hit ? Number(hit.chfPerHour) : null;
}

function buildInvoicePreview(siteId, from, to, workTypeId) {
  const found = findReportSite(siteId);
  if (!found) {
    const err = new Error('Objekt nicht gefunden');
    err.status = 404;
    throw err;
  }
  let entries = (found.site.entries || []).filter(
    (e) => e.billable !== false && !e.invoiceId && Number(e.hours) > 0
  );
  if (from) entries = entries.filter((e) => e.date >= from);
  if (to) entries = entries.filter((e) => e.date <= to);
  if (workTypeId) {
    const wt = workTypes.find((w) => w.id === workTypeId);
    if (wt) entries = entries.filter((e) => e.workType === wt.label);
  }
  if (!entries.length) {
    const err = new Error('Keine offenen verrechenbaren Stunden für diese Auswahl.');
    err.status = 409;
    throw err;
  }
  const byWt = new Map();
  for (const e of entries) {
    const chf = rateFor(found.customer.id, e.workType);
    if (chf == null) {
      const err = new Error(
        `Kein Ansatz für ${found.customer.name}, ${e.workType || 'Ohne Arbeitstyp'}, ${e.date}`
      );
      err.status = 409;
      throw err;
    }
    const hours = Number(e.hours);
    const amount = Math.round(hours * chf * 100) / 100;
    if (!byWt.has(e.workType)) {
      byWt.set(e.workType, {
        workTypeLabel: e.workType,
        hours: 0,
        amount: 0,
        employees: [],
      });
    }
    const g = byWt.get(e.workType);
    g.hours = Math.round((g.hours + hours) * 100) / 100;
    g.amount = Math.round((g.amount + amount) * 100) / 100;
    g.employees.push({
      employeeName: e.employeeName || 'Mitarbeiter',
      hours,
      chfPerHour: chf,
      amount,
    });
  }
  const lineItems = [...byWt.values()];
  const subtotal = Math.round(lineItems.reduce((s, g) => s + g.amount, 0) * 100) / 100;
  const dates = entries.map((e) => e.date).sort();
  return {
    found,
    entries,
    preview: {
      customer: { id: found.customer.id, name: found.customer.name },
      site: { id: found.site.id, label: found.site.label },
      periodFrom: dates[0],
      periodTo: dates[dates.length - 1],
      vatRate: 8.1,
      lineItems,
      subtotal,
      vat: Math.round(subtotal * 0.081 * 100) / 100,
      total: Math.round(subtotal * 1.081 * 100) / 100,
    },
  };
}

app.post('/api/invoices/preview', (req, res) => {
  try {
    const { siteId, from, to, workTypeId } = req.body || {};
    if (!siteId || !from || !to) {
      return res.status(400).json({ error: 'siteId, from und to sind erforderlich.' });
    }
    const { preview } = buildInvoicePreview(siteId, from, to, workTypeId);
    res.json(preview);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Vorschau fehlgeschlagen' });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    const { siteId, from, to, workTypeId } = req.body || {};
    if (!siteId || !from || !to) {
      return res.status(400).json({ error: 'siteId, from und to sind erforderlich.' });
    }
    const { found, entries, preview } = buildInvoicePreview(siteId, from, to, workTypeId);
    const year = String(to).slice(0, 4);
    const seq = String(invoices.length + 1).padStart(3, '0');
    const invoice = {
      id: `inv-${Date.now()}`,
      number: `${year}-${seq}`,
      customer: { name: found.customer.name },
      site: { label: found.site.label },
      periodFrom: preview.periodFrom,
      periodTo: preview.periodTo,
      total: preview.total,
      cancelledAt: null,
    };
    for (const e of entries) {
      e.invoiceId = invoice.id;
      e.invoiceNumber = invoice.number;
    }
    invoices.unshift(invoice);
    res.status(201).json({ invoice: { id: invoice.id, number: invoice.number } });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Rechnung fehlgeschlagen' });
  }
});

app.post('/api/invoices/:id/download-link', (req, res) => {
  const inv = invoices.find((x) => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  const format = String(req.body?.format || 'pdf').toLowerCase() === 'docx' ? 'docx' : 'pdf';
  res.json({
    url: `/api/invoices/${encodeURIComponent(inv.id)}/${format}?mock=1`,
    expiresIn: 60,
  });
});

app.get('/api/invoices/:id/pdf', async (req, res) => {
  const inv = invoices.find((x) => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  try {
    const pdf = await buildMockPdf(inv);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Rechnung-${inv.number}.pdf"`
    );
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'PDF konnte nicht erzeugt werden' });
  }
});

app.get('/api/invoices/:id/docx', async (req, res) => {
  const inv = invoices.find((x) => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
  try {
    const docx = await buildMockDocx(inv);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Rechnung-${inv.number}.docx"`
    );
    res.send(docx);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Word-Datei konnte nicht erzeugt werden' });
  }
});

app.get('/api/exports/hours', (_req, res) => res.json({ rows: [] }));
app.get('/api/absences', (_req, res) => res.json({ groups: [] }));
app.get('/api/absences/summary', (_req, res) => res.json({ month: '', entries: [] }));

app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = 3457;
app.listen(PORT, () => console.log(`mock-ui http://127.0.0.1:${PORT}`));
