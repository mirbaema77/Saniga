const COLS = ['#12B8E1', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#64748b'];
let EMPS = [
  { id: 1, first: 'Marco', last: 'Huber', role: 'Monteur Sanitär', rate: 35, target: 45, color: COLS[0] },
  { id: 2, first: 'Stefan', last: 'Meier', role: 'Monteur Heizung', rate: 36, target: 45, color: COLS[1] },
  { id: 3, first: 'Lena', last: 'Vogt', role: 'Monteurin Lüftung', rate: 34, target: 40, color: COLS[2] },
  { id: 4, first: 'Reto', last: 'Zahner', role: 'Lehrling Sanitär', rate: 18, target: 40, color: COLS[3] },
  { id: 5, first: 'Bianca', last: 'Suter', role: 'Monteurin Sanitär', rate: 35, target: 45, color: COLS[4] },
  { id: 6, first: 'Urim', last: 'Gashi', role: 'Admin', rate: 0, target: 0, color: COLS[5] },
];
let ENTRIES = [
  { id: 1, empId: 1, date: '2026-03-02', from: 420, to: 990, brk: 30, note: 'Baustelle Hinwil' },
  { id: 2, empId: 1, date: '2026-03-03', from: 420, to: 1020, brk: 30, note: '' },
  { id: 3, empId: 1, date: '2026-03-04', from: 435, to: 1005, brk: 30, note: 'Zürich Uster' },
  { id: 4, empId: 1, date: '2026-03-05', from: 420, to: 1050, brk: 45, note: '' },
  { id: 5, empId: 1, date: '2026-03-06', from: 420, to: 960, brk: 30, note: '' },
  { id: 6, empId: 1, date: '2026-03-09', from: 420, to: 1020, brk: 30, note: 'Wangen' },
  { id: 7, empId: 1, date: '2026-03-10', from: 420, to: 1020, brk: 30, note: '' },
  { id: 8, empId: 1, date: '2026-03-11', from: 420, to: 1020, brk: 30, note: '' },
  { id: 9, empId: 1, date: '2026-03-12', from: 420, to: 960, brk: 30, note: '' },
  { id: 10, empId: 1, date: '2026-03-13', from: 420, to: 1020, brk: 30, note: 'Grossbaustelle' },
  { id: 11, empId: 1, date: '2026-03-16', from: 420, to: 1020, brk: 30, note: '' },
  { id: 12, empId: 1, date: '2026-03-17', from: 420, to: 1020, brk: 30, note: '' },
  { id: 13, empId: 1, date: '2026-03-18', from: 420, to: 1020, brk: 45, note: '' },
  { id: 14, empId: 1, date: '2026-03-19', from: 420, to: 1020, brk: 30, note: '' },
  { id: 15, empId: 1, date: '2026-03-20', from: 420, to: 960, brk: 30, note: '' },
  { id: 16, empId: 1, date: '2026-03-23', from: 420, to: 1020, brk: 30, note: '' },
  { id: 17, empId: 1, date: '2026-03-24', from: 420, to: 1020, brk: 30, note: '' },
  { id: 18, empId: 1, date: '2026-03-25', from: 420, to: 1020, brk: 30, note: 'Rapperswil' },
  { id: 19, empId: 1, date: '2026-03-26', from: 420, to: 1020, brk: 30, note: '' },
  { id: 20, empId: 1, date: '2026-03-27', from: 420, to: 990, brk: 30, note: '' },
  { id: 21, empId: 2, date: '2026-03-02', from: 420, to: 1020, brk: 30, note: '' },
  { id: 22, empId: 2, date: '2026-03-03', from: 420, to: 1050, brk: 30, note: 'Heizung Wartung' },
  { id: 23, empId: 2, date: '2026-03-04', from: 420, to: 1020, brk: 30, note: '' },
  { id: 24, empId: 2, date: '2026-03-09', from: 420, to: 1080, brk: 45, note: '' },
  { id: 25, empId: 2, date: '2026-03-10', from: 420, to: 1020, brk: 30, note: '' },
  { id: 26, empId: 2, date: '2026-03-16', from: 420, to: 1020, brk: 30, note: '' },
  { id: 27, empId: 2, date: '2026-03-17', from: 420, to: 1020, brk: 30, note: '' },
  { id: 28, empId: 2, date: '2026-03-23', from: 420, to: 1020, brk: 30, note: '' },
  { id: 29, empId: 2, date: '2026-03-24', from: 420, to: 1020, brk: 30, note: '' },
  { id: 30, empId: 3, date: '2026-03-02', from: 480, to: 990, brk: 30, note: '' },
  { id: 31, empId: 3, date: '2026-03-03', from: 480, to: 1020, brk: 30, note: 'Lüftung Service' },
  { id: 32, empId: 3, date: '2026-03-09', from: 480, to: 960, brk: 30, note: '' },
  { id: 33, empId: 3, date: '2026-03-10', from: 480, to: 1020, brk: 30, note: '' },
  { id: 34, empId: 3, date: '2026-03-16', from: 480, to: 1020, brk: 30, note: '' },
  { id: 35, empId: 3, date: '2026-03-23', from: 480, to: 960, brk: 30, note: '' },
  { id: 36, empId: 4, date: '2026-03-02', from: 420, to: 960, brk: 30, note: '' },
  { id: 37, empId: 4, date: '2026-03-03', from: 420, to: 930, brk: 30, note: 'Arzttermin' },
  { id: 38, empId: 4, date: '2026-03-09', from: 420, to: 960, brk: 30, note: '' },
  { id: 39, empId: 4, date: '2026-03-16', from: 420, to: 960, brk: 30, note: '' },
  { id: 40, empId: 5, date: '2026-03-02', from: 420, to: 1020, brk: 30, note: '' },
  { id: 41, empId: 5, date: '2026-03-03', from: 420, to: 1020, brk: 30, note: '' },
  { id: 42, empId: 5, date: '2026-03-04', from: 420, to: 1080, brk: 30, note: 'Überstunden' },
  { id: 43, empId: 5, date: '2026-03-09', from: 420, to: 1020, brk: 30, note: '' },
  { id: 44, empId: 5, date: '2026-03-10', from: 420, to: 1020, brk: 30, note: '' },
  { id: 45, empId: 5, date: '2026-03-16', from: 420, to: 1020, brk: 30, note: '' },
  { id: 46, empId: 5, date: '2026-03-17', from: 420, to: 1020, brk: 30, note: '' },
  { id: 47, empId: 5, date: '2026-03-23', from: 420, to: 1020, brk: 30, note: '' },
];
let nextId = 48;
let editId = null;
let curUser = EMPS.find((e) => e.role === 'Admin')?.id ?? 1;
let teamSelEmpId = null;

const DEMO_ADMIN_VIEWS = ['dashboard', 'team', 'alle'];

const ge = (id) => EMPS.find((e) => e.id === id);
function isDemoAdmin() {
  return ge(curUser)?.role === 'Admin';
}
function formatEmpSelectLabel(e) {
  if (!e) return '';
  const typ = e.role === 'Admin' ? 'Admin' : 'Mitarbeiter';
  return `${e.first} ${e.last} (${typ})`;
}
function syncLohnEditability() {
  const admin = isDemoAdmin();
  const payrollCard = document.querySelector('.payroll-rules-card');
  if (payrollCard) payrollCard.classList.toggle('hidden', !admin);
  const empWrap = document.getElementById('lohnEmpSelWrap');
  if (empWrap) empWrap.classList.toggle('hidden', !admin);
  const roHint = document.getElementById('lohnReadOnlyHint');
  if (roHint) roHint.classList.toggle('hidden', admin);
}
function applyDemoRoleUI() {
  const admin = isDemoAdmin();
  document.querySelectorAll('.admin-only-nav').forEach((el) => {
    el.classList.toggle('hidden', !admin);
  });
  syncLohnEditability();
  const empFg = document.getElementById('eEmpFg');
  const dateFg = document.getElementById('eDateFg');
  if (empFg) empFg.classList.toggle('hidden', !admin);
  if (dateFg) dateFg.classList.toggle('full', !admin);
  const hint = document.getElementById('demoRoleHint');
  if (hint) {
    hint.textContent = admin
      ? 'Geschäftsführung: Dashboard, Team und alle Einträge. Lohnabrechnung für alle Mitarbeitenden.'
      : 'Mitarbeiter: eigene Zeiten, Monatsübersicht und Lohnabrechnung (nur lesen, PDF möglich). Geschäftsführung: „Urim Gashi (Admin)“ im Dropdown.';
  }
}
const ini = (e) => (e.first[0] + e.last[0]).toUpperCase();
const net = (en) => en.to - en.from - en.brk;
const mStr = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const mDur = (m) => (m % 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.floor(m / 60)}h`);
const fmtD = (s) => {
  const [y, mo, d] = s.split('-');
  return `${d}.${mo}.${y}`;
};
const today = () => new Date().toISOString().split('T')[0];
const eEmp = (id, m = '') => ENTRIES.filter((e) => e.empId === id && (m ? e.date.startsWith(m) : true));
const totH = (id, m = '') => eEmp(id, m).reduce((s, e) => s + net(e), 0) / 60;

function teamProfileMonth() {
  const el = document.getElementById('teamMonSel');
  return el && el.value ? el.value : '2026-03';
}
const monthLabelYm = (ym) => {
  const [y, mo] = ym.split('-').map(Number);
  const names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${names[mo - 1]} ${y}`;
};
function wkDates() {
  const t = new Date();
  const mo = new Date(t);
  mo.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mo);
    d.setDate(mo.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}
