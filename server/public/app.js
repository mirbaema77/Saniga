const TOKEN_KEY = 'saniga_token';

let ME = null;
let IS_ADMIN = false;
let EMPS = [];
let ENTRIES = [];
let editId = null;
let curUser = '';
let teamSelEmpId = null;

const MOS = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function monthGermanLabel(ym) {
  const [y, mo] = ym.split('-').map(Number);
  return `${MOS[mo]} ${y}`;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(`/api${path}`, {
    ...opts,
    headers,
    body: opts.body !== undefined ? opts.body : undefined,
  });
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Ungültige Antwort' };
  }
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function mapEmp(u) {
  return {
    id: u.id,
    first: u.firstName,
    last: u.lastName,
    role: u.jobTitle,
    rate: Number(u.hourlyRate),
    target: u.weeklyHours,
    color: u.avatarColor,
  };
}

function mapEntry(e) {
  return {
    id: e.id,
    empId: e.userId,
    date: e.date,
    from: e.fromMinutes,
    to: e.toMinutes,
    brk: e.breakMinutes,
    note: e.note || '',
  };
}

async function loadData() {
  const entRes = await api('/time-entries?from=2020-01-01&to=2030-12-31');
  ENTRIES = entRes.entries.map(mapEntry);
  if (IS_ADMIN) {
    const emRes = await api('/employees');
    EMPS = emRes.employees.map(mapEmp);
  } else {
    EMPS = [mapEmp(ME)];
  }
  fillUserSwitcher();
}

function formatEmpSelectLabel(e) {
  if (!e) return '';
  return `${e.first} ${e.last} (Mitarbeiter)`;
}

function fillUserSwitcher() {
  const s = document.getElementById('userSwitcher');
  if (!s) return;
  s.innerHTML = EMPS.map((e) => `<option value="${e.id}">${formatEmpSelectLabel(e)}</option>`).join('');
  if (curUser && EMPS.some((e) => e.id === curUser)) s.value = curUser;
}

function fillMonthSelects() {
  const sels = [document.getElementById('monSel'), document.getElementById('lMonSel'), document.getElementById('teamMonSel')];
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({ v, label: monthGermanLabel(v) });
  }
  sels.forEach((s) => {
    if (!s) return;
    s.innerHTML = opts.map((o) => `<option value="${o.v}">${o.label}</option>`).join('');
    s.value = currentMonthKey();
  });
}

function syncLohnEditability() {
  const payrollCard = document.querySelector('.payroll-rules-card');
  if (payrollCard) payrollCard.classList.toggle('hidden', !IS_ADMIN);
  const empWrap = document.getElementById('lohnEmpSelWrap');
  if (empWrap) empWrap.classList.toggle('hidden', !IS_ADMIN);
  const roHint = document.getElementById('lohnReadOnlyHint');
  if (roHint) roHint.classList.toggle('hidden', IS_ADMIN);
}

