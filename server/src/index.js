require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: Set JWT_SECRET in the environment (at least 16 characters).');
  process.exit(1);
}

const path = require('path');
const express = require('express');
const cors = require('cors');
const { ensureAdmin } = require('./bootstrap');
const authRoutes = require('./routes/auth');
const employeesRoutes = require('./routes/employees');
const entriesRoutes = require('./routes/entries');

const app = express();
const PORT = Number(process.env.PORT, 10) || 3000;

const publicDir = path.join(__dirname, '..', 'public');

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'saniga-zeiterfassung' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/time-entries', entriesRoutes);

app.use(express.static(publicDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next(err);
  });
});

async function main() {
  await ensureAdmin();
  app.listen(PORT, () => {
    console.log(`Saniga API listening on port ${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