function kw(s) {
  const d = new Date(s);
  const st = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - st) / 86400000 + st.getDay() + 1) / 7);
}

function tick() {
  const n = new Date();
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const mos = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  document.getElementById('topDate').textContent = `${days[n.getDay()]}, ${n.getDate()}. ${mos[n.getMonth()]} ${n.getFullYear()}`;
}
setInterval(tick, 30000);
tick();

function syncUserSwitcher() {
  const s = document.getElementById('userSwitcher');
  if (!s) return;
  const curIdx = EMPS.findIndex((e) => e.id === curUser);
  s.innerHTML = EMPS.map((e, i) => `<option value="${i}">${formatEmpSelectLabel(e)}</option>`).join('');
  s.value = String(curIdx >= 0 ? curIdx : 0);
}

function switchUser(idx) {
  const e = EMPS[+idx];
  if (!e) return;
  curUser = e.id;
  const av = document.getElementById('sAv');
  av.textContent = ini(e);
  av.style.background = e.color;
  document.getElementById('sName').textContent = `${e.first} ${e.last}`;
  document.getElementById('sRole').textContent = e.role;
  applyDemoRoleUI();
  const v = document.querySelector('.view.active');
  const vid = v ? v.id.replace('view-', '') : '';
  if (vid && DEMO_ADMIN_VIEWS.includes(vid) && !isDemoAdmin()) showView('meine');
  else refreshCur();
}

