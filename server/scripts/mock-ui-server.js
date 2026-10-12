/**
 * Lightweight UI mock server for phone-nav checks (no DB).
 * Usage: node scripts/mock-ui-server.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ui-mock-secret-16chars';

const path = require('path');
const express = require('express');
const { signToken } = require('../src/lib/jwt');

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
app.get('/api/employees', (_req, res) => res.json({ employees: [admin] }));
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
app.get('/api/dashboard/open', (_req, res) =>
  res.json({
    totalHours: 18.5,
    totalAmount: 1295,
    missingRate: { count: 1, hours: 2 },
    sites: [
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
    ],
  })
);
app.get('/api/reports', (_req, res) => res.json({ customers: reportCustomers }));
app.get('/api/invoices', (_req, res) => res.json({ invoices }));
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