function applyRoleUI() {
  document.querySelectorAll('.admin-only-nav').forEach((el) => {
    if (IS_ADMIN) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
  syncLohnEditability();
}

function ge(id) {
  return EMPS.find((e) => e.id === id);
}

function ini(e) {
  return (e.first[0] + e.last[0]).toUpperCase();
}

function net(en) {
  return en.to - en.from - en.brk;
}

function mStr(m) {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function mDur(m) {
  return m % 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.floor(m / 60)}h`;
}

function fmtD(s) {
  const [y, mo, d] = s.split('-');
  return `${d}.${mo}.${y}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function eEmp(id, m = '') {
  return ENTRIES.filter((e) => e.empId === id && (!m || e.date.startsWith(m)));
}

function totH(id, m = '') {
  return eEmp(id, m).reduce((s, e) => s + net(e), 0) / 60;
}

function teamProfileMonth() {
  const el = document.getElementById('teamMonSel');
  return el && el.value ? el.value : currentMonthKey();
}

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

function syncSidebarFromCur() {
  const e = ge(curUser);
  const av = document.getElementById('sAv');
  const name = document.getElementById('sName');
  const role = document.getElementById('sRole');
  if (e) {
    av.textContent = ini(e);
    av.style.background = e.color;
    name.textContent = `${e.first} ${e.last}`;
    role.textContent = e.role;
  } else {
    av.textContent = (ME.firstName[0] + ME.lastName[0]).toUpperCase();
    av.style.background = ME.avatarColor || '#12B8E1';
    name.textContent = `${ME.firstName} ${ME.lastName}`;
    role.textContent = ME.jobTitle || 'Admin';
  }
}

function switchUser(id) {
  curUser = id;
  const s = document.getElementById('userSwitcher');
  if (s && EMPS.some((e) => e.id === id)) s.value = id;
  syncSidebarFromCur();
  refreshCur();
}

function tick() {
  const n = new Date();
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const mos = MOS;
  document.getElementById('topDate').textContent = `${days[n.getDay()]}, ${n.getDate()}. ${mos[n.getMonth()]} ${n.getFullYear()}`;
}
setInterval(tick, 30000);

const TITLES = {
  meine: 'Meine Zeiten',
  monat: 'Monatsübersicht',
  dashboard: 'Admin Dashboard',
  team: 'Team verwalten',
  lohn: 'Lohnabrechnung',
  alle: 'Alle Einträge',
};

function showView(n) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const el = document.getElementById(`view-${n}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach((i) => {
    i.classList.toggle('active', i.getAttribute('onclick') === `showView('${n}')`);
  });
  document.getElementById('topTitle').textContent = TITLES[n] || '';
  refreshView(n);
}

function refreshCur() {
  const v = document.querySelector('.view.active');
  if (v) refreshView(v.id.replace('view-', ''));
}

function refreshView(n) {
  if (n === 'meine') renderMeine();
  if (n === 'monat') renderMonat();
  if (n === 'dashboard' && IS_ADMIN) renderDash();
  if (n === 'team' && IS_ADMIN) renderTeam();
  if (n === 'lohn') {
    syncLohnEditability();
    if (IS_ADMIN) {
      renderPayrollRulesForm();
      fillLohnSel();
    }
    renderLohn();
  }
  if (n === 'alle' && IS_ADMIN) {
    fillAlleSel();
    renderAlle();
  }
}

function renderMeine() {
  renderWeekStrip();
  const e = ge(curUser);
  const m = currentMonthKey();
  const soll = Math.round((e?.target || 45) * 4);
  const hrs = totH(curUser, m);
  const pct = Math.min(100, Math.round((hrs / soll) * 100) || 0);
  document.getElementById('mMonthLabel').textContent = `${monthGermanLabel(m)} — Fortschritt`;
  document.getElementById('mHrs').textContent = `${hrs.toFixed(1)}h`;
  document.getElementById('mSub').textContent = `von ${soll}h Soll`;
  document.getElementById('mProg').style.width = `${pct}%`;
  document.getElementById('mPct').textContent = `${pct}% erfüllt`;
  document.getElementById('mLohnLabel').textContent = `Erwarteter Lohn ${MOS[+m.split('-')[1]]}`;
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
        <div class="ib" onclick="openEdit('${en.id}')" title="Bearbeiten">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div class="ib del" onclick="quickDel('${en.id}')" title="Löschen">
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
  document.getElementById('monTitle').textContent = `${MOS[+mo]} ${y}`;
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
          <div class="ib" onclick="openEdit('${en.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
          <div class="ib del" onclick="quickDel('${en.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
        </div></td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge für diesen Monat.</td></tr>`;
}

function renderDash() {
  const t = today();
  const m = currentMonthKey();
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

  document.getElementById('dTeam').innerHTML = EMPS.filter((e) => e.rate > 0)
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
  const list = EMPS.filter((x) => x.rate > 0);
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
  document.getElementById('teamProfName').textContent = `${e.first} ${e.last}`;
  document.getElementById('teamProfRole').textContent = e.role;
  document.getElementById('teamProfId').textContent = `#${e.id}`;
  document.getElementById('teamProfRate').textContent = `CHF ${e.rate}.–/h`;
  document.getElementById('teamProfTarget').textContent = `${e.target} h`;
  document.getElementById('teamProfMonthCap').textContent = `Im Monat · ${monthGermanLabel(m)}`;
  document.getElementById('teamProfHours').textContent = `${mH.toFixed(1)} h`;
  document.getElementById('teamProfLohn').textContent = `CHF ${l.toLocaleString('de-CH')}`;
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
    el.classList.toggle('is-selected', el.dataset.emp === String(id));
  });
  renderTeamProfile();
}

async function deleteTeamEmployee() {
  if (!teamSelEmpId) return;
  const e = ge(teamSelEmpId);
  if (!e) return;
  if (!confirm(`Mitarbeiter „${e.first} ${e.last}“ wirklich löschen? Alle Zeiteinträge dieser Person werden mitgelöscht.`)) return;
  const delId = teamSelEmpId;
  const wasCur = curUser === delId;
  try {
    await api(`/employees/${delId}`, { method: 'DELETE' });
    teamSelEmpId = null;
    await loadData();
    if (wasCur) curUser = EMPS.length ? EMPS[0].id : ME.id;
    fillUserSwitcher();
    switchUser(curUser);
    renderTeam();
    toast('Mitarbeiter gelöscht');
  } catch (err) {
    toast(err.message);
  }
}

function renderTeam() {
  const grid = document.getElementById('teamGrid');
  if (!grid) return;
  const list = EMPS.filter((e) => e.rate > 0);
  if (teamSelEmpId != null && !list.some((e) => e.id === teamSelEmpId)) teamSelEmpId = null;
  const m = teamProfileMonth();
  const mLabel = monthGermanLabel(m);
  const monOnly = MOS[+m.split('-')[1]];
  grid.innerHTML = list
    .map((e) => {
      const mH = totH(e.id, m);
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
          <div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">Stunden ${mLabel}</div>
          <div style="font-size:20px;font-weight:800;">${mH.toFixed(1)}h</div>
        </div>
        <div style="background:var(--bg);border-radius:9px;padding:10px 12px;">
          <div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">Lohn ${monOnly}</div>
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
    if (c) openTeamProfile(c.dataset.emp);
  };
  grid.onkeydown = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const c = ev.target.closest('.team-emp-pick');
    if (c) {
      ev.preventDefault();
      openTeamProfile(c.dataset.emp);
    }
  };
  renderTeamProfile();
}

const PAYROLL_STORAGE_KEY = 'saniga_payroll_v1';

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
  if (!IS_ADMIN) return;
  savePayrollRules(payrollRulesFromDOM());
  renderLohn();
}