const TITLES = {
  meine: 'Meine Zeiten',
  monat: 'Monatsübersicht',
  dashboard: 'Admin Dashboard',
  team: 'Team verwalten',
  lohn: 'Lohnabrechnung',
  alle: 'Alle Einträge',
};
function showView(n) {
  if (DEMO_ADMIN_VIEWS.includes(n) && !isDemoAdmin()) n = 'meine';
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${n}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((i) => i.classList.toggle('active', i.getAttribute('onclick') === `showView('${n}')`));
  document.getElementById('topTitle').textContent = TITLES[n];
  refreshView(n);
}
function refreshCur() {
  const v = document.querySelector('.view.active');
  if (v) refreshView(v.id.replace('view-', ''));
}
function refreshView(n) {
  if (n === 'meine') renderMeine();
  if (n === 'monat') renderMonat();
  if (n === 'dashboard' && isDemoAdmin()) renderDash();
  if (n === 'team' && isDemoAdmin()) renderTeam();
  if (n === 'lohn') {
    syncLohnEditability();
    if (isDemoAdmin()) {
      renderPayrollRulesForm();
      fillLohnSel();
    }
    renderLohn();
  }
  if (n === 'alle' && isDemoAdmin()) {
    fillAlleSel();
    renderAlle();
  }
}

