# Saniga Zeiterfassung (MVP)

**Try the UI without installing Node:**

- Double-click **`demo.html`**, or  
- Run **`serve_demo.ps1`** (no Python needed):  
  `powershell -ExecutionPolicy Bypass -File .\serve_demo.ps1`  
  or double-click **`serve_demo.cmd`**. Opens **`http://127.0.0.1:8765/demo.html`**.
- If Python is installed: **`py serve_demo.py`** (or `python …`). Use **`--lan`** for other devices on Wi‑Fi.

Sample data lives in memory only until you refresh the page.

---

Single-tenant time tracking: one **admin** account (full overview) and **employees** who self-register with a shared invite code, then log their hours.

## Project layout

- `server/` — Node.js API (Express + Prisma + PostgreSQL), serves the UI from `server/public/`.
- `server/public/index.html` — main app (login + Zeiterfassung).
- `server/public/join.html` — shareable link for employees to create an account.

The old standalone demo at the repo root `index.html` is **not** used when the server runs; use `http://localhost:3000` after starting the API.

## Local development

### One command (recommended)

You need **Python 3**, **Node.js 20+**, **npm**, and **Docker Desktop** (running).

From the repository root:

```bash
python run.py
```

On Windows, if `python` is not found, try:

```bash
py run.py
```

The script starts Postgres in Docker, creates `server/.env` on first run if missing, installs dependencies, runs migrations, and starts the app. Then open **http://localhost:3000** — default admin: `admin@local.test` / `admin123`, employee invite code on **http://localhost:3000/join.html**: `DEMO`.

Stop the database when finished: `docker compose down` in the same folder.

### Manual setup

1. Install [Node.js 20+](https://nodejs.org/) and PostgreSQL (or use a cloud DB).
2. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL`, `JWT_SECRET` (≥16 chars), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `EMPLOYEE_INVITE_CODE`.
3. In a terminal:

```bash
cd server
npm install
npx prisma migrate deploy
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000), log in as admin, then share `http://localhost:3000/join.html` plus the invite code with testers.

## Deploy on Railway

1. Push this repository to GitHub/GitLab and connect it in [Railway](https://railway.app/).
2. Create a **new project** → **PostgreSQL** (plugin). Copy the generated `DATABASE_URL`.
3. Add a **new service** from the same repo; set **Root Directory** to `server`.
4. In the service **Variables**, add:
   - `DATABASE_URL` — from the Postgres plugin (reference variable).
   - `JWT_SECRET` — long random string (≥16 characters).
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — first admin is created on first deploy if no admin exists.
   - `EMPLOYEE_INVITE_CODE` — secret code for `/join.html` registration.
5. Deploy. Railway runs `npm run start` (`prisma migrate deploy` then `node src/index.js`).
6. Use the generated public URL: main app `/`, employee onboarding `/join.html`.

## Security notes (MVP)

- Use strong `JWT_SECRET`, `ADMIN_PASSWORD`, and `EMPLOYEE_INVITE_CODE` in production.
- Prefer HTTPS only (Railway provides TLS).
- This MVP stores passwords with bcrypt; consider rate limiting and audit logs for production hardening.

## API overview

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/login` | `{ email, password }` → JWT |
| POST | `/api/auth/register-employee` | Requires `inviteCode` matching `EMPLOYEE_INVITE_CODE` |
| GET | `/api/auth/me` | Bearer JWT |
| GET | `/api/employees` | Admin only |
| POST | `/api/employees` | Admin creates employee (email + password + profile) |
| GET | `/api/time-entries` | Query `from`, `to`, optional `userId` (admin) |
| POST/PATCH/DELETE | `/api/time-entries` | Role-based access |