function exportLohnPdf() {
  window.print();
}

function renderPayrollRulesForm() {
  const rules = loadPayrollRules();
  const sp = document.getElementById('paySpesen');
  if (sp) sp.value = rules.spesenPerEntry;
  const wrap = document.getElementById('payrollDeductionRows');
  if (!wrap) return;
  wrap.innerHTML = rules.deductions.map((d) => payrollDeductionRowHtml(d)).join('');
}

function payrollAddDeduction() {
  if (!IS_ADMIN) return;
  const r = loadPayrollRules();
  r.deductions.push({ id: `d${Date.now()}`, label: 'Neuer Abzug', kind: 'percent', value: 0 });
  savePayrollRules(r);
  renderPayrollRulesForm();
  renderLohn();
}

function payrollRemoveDeduction(id) {
  if (!IS_ADMIN) return;
  const r = loadPayrollRules();
  r.deductions = r.deductions.filter((d) => d.id !== id);
  savePayrollRules(r);
  renderPayrollRulesForm();
  renderLohn();
}

function payrollReset() {
  if (!IS_ADMIN) return;
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
  const empId = IS_ADMIN ? document.getElementById('lEmpSel').value : ME.id;
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
  if (lp) lp.textContent = `Abrechnungszeitraum: ${monthGermanLabel(m)}`;
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
    '<option value="">Alle Mitarbeiter</option>' + EMPS.map((e) => `<option value="${e.id}">${e.first} ${e.last}</option>`).join('');
}

function renderAlle() {
  const eid = document.getElementById('aEmpF').value || '';
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
        <div class="ib" onclick="openEdit('${en.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
        <div class="ib del" onclick="quickDel('${en.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
      </div></td>
    </tr>`;
        })
        .join('')
    : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge gefunden.</td></tr>`;
}