function renderMeine() {
  renderWeekStrip();
  const el = document.getElementById('mMonthLabel');
  if (el) el.textContent = 'März 2026 — Fortschritt';
  const ll = document.getElementById('mLohnLabel');
  if (ll) ll.textContent = 'Erwarteter Lohn März';
  const e = ge(curUser);
  const m = '2026-03';
  const soll = 184;
  const hrs = totH(curUser, m);
  const pct = Math.min(100, Math.round((hrs / soll) * 100));
  document.getElementById('mHrs').textContent = `${hrs.toFixed(1)}h`;
  document.getElementById('mSub').textContent = `von ${soll}h Soll`;
  document.getElementById('mProg').style.width = `${pct}%`;
  document.getElementById('mPct').textContent = `${pct}% erfüllt`;
  document.getElementById('mLohn').textContent = `CHF ${Math.round(hrs * (e?.rate || 35)).toLocaleString('de-CH')}.–`;
  document.getElementById('mRate').textContent = `bei CHF ${e?.rate || 35}.–/h`;

  const wk = wkDates();
  const wEntries = ENTRIES.filter((en) => en.empId === curUser && wk.includes(en.date)).sort((a, b) => (a.date > b.date ? -1 : 1));
  const wMins = wEntries.reduce((s, en) => s + net(en), 0);
  document.getElementById('wkBadge').textContent = mDur(wMins) || '0h';

  const list = document.getElementById('wkList');
  if (!wEntries.length) {
    list.innerHTML = `<div style="padding:24px 20px;text-align:center;color:var(--t3);font-size:13px;">
      Noch keine Einträge diese Woche.<br>
      <span style="color:var(--saniga-red);cursor:pointer;font-weight:600;" onclick="openAdd()">Jetzt eintragen →</span>
    </div>`;
    return;
  }
  list.innerHTML = wEntries
    .map(
      (en) => `
    <div class="ei">
      <div class="ei-dot"></div>
      <div class="ei-date">${fmtD(en.date)}</div>
      <div class="ei-time">${mStr(en.from)} – ${mStr(en.to)}</div>
      <div class="ei-dur">${mDur(net(en))}</div>
      <div class="ei-note">${en.note || '—'}</div>
      <div class="ei-acts">
        <div class="ib" onclick="openEdit(${en.id})" title="Bearbeiten">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div class="ib del" onclick="quickDel(${en.id})" title="Löschen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function renderWeekStrip() {
  const wk = wkDates();
  const t = today();
  const ns = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  document.getElementById('weekStrip').innerHTML = wk
    .map((d, i) => {
      const mins = ENTRIES.filter((e) => e.empId === curUser && e.date === d).reduce((s, e) => s + net(e), 0);
      const isT = d === t;
      return `<div class="wd ${isT ? 'today' : ''} ${mins > 0 ? 'has-entry' : ''}" onclick="openAddDate('${d}')">
      <div class="wd-n">${ns[i]}</div>
      <div class="wd-d">${parseInt(d.split('-')[2], 10)}</div>
      <div class="wd-h" style="color:${mins > 0 ? 'var(--green)' : 'var(--t4)'};">${mins > 0 ? mDur(mins) : '–'}</div>
    </div>`;
    })
    .join('');
}

function renderMonat() {
  const m = document.getElementById('monSel').value;
  const [y, mo] = m.split('-');
  const mos = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  document.getElementById('monTitle').textContent = `${mos[+mo]} ${y}`;
  const entries = eEmp(curUser, m).sort((a, b) => (a.date > b.date ? -1 : 1));
  const tot = entries.reduce((s, e) => s + net(e), 0);
  document.getElementById('monBadge').textContent = `${mDur(tot)} Total`;
  document.getElementById('monBody').innerHTML = entries.length
    ? entries
        .map(
          (en) => `<tr>
        <td>${fmtD(en.date)}</td>
        <td class="mono" style="font-size:13px;">${mStr(en.from)}</td>
        <td class="mono" style="font-size:13px;">${mStr(en.to)}</td>
        <td class="mono" style="font-size:12px;color:var(--t3);">${en.brk} min</td>
        <td class="mono">${mDur(net(en))}</td>
        <td style="color:var(--t2);font-size:13px;">${en.note || '—'}</td>
        <td><div style="display:flex;gap:6px;">
          <div class="ib" onclick="openEdit(${en.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
          <div class="ib del" onclick="quickDel(${en.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
        </div></td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge für diesen Monat.</td></tr>`;
}

function renderDash() {
  const t = today();
  const m = '2026-03';
  const wk = wkDates();
  const act = EMPS.filter((e) => e.rate > 0 && ENTRIES.some((en) => en.empId === e.id && en.date === t)).length;
  const wkM = ENTRIES.filter((e) => wk.includes(e.date)).reduce((s, e) => s + net(e), 0);
  const monM = ENTRIES.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + net(e), 0);
  const soll = EMPS.filter((e) => e.rate > 0).reduce((s, e) => s + e.target * 4, 0);
  const lohn = EMPS.filter((e) => e.rate > 0).reduce((s, e) => s + totH(e.id, m) * e.rate, 0);
  document.getElementById('dAct').textContent = act;
  document.getElementById('dWk').textContent = mDur(wkM);
  document.getElementById('dMon').textContent = `${(monM / 60).toFixed(0)}h`;
  document.getElementById('dMonSub').textContent = `von ${soll}h Soll`;
  document.getElementById('dLohn').textContent = `CHF ${Math.round(lohn).toLocaleString('de-CH')}.–`;
  document.getElementById('dKW').textContent = kw(t);

  document.getElementById('dTeam').innerHTML = EMPS.filter((e) => e.role !== 'Admin')
    .map((e) => {
      const tM = ENTRIES.filter((en) => en.empId === e.id && en.date === t).reduce((s, en) => s + net(en), 0);
      const ok = tM > 0;
      return `<div class="ei">
      <div style="width:32px;height:32px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">${ini(e)}</div>
      <div style="flex:1;font-size:13.5px;font-weight:500;">${e.first} ${e.last}</div>
      <div style="font-size:12px;color:var(--t3);margin-right:10px;">${e.role}</div>
      <span class="badge ${ok ? 'bg' : 'br'}"><span class="bdot"></span>${ok ? mDur(tM) : 'Kein Eintrag'}</span>
    </div>`;
    })
    .join('');

  document.getElementById('dWkProg').innerHTML = EMPS.filter((e) => e.rate > 0)
    .map((e) => {
      const hrs = ENTRIES.filter((en) => en.empId === e.id && wk.includes(en.date)).reduce((s, en) => s + net(en), 0) / 60;
      const pct = Math.min(100, Math.round((hrs / e.target) * 100));
      const col = pct >= 95 ? 'var(--green)' : pct >= 70 ? 'var(--saniga-red)' : 'var(--red)';
      return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:13px;font-weight:500;">${e.first} ${e.last}</span>
        <span class="mono" style="font-size:12px;color:var(--t2);">${hrs.toFixed(1)} / ${e.target}h</span>
      </div>
      <div class="pb"><div class="pf" style="width:${pct}%;background:${col};"></div></div>
    </div>`;
    })
    .join('');
}

function renderTeamProfile() {
  const ph = document.getElementById('teamProfPlaceholder');
  const body = document.getElementById('teamProfBody');
  if (!ph || !body) return;
  const list = EMPS.filter((x) => x.role !== 'Admin');
  const e = teamSelEmpId != null ? ge(teamSelEmpId) : null;
  const valid = e && list.some((x) => x.id === e.id);
  if (!valid) {
    ph.style.display = '';
    body.style.display = 'none';
    return;
  }
  ph.style.display = 'none';
  body.style.display = '';
  const m = teamProfileMonth();
  const mH = totH(e.id, m);
  const l = Math.round(mH * e.rate);
  const av = document.getElementById('teamProfAv');
  av.textContent = ini(e);
  av.style.background = e.color;
  av.style.color = 'white';
  av.style.display = 'flex';
  av.style.alignItems = 'center';
  av.style.justifyContent = 'center';
  av.style.fontWeight = '800';
  av.style.borderRadius = '50%';
  document.getElementById('teamProfName').textContent = `${e.first} ${e.last}`;
  document.getElementById('teamProfRole').textContent = e.role;
  document.getElementById('teamProfId').textContent = `#${e.id}`;
  document.getElementById('teamProfRate').textContent = e.rate > 0 ? `CHF ${e.rate}.–/h` : '—';
  document.getElementById('teamProfTarget').textContent = e.target > 0 ? `${e.target} h` : '—';
  document.getElementById('teamProfMonthCap').textContent = `Im Monat · ${monthLabelYm(m)}`;
  document.getElementById('teamProfHours').textContent = `${mH.toFixed(1)} h`;
  document.getElementById('teamProfLohn').textContent = e.rate > 0 ? `CHF ${l.toLocaleString('de-CH')}` : '—';
  const entries = eEmp(e.id, m).sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 8);
  document.getElementById('teamProfEntries').innerHTML = entries.length
    ? entries
        .map(
          (en) =>
            `<div class="team-prof-row"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;"><span class="mono">${fmtD(en.date)}</span><span class="mono" style="font-weight:700;">${mDur(net(en))}</span></div>${en.note ? `<div style="color:var(--t2);font-size:12px;">${en.note}</div>` : ''}</div>`
        )
        .join('')
    : '<div style="color:var(--t3);font-size:12px;padding:8px 0;">Keine Einträge in diesem Monat.</div>';
}

