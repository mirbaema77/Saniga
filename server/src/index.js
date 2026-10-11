require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: Set JWT_SECRET in the environment (at least 16 characters).');
  process.exit(1);
}

const path = require('path');
const express = require('express');
const cors = require('cors');
const { bootstrap } = require('./bootstrap');
const authRoutes = require('./routes/auth');
const employeesRoutes = require('./routes/employees');
const entriesRoutes = require('./routes/entries');
const customersRoutes = require('./routes/customers');
const sitesRoutes = require('./routes/sites');
const workTypesRoutes = require('./routes/workTypes');
const reportsRoutes = require('./routes/reports');
const invitationsRoutes = require('./routes/invitations');
const invoicesRoutes = require('./routes/invoices');
const ratesRoutes = require('./routes/rates');
const companyRoutes = require('./routes/company');
const exportsRoutes = require('./routes/exports');
const dashboardRoutes = require('./routes/dashboard');
const absencesRoutes = require('./routes/absences');

const app = express();
const PORT = Number(process.env.PORT, 10) || 3000;

const publicDir = path.join(__dirname, '..', 'public');

function corsAllowlist() {
  const raw = (process.env.CORS_ORIGINS || '').trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`];
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

const allowedOrigins = corsAllowlist();
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / non-browser clients send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.set('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'saniga-zeiterfassung' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/time-entries', entriesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/work-types', workTypesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/rates', ratesRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/exports', exportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absences', absencesRoutes);

app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    },
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next(err);
  });
});

async function main() {
  await bootstrap();
  app.listen(PORT, () => {
    console.log(`Saniga API listening on port ${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