function fillEntryEmp(selId) {
  const s = document.getElementById('eEmp');
  s.innerHTML = EMPS.map((e) => `<option value="${e.id}" ${e.id === selId ? 'selected' : ''}>${formatEmpSelectLabel(e)}</option>`).join('');
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
  if (IS_ADMIN && !EMPS.length) {
    toast('Bitte zuerst unter «Team verwalten» eine Person anlegen.');
    return;
  }
  editId = null;
  fillEntryEmp(IS_ADMIN ? curUser : ME.id);
  document.getElementById('mEntryTitle').textContent = 'Stunden erfassen';
  document.getElementById('mEntrySub').textContent =
    'Du kannst Einträge für jeden beliebigen Tag hinzufügen — auch nachträglich.';
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

async function saveEntry() {
  const empId = document.getElementById('eEmp').value;
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
  const payload = {
    date,
    fromMinutes: from,
    toMinutes: to2,
    breakMinutes: b,
    note,
  };
  try {
    if (editId) {
      if (IS_ADMIN) payload.userId = empId;
      await api(`/time-entries/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast('Eintrag aktualisiert ✓');
    } else {
      const body = { ...payload };
      if (IS_ADMIN) body.userId = empId;
      await api('/time-entries', { method: 'POST', body: JSON.stringify(body) });
      toast('Eintrag gespeichert ✓');
    }
    await loadData();
    closeM('moEntry');
    refreshCur();
  } catch (e) {
    toast(e.message);
  }
}

async function deleteEntry() {
  if (!editId) return;
  try {
    await api(`/time-entries/${editId}`, { method: 'DELETE' });
    await loadData();
    closeM('moEntry');
    toast('Eintrag gelöscht');
    refreshCur();
  } catch (e) {
    toast(e.message);
  }
}

async function quickDel(id) {
  if (!confirm('Eintrag wirklich löschen?')) return;
  try {
    await api(`/time-entries/${id}`, { method: 'DELETE' });
    await loadData();
    toast('Eintrag gelöscht');
    refreshCur();
  } catch (e) {
    toast(e.message);
  }
}

function openAddEmp() {
  document.getElementById('eEmail').value = '';
  document.getElementById('ePass').value = '';
  document.getElementById('eFirst').value = '';
  document.getElementById('eLast').value = '';
  document.getElementById('eRate').value = '35';
  document.getElementById('eTarget').value = '45';
  document.getElementById('moEmp').classList.add('open');
}

async function addEmp() {
  const first = document.getElementById('eFirst').value.trim();
  const last = document.getElementById('eLast').value.trim();
  const email = document.getElementById('eEmail').value.trim();
  const password = document.getElementById('ePass').value;
  if (!first || !last || !email || !password) {
    toast('Bitte E-Mail, Passwort, Vor- und Nachname eingeben.');
    return;
  }
  if (password.length < 8) {
    toast('Passwort mindestens 8 Zeichen.');
    return;
  }
  try {
    await api('/employees', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        firstName: first,
        lastName: last,
        jobTitle: document.getElementById('eRole').value,
        hourlyRate: +document.getElementById('eRate').value || 35,
        weeklyHours: +document.getElementById('eTarget').value || 45,
      }),
    });
    await loadData();
    closeM('moEmp');
    toast(`${first} ${last} hinzugefügt ✓`);
    const ne = EMPS.find((x) => x.first === first && x.last === last);
    if (ne && ne.rate > 0) teamSelEmpId = ne.id;
    renderTeam();
  } catch (e) {
    toast(e.message);
  }
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

function initAfterLogin() {
  fillMonthSelects();
  const cm = currentMonthKey();
  const [y, mo] = cm.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  document.getElementById('aFrom').value = `${cm}-01`;
  document.getElementById('aTo').value = `${cm}-${String(last).padStart(2, '0')}`;
  applyRoleUI();
  document.getElementById('eEmpFg').classList.toggle('hidden', !IS_ADMIN);
  document.getElementById('eDateFg').classList.toggle('full', !IS_ADMIN);
  if (IS_ADMIN && EMPS.length) {
    curUser = EMPS[0].id;
    fillUserSwitcher();
    document.getElementById('userSwitcher').value = curUser;
  } else {
    curUser = ME.id;
    fillUserSwitcher();
  }
  syncSidebarFromCur();
  tick();
  showView('meine');
}

async function doLogin() {
  const err = document.getElementById('loginErr');
  err.style.display = 'none';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Anmeldung fehlgeschlagen');
    localStorage.setItem(TOKEN_KEY, j.token);
    ME = j.user;
    IS_ADMIN = ME.role === 'ADMIN';
    await loadData();
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('mainApp').classList.add('visible');
    initAfterLogin();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
}

async function trySession() {
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return;
  try {
    const j = await api('/auth/me');
    ME = j.user;
    IS_ADMIN = ME.role === 'ADMIN';
    await loadData();
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('mainApp').classList.add('visible');
    initAfterLogin();
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  window.location.reload();
});

trySession();