function openTeamProfile(id) {
  teamSelEmpId = id;
  document.querySelectorAll('#teamGrid .team-emp-pick').forEach((el) => {
    el.classList.toggle('is-selected', +el.dataset.emp === id);
  });
  renderTeamProfile();
}

function removeTeamEmp() {
  if (teamSelEmpId == null) return;
  const e = ge(teamSelEmpId);
  if (!e || e.role === 'Admin') return;
  if (!confirm(`Mitarbeiter „${e.first} ${e.last}“ wirklich löschen? Alle Demo-Zeiteinträge dieser Person werden entfernt.`)) return;
  const rid = e.id;
  ENTRIES = ENTRIES.filter((en) => en.empId !== rid);
  EMPS = EMPS.filter((x) => x.id !== rid);
  if (curUser === rid) curUser = EMPS[0]?.id;
  teamSelEmpId = null;
  syncUserSwitcher();
  const idx = EMPS.findIndex((x) => x.id === curUser);
  if (idx >= 0) switchUser(idx);
  renderTeam();
  refreshCur();
  toast('Mitarbeiter gelöscht');
}

function renderTeam() {
  const grid = document.getElementById('teamGrid');
  const list = EMPS.filter((e) => e.role !== 'Admin');
  if (teamSelEmpId != null && !list.some((e) => e.id === teamSelEmpId)) teamSelEmpId = null;
  const ym = teamProfileMonth();
  const monShort = monthLabelYm(ym).split(' ')[0];
  grid.innerHTML = list
    .map((e) => {
      const mH = totH(e.id, ym);
      const l = Math.round(mH * e.rate);
      const sel = e.id === teamSelEmpId ? ' is-selected' : '';
      return `<div class="emp-card team-emp-pick${sel}" data-emp="${e.id}" role="button" tabindex="0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div class="emp-av" style="background:${e.color};">${ini(e)}</div>
        <div><div style="font-weight:700;font-size:15px;">${e.first} ${e.last}</div>
        <div style="font-size:12px;color:var(--t3);font-family:'JetBrains Mono';">${e.role}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:var(--bg);border-radius:9px;padding:10px 12px;">
          <div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">Stunden ${monShort}</div>
          <div style="font-size:20px;font-weight:800;">${mH.toFixed(1)}h</div>
        </div>
        <div style="background:var(--bg);border-radius:9px;padding:10px 12px;">
          <div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">Lohn ${monShort}</div>
          <div style="font-size:18px;font-weight:800;color:var(--green);">CHF ${l.toLocaleString('de-CH')}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;background:var(--bg);border-radius:8px;padding:7px 10px;text-align:center;">
          <div style="font-size:10px;color:var(--t3);">Stundenlohn</div>
          <div style="font-weight:700;font-size:13px;">CHF ${e.rate}.–/h</div>
        </div>
        <div style="flex:1;background:var(--bg);border-radius:8px;padding:7px 10px;text-align:center;">
          <div style="font-size:10px;color:var(--t3);">Soll/Woche</div>
          <div style="font-weight:700;font-size:13px;">${e.target}h</div>
        </div>
      </div>
    </div>`;
    })
    .join('');
  grid.onclick = (ev) => {
    const c = ev.target.closest('.team-emp-pick');
    if (c) openTeamProfile(+c.dataset.emp);
  };
  grid.onkeydown = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const c = ev.target.closest('.team-emp-pick');
    if (c) {
      ev.preventDefault();
      openTeamProfile(+c.dataset.emp);
    }
  };
  renderTeamProfile();
}

const PAYROLL_STORAGE_KEY = 'saniga_demo_payroll_v1';

function defaultPayrollRules() {
  return { spesenPerEntry: 15, deductions: [] };
}

function normalizePayrollRules(raw) {
  const base = defaultPayrollRules();
  if (!raw || typeof raw !== 'object') return base;
  const sp = Number(raw.spesenPerEntry);
  base.spesenPerEntry = Number.isFinite(sp) && sp >= 0 ? sp : 15;
  if (!Array.isArray(raw.deductions)) return base;
  base.deductions = raw.deductions
    .map((d, i) => ({
      id: String(d.id || `d${i}-${Math.random().toString(36).slice(2, 7)}`),
      label: String(d.label || '').trim(),
      kind: d.kind === 'fixed' ? 'fixed' : 'percent',
      value: Math.max(0, Number(d.value) || 0),
    }))
    .filter((d) => d.label);
  return base;
}

function loadPayrollRules() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAYROLL_STORAGE_KEY) || 'null');
    return normalizePayrollRules(raw);
  } catch {
    return defaultPayrollRules();
  }
}

function savePayrollRules(rules) {
  localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(normalizePayrollRules(rules)));
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function payrollDeductionRowHtml(d) {
  const id = escapeAttr(d.id);
  const kind = d.kind === 'fixed' ? 'fixed' : 'percent';
  const value = Number(d.value) || 0;
  const label = escapeAttr(d.label || '');
  return `<div class="payroll-ded-row" data-id="${id}">
    <div class="fg"><label>Bezeichnung</label><input type="text" data-field="label" value="${label}" oninput="persistPayrollFromForm()"></div>
    <div class="fg"><label>Art</label><select data-field="kind" onchange="persistPayrollFromForm()"><option value="percent" ${kind === 'percent' ? 'selected' : ''}>% vom Brutto</option><option value="fixed" ${kind === 'fixed' ? 'selected' : ''}>CHF fix</option></select></div>
    <div class="fg"><label>Wert</label><input type="number" data-field="value" min="0" step="0.01" value="${value}" oninput="persistPayrollFromForm()"></div>
    <button type="button" class="btn btn-d" style="padding:8px 10px;align-self:end;" onclick="payrollRemoveDeduction('${id}')" title="Zeile entfernen">&times;</button>
  </div>`;
}

function payrollRulesFromDOM() {
  const spesen = Math.max(0, parseFloat(document.getElementById('paySpesen')?.value) || 0);
  const rows = document.querySelectorAll('#payrollDeductionRows .payroll-ded-row');
  const deductions = [];
  rows.forEach((row) => {
    const id = row.dataset.id || `d${Math.random().toString(36).slice(2, 9)}`;
    const label = row.querySelector('[data-field="label"]')?.value?.trim() || '';
    const kind = row.querySelector('[data-field="kind"]')?.value === 'fixed' ? 'fixed' : 'percent';
    const value = Math.max(0, parseFloat(row.querySelector('[data-field="value"]')?.value) || 0);
    if (!label) return;
    deductions.push({ id, label, kind, value });
  });
  return { spesenPerEntry: spesen, deductions };
}

function persistPayrollFromForm() {
  if (!isDemoAdmin()) return;
  savePayrollRules(payrollRulesFromDOM());
  renderLohn();
}

function renderPayrollRulesForm() {
  const rules = loadPayrollRules();
  const sp = document.getElementById('paySpesen');
  if (sp) sp.value = rules.spesenPerEntry;
  const wrap = document.getElementById('payrollDeductionRows');
  if (!wrap) return;
  wrap.innerHTML = rules.deductions.map((d) => payrollDeductionRowHtml(d)).join('');
}

function exportLohnPdf() {
  window.print();
}

function payrollAddDeduction() {
  if (!isDemoAdmin()) return;
  const r = loadPayrollRules();
  r.deductions.push({ id: `d${Date.now()}`, label: 'Neuer Abzug', kind: 'percent', value: 0 });
  savePayrollRules(r);
  renderPayrollRulesForm();
  renderLohn();
}

function payrollRemoveDeduction(id) {
  if (!isDemoAdmin()) return;
  const r = loadPayrollRules();
  r.deductions = r.deductions.filter((d) => d.id !== id);
  savePayrollRules(r);
  renderPayrollRulesForm();
  renderLohn();
}

function payrollReset() {
  if (!isDemoAdmin()) return;
  localStorage.removeItem(PAYROLL_STORAGE_KEY);
  renderPayrollRulesForm();
  renderLohn();
}

function fillLohnSel() {
  document.getElementById('lEmpSel').innerHTML = EMPS.filter((e) => e.rate > 0)
    .map((e) => `<option value="${e.id}">${formatEmpSelectLabel(e)}</option>`)
    .join('');
}

function renderLohn() {
  const empId = isDemoAdmin()
    ? parseInt(document.getElementById('lEmpSel').value, 10)
    : curUser;
  const m = document.getElementById('lMonSel').value;
  const e = ge(empId);
  if (!e) return;
  const av = document.getElementById('lAv');
  av.textContent = ini(e);
  av.style.background = e.color;
  av.style.width = '48px';
  av.style.height = '48px';
  av.style.borderRadius = '50%';
  av.style.display = 'flex';
  av.style.alignItems = 'center';
  av.style.justifyContent = 'center';
  av.style.fontWeight = '800';
  av.style.fontSize = '18px';
  av.style.color = 'white';
  document.getElementById('lName').textContent = `${e.first} ${e.last}`;
  document.getElementById('lRole').textContent = e.role;
  const lp = document.getElementById('lPeriodLabel');
  if (lp) lp.textContent = `Abrechnungszeitraum: ${monthLabelYm(m)}`;
  const entries = eEmp(empId, m);
  const totNet = entries.reduce((s, en) => s + net(en), 0);
  const base = (totNet / 60) * e.rate;
  const pr = loadPayrollRules();
  const spesen = entries.length * pr.spesenPerEntry;
  const brutto = Math.round((base + spesen) * 100) / 100;
  const dedParts = [];
  let totalDed = 0;
  for (const d of pr.deductions) {
    let amt = d.kind === 'fixed' ? d.value : brutto * (d.value / 100);
    amt = Math.round(amt * 100) / 100;
    totalDed += amt;
    const sub = d.kind === 'percent' ? ` (${d.value}% v. Brutto)` : '';
    dedParts.push(
      `<div class="sal-row"><span style="font-size:13px;color:var(--t2);">− ${d.label}${sub}</span><span class="mono" style="font-size:13px;">CHF ${amt.toLocaleString('de-CH', { minimumFractionDigits: 2 })}</span></div>`
    );
  }
  totalDed = Math.round(totalDed * 100) / 100;
  const netto = Math.round((brutto - totalDed) * 100) / 100;
  document.getElementById('lBreakdown').innerHTML = `
    <div class="sal-row"><span style="font-size:13px;color:var(--t2);">Netto-Arbeitsstunden</span><span class="mono" style="font-size:13px;font-weight:500;">${(totNet / 60).toFixed(2)}h</span></div>
    <div class="sal-row"><span style="font-size:13px;color:var(--t2);">Stundenlohn</span><span class="mono" style="font-size:13px;font-weight:500;">CHF ${e.rate}.–/h</span></div>
    <div class="sal-row"><span style="font-size:13px;color:var(--t2);">Basislohn</span><span class="mono" style="font-size:13px;font-weight:700;">CHF ${base.toLocaleString('de-CH', { minimumFractionDigits: 2 })}</span></div>
    <div class="sal-row"><span style="font-size:13px;color:var(--t2);">Spesen (${entries.length}×CHF ${pr.spesenPerEntry}.–)</span><span class="mono" style="font-size:13px;">CHF ${spesen.toFixed(2)}</span></div>
    <div class="sal-row" style="margin-top:8px;padding-top:10px;border-top:1px solid var(--border);"><span style="font-size:13px;font-weight:600;color:var(--t1);">Brutto total</span><span class="mono" style="font-size:13px;font-weight:700;">CHF ${brutto.toLocaleString('de-CH', { minimumFractionDigits: 2 })}</span></div>
    ${
      dedParts.length
        ? `<div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;margin:14px 0 6px;">Abzüge</div>${dedParts.join('')}`
        : ''
    }`;
  document.getElementById('lTotal').textContent = `CHF ${brutto.toLocaleString('de-CH', { minimumFractionDigits: 2 })}`;
  const netEl = document.getElementById('lNetto');
  if (netEl) netEl.textContent = `CHF ${netto.toLocaleString('de-CH', { minimumFractionDigits: 2 })}`;

  const wks = {};
  entries.forEach((en) => {
    const w = kw(en.date);
    wks[w] = (wks[w] || 0) + net(en);
  });
  document.getElementById('lWks').innerHTML = Object.entries(wks)
    .sort((a, b) => +a[0] - +b[0])
    .map(([w, mins]) => {
      const a = (mins / 60).toFixed(1);
      const diff = (mins / 60 - e.target).toFixed(1);
      const col = diff >= 0 ? 'var(--green)' : 'var(--red)';
      return `<tr>
      <td class="mono" style="font-size:12px;">KW ${w}</td>
      <td class="mono">${e.target}h</td>
      <td class="mono">${a}h</td>
      <td class="mono" style="color:${col};">${diff >= 0 ? '+' : ''}${diff}h</td>
    </tr>`;
    })
    .join('');
}

function fillAlleSel() {
  document.getElementById('aEmpF').innerHTML =
    '<option value="">Alle Mitarbeiter</option>' + EMPS.map((e) => `<option value="${e.id}">${formatEmpSelectLabel(e)}</option>`).join('');
}

function renderAlle() {
  const eid = parseInt(document.getElementById('aEmpF').value, 10) || 0;
  const fr = document.getElementById('aFrom').value;
  const to = document.getElementById('aTo').value;
  const f = ENTRIES.filter((en) => (!eid || en.empId === eid) && (!fr || en.date >= fr) && (!to || en.date <= to)).sort((a, b) => (a.date > b.date ? -1 : 1));
  document.getElementById('aCount').textContent = `${f.length} Einträge`;
  document.getElementById('aBody').innerHTML = f.length
    ? f
        .map((en) => {
          const e = ge(en.empId);
          return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;">${ini(e)}</div>
        ${e.first} ${e.last}
      </div></td>
      <td class="mono" style="font-size:13px;">${fmtD(en.date)}</td>
      <td class="mono" style="font-size:13px;">${mStr(en.from)}</td>
      <td class="mono" style="font-size:13px;">${mStr(en.to)}</td>
      <td class="mono" style="font-size:12px;color:var(--t3);">${en.brk} min</td>
      <td class="mono">${mDur(net(en))}</td>
      <td style="color:var(--t2);font-size:13px;">${en.note || '—'}</td>
      <td><div style="display:flex;gap:6px;">
        <div class="ib" onclick="openEdit(${en.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
        <div class="ib del" onclick="quickDel(${en.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
      </div></td>
    </tr>`;
        })
        .join('')
    : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge gefunden.</td></tr>`;
}

function fillEntryEmp(selId) {
  const src = isDemoAdmin() ? EMPS : EMPS.filter((e) => e.id === curUser);
  document.getElementById('eEmp').innerHTML = src
    .map((e) => `<option value="${e.id}" ${e.id === selId ? 'selected' : ''}>${formatEmpSelectLabel(e)}</option>`)
    .join('');
}

function calcPreview() {
  const f = document.getElementById('eFrom').value;
  const t = document.getElementById('eTo').value;
  const b = +document.getElementById('eBrk').value || 0;
  if (!f || !t) {
    document.getElementById('eCalc').textContent = '—';
    return;
  }
  const [fh, fm] = f.split(':').map(Number);
  const [th, tm] = t.split(':').map(Number);
  const n = th * 60 + tm - (fh * 60 + fm) - b;
  document.getElementById('eCalc').textContent = n > 0 ? mDur(n) : '⚠️ Ungültige Zeit';
}
['eFrom', 'eTo', 'eBrk'].forEach((id) => document.getElementById(id).addEventListener('input', calcPreview));

function openAdd(date) {
  editId = null;
  fillEntryEmp(curUser);
  document.getElementById('mEntryTitle').textContent = 'Stunden erfassen';
  document.getElementById('mEntrySub').textContent = 'Du kannst Einträge für jeden beliebigen Tag hinzufügen — auch nachträglich.';
  document.getElementById('eDate').value = date || today();
  document.getElementById('eFrom').value = '07:00';
  document.getElementById('eTo').value = '16:30';
  document.getElementById('eBrk').value = '30';
  document.getElementById('eNote').value = '';
  document.getElementById('eDel').style.display = 'none';
  calcPreview();
  document.getElementById('moEntry').classList.add('open');
}
function openAddDate(d) {
  openAdd(d);
}
function openEdit(id) {
  const en = ENTRIES.find((e) => e.id === id);
  if (!en) return;
  if (!isDemoAdmin() && en.empId !== curUser) {
    toast('Sie können nur eigene Einträge bearbeiten.');
    return;
  }
  editId = id;
  fillEntryEmp(en.empId);
  document.getElementById('mEntryTitle').textContent = 'Eintrag bearbeiten';
  document.getElementById('mEntrySub').textContent = 'Passe die Zeiten an und speichere.';
  document.getElementById('eDate').value = en.date;
  document.getElementById('eFrom').value = mStr(en.from);
  document.getElementById('eTo').value = mStr(en.to);
  document.getElementById('eBrk').value = en.brk;
  document.getElementById('eNote').value = en.note || '';
  document.getElementById('eDel').style.display = '';
  calcPreview();
  document.getElementById('moEntry').classList.add('open');
}
function saveEntry() {
  const empId = isDemoAdmin() ? +document.getElementById('eEmp').value : curUser;
  const date = document.getElementById('eDate').value;
  const f = document.getElementById('eFrom').value;
  const t = document.getElementById('eTo').value;
  const b = +document.getElementById('eBrk').value || 0;
  const note = document.getElementById('eNote').value.trim();
  if (!date || !f || !t) {
    toast('Bitte alle Felder ausfüllen.');
    return;
  }
  const [fh, fm] = f.split(':').map(Number);
  const [th, tm] = t.split(':').map(Number);
  const from = fh * 60 + fm;
  const to2 = th * 60 + tm;
  if (to2 - from - b <= 0) {
    toast('Nettozeit muss positiv sein.');
    return;
  }
  if (editId) {
    const i = ENTRIES.findIndex((e) => e.id === editId);
    ENTRIES[i] = { ...ENTRIES[i], empId, date, from, to: to2, brk: b, note };
    toast('Eintrag aktualisiert ✓');
  } else {
    ENTRIES.push({ id: nextId++, empId, date, from, to: to2, brk: b, note });
    toast('Eintrag gespeichert ✓');
  }
  closeM('moEntry');
  refreshCur();
}
function deleteEntry() {
  if (!editId) return;
  const en = ENTRIES.find((e) => e.id === editId);
  if (en && !isDemoAdmin() && en.empId !== curUser) return;
  ENTRIES = ENTRIES.filter((e) => e.id !== editId);
  closeM('moEntry');
  toast('Eintrag gelöscht');
  refreshCur();
}
function quickDel(id) {
  const en = ENTRIES.find((e) => e.id === id);
  if (en && !isDemoAdmin() && en.empId !== curUser) return;
  if (confirm('Eintrag wirklich löschen?')) {
    ENTRIES = ENTRIES.filter((e) => e.id !== id);
    toast('Eintrag gelöscht');
    refreshCur();
  }
}

function openAddEmp() {
  document.getElementById('moEmp').classList.add('open');
}
function addEmp() {
  const first = document.getElementById('eFirst').value.trim();
  const last = document.getElementById('eLast').value.trim();
  if (!first || !last) {
    toast('Bitte Vor- und Nachname eingeben.');
    return;
  }
  const role = document.getElementById('eRole').value;
  const newId = EMPS.length + 1;
  EMPS.push({
    id: newId,
    first,
    last,
    role,
    rate: +document.getElementById('eRate').value || 35,
    target: +document.getElementById('eTarget').value || 45,
    color: COLS[EMPS.length % COLS.length],
  });
  closeM('moEmp');
  syncUserSwitcher();
  if (role !== 'Admin') teamSelEmpId = newId;
  renderTeam();
  toast(`${first} ${last} hinzugefügt ✓`);
}
function closeM(id) {
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.mo').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('open');
  });
});

function toast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

const demoStartUserIndex = EMPS.findIndex((e) => e.role === 'Admin');
syncUserSwitcher();
switchUser(demoStartUserIndex >= 0 ? demoStartUserIndex : 0);
