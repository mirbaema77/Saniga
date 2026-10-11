const TOKEN_KEY = 'saniga_token';

let ME = null;
let IS_ADMIN = false;
let EMPS = [];
let ENTRIES = [];
let CUSTOMERS = [];
let SITES = [];
let WORK_TYPES = [];
let COMPANY = null;
let RATES = [];
let editId = null;
let curUser = '';
let teamSelEmpId = null;
let sdTab = 'kunden';
let reportMode = 'open';
let reportFrom = '';
let reportTo = '';
let reportCustomerId = '';
let reportWorkTypeId = '';
let reportInvoiceFlash = null;
let pendingReportInvoice = null;
let lastReportsData = null;
let pendingEntrySave = null;
let entrySyncTimer = null;
let entriesFingerprint = '';
let masterFingerprint = '';
let suppressRemoteToastUntil = 0;
let syncInFlight = false;
const ENTRY_SYNC_MS = 30000;

const MOS = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function currentMonthKey() {
  const ymd = IsoWeek.zonedYmd(new Date());
  return ymd.slice(0, 7);
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
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

function mapEmp(u) {
  return {
    id: u.id,
    first: u.firstName,
    last: u.lastName,
    role: u.jobTitle,
    userRole: u.role || 'EMPLOYEE',
    rate: Number(u.hourlyRate),
    target: u.weeklyHours,
    isTimeTracked: u.isTimeTracked !== false,
    color: u.avatarColor,
  };
}

/** Fallback if API omits the logged-in admin (should be included when isTimeTracked). */
function ensureSelfInEmps() {
  if (!IS_ADMIN || !ME) return;
  if (EMPS.some((e) => e.id === ME.id)) return;
  if (ME.isTimeTracked === false) return;
  EMPS = [mapEmp(ME), ...EMPS];
}

function trackedEmps() {
  return EMPS.filter((e) => e.isTimeTracked !== false);
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
    siteId: e.siteId || null,
    workTypeId: e.workTypeId || null,
    hours: e.hours == null ? null : Number(e.hours),
    invoiceId: e.invoiceId || null,
    invoiceNumber: e.invoiceNumber || null,
    billable: e.billable !== false,
    workTypeLabel: e.workTypeLabel || null,
    absenceGroupId: e.absenceGroupId || null,
  };
}

function fingerprintEntries(list) {
  return list
    .map((e) =>
      [e.id, e.empId, e.date, e.from, e.to, e.brk, e.hours, e.siteId, e.workTypeId, e.note].join(':')
    )
    .sort()
    .join('|');
}

function fingerprintMaster(customers, sites, workTypes) {
  const c = (customers || [])
    .map((x) => `${x.id}:${x.name}:${x.paymentTermDays ?? ''}`)
    .sort()
    .join('|');
  const s = (sites || [])
    .map(
      (x) =>
        `${x.id}:${x.customerId || ''}:${x.label}:${x.active !== false ? 1 : 0}:${x.objectNumber || ''}`
    )
    .sort()
    .join('|');
  const w = (workTypes || [])
    .map(
      (x) =>
        `${x.id}:${x.label}:${x.active !== false ? 1 : 0}:${x.billable !== false ? 1 : 0}`
    )
    .sort()
    .join('|');
  return `${c}#${s}#${w}`;
}

function markLocalEntriesState() {
  entriesFingerprint = fingerprintEntries(ENTRIES);
  masterFingerprint = fingerprintMaster(CUSTOMERS, SITES, WORK_TYPES);
  suppressRemoteToastUntil = Date.now() + 8000;
}

/** Fetch customers, sites, work types into memory. Returns true if data changed. */
async function fetchMasterData() {
  const [cRes, sRes, wRes] = await Promise.all([
    api('/customers'),
    api('/sites'),
    api('/work-types'),
  ]);
  const nextC = cRes.customers || [];
  const nextS = sRes.sites || [];
  const nextW = wRes.workTypes || [];
  const fp = fingerprintMaster(nextC, nextS, nextW);
  const changed = fp !== masterFingerprint;
  CUSTOMERS = nextC;
  SITES = nextS;
  WORK_TYPES = nextW;
  masterFingerprint = fp;
  return changed;
}

/**
 * Re-apply master data to the active view without wiping half-edited Stammdaten forms.
 */
function applyMasterDataRefresh() {
  const view = document.querySelector('.view.active');
  const n = view ? view.id.replace('view-', '') : '';
  if (n === 'alle') {
    fillAlleSel();
    renderAlleTable();
    return;
  }
  if (n === 'rapporte') {
    fillReportFilterSelects();
    syncReportFilterUi();
    updateReportFilterSummary();
    return;
  }
  if (n === 'absenzen') {
    renderAbsenzen();
  }
  if (n === 'profil') {
    renderProfil();
  }
  if (n === 'stammdaten' && IS_ADMIN) {
    const editing = document.querySelector(
      '#view-stammdaten input:focus, #view-stammdaten select:focus, #view-stammdaten textarea:focus'
    );
    if (!editing) {
      showStammdatenTab(sdTab || 'kunden');
    }
  }
}

function notifyEntrySync(prev, next) {
  const prevIds = new Set(prev.map((e) => e.id));
  const nextIds = new Set(next.map((e) => e.id));
  const added = next.filter((e) => !prevIds.has(e.id));
  const removed = prev.filter((e) => !nextIds.has(e.id));
  const changed = next.filter((e) => {
    const old = prev.find((p) => p.id === e.id);
    return old && fingerprintEntries([old]) !== fingerprintEntries([e]);
  });
  if (!added.length && !removed.length && !changed.length) return;

  if (IS_ADMIN) {
    if (added.length === 1) toast('Neuer Zeiteintrag vom Team');
    else if (added.length > 1) toast(`${added.length} neue Zeiteinträge vom Team`);
    else if (changed.length) toast('Zeiteinträge vom Team aktualisiert');
    else toast('Zeiteintrag vom Team entfernt');
  } else if (added.length === 1) {
    toast('Geschäftsführung hat einen Zeiteintrag hinzugefügt');
  } else if (added.length > 1) {
    toast(`Geschäftsführung hat ${added.length} Zeiteinträge hinzugefügt`);
  } else if (changed.length) {
    toast('Geschäftsführung hat einen Zeiteintrag geändert');
  } else {
    toast('Geschäftsführung hat einen Zeiteintrag entfernt');
  }
}

async function pollRemoteEntries() {
  if (!ME || syncInFlight) return;
  // Skip while a modal is open so half-filled forms / dropdowns are not rebuilt mid-edit.
  if (document.querySelector('.mo.open')) return;
  syncInFlight = true;
  try {
    let masterChanged = false;
    try {
      masterChanged = await fetchMasterData();
    } catch {
      /* keep cached master data */
    }

    const entRes = await api('/time-entries?from=2020-01-01&to=2030-12-31');
    const next = entRes.entries.map(mapEntry);
    const fp = fingerprintEntries(next);
    const entriesChanged = fp !== entriesFingerprint;

    if (entriesChanged) {
      const prev = ENTRIES.slice();
      const hadState = Boolean(entriesFingerprint);
      ENTRIES = next;

      if (IS_ADMIN) {
        try {
          const emRes = await api('/employees');
          EMPS = emRes.employees.map(mapEmp);
          ensureSelfInEmps();
          fillUserSwitcher();
        } catch {
          /* keep existing EMPS */
        }
      }

      const allowToast = hadState && Date.now() >= suppressRemoteToastUntil;
      entriesFingerprint = fp;
      if (allowToast) notifyEntrySync(prev, next);
      refreshCur();
    } else if (masterChanged) {
      applyMasterDataRefresh();
    }
  } catch {
    /* ignore transient network errors */
  } finally {
    syncInFlight = false;
  }
}

function startEntrySync() {
  stopEntrySync();
  markLocalEntriesState();
  entrySyncTimer = setInterval(pollRemoteEntries, ENTRY_SYNC_MS);
}

function stopEntrySync() {
  if (entrySyncTimer) {
    clearInterval(entrySyncTimer);
    entrySyncTimer = null;
  }
}

async function loadData() {
  const entRes = await api('/time-entries?from=2020-01-01&to=2030-12-31');
  ENTRIES = entRes.entries.map(mapEntry);
  if (IS_ADMIN) {
    const emRes = await api('/employees');
    EMPS = emRes.employees.map(mapEmp);
    ensureSelfInEmps();
  } else {
    EMPS = [mapEmp(ME)];
  }
  try {
    await fetchMasterData();
  } catch {
    /* dropdowns filled when opening the form */
  }
  fillUserSwitcher();
  markLocalEntriesState();
}

function formatEmpSelectLabel(e) {
  if (!e) return '';
  const tag = e.userRole === 'ADMIN' ? 'Admin' : 'Mitarbeiter';
  return `${e.first} ${e.last} (${tag})`;
}

function fillUserSwitcher() {
  const s = document.getElementById('userSwitcher');
  if (!s) return;
  s.innerHTML = EMPS.map((e) => `<option value="${e.id}">${formatEmpSelectLabel(e)}</option>`).join('');
  if (curUser && EMPS.some((e) => e.id === curUser)) s.value = curUser;
}

function fillMonthSelects() {
  const sels = [
    document.getElementById('monSel'),
    document.getElementById('lMonSel'),
    document.getElementById('teamMonSel'),
    document.getElementById('exMonSel'),
    document.getElementById('absMonSel'),
  ];
  const [zy, zm] = IsoWeek.zonedYmd(new Date()).split('-').map(Number);
  const opts = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(zy, zm - 1 - i, 1);
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
  // syncLohnEditability(); // payroll UI hidden — Treuhänder handles Lohn
}

function ge(id) {
  return EMPS.find((e) => e.id === id);
}

function ini(e) {
  return (e.first[0] + e.last[0]).toUpperCase();
}

function net(en) {
  if (en.hours != null && !Number.isNaN(Number(en.hours))) {
    return Math.round(Number(en.hours) * 60);
  }
  return en.to - en.from - en.brk;
}

function entrySiteParts(en) {
  const site = SITES.find((s) => s.id === en.siteId);
  if (!site) return { customer: '', site: '' };
  const customer =
    site.customer?.name || CUSTOMERS.find((c) => c.id === site.customerId)?.name || '';
  return { customer, site: site.label || '' };
}

function entrySiteLabel(en) {
  const parts = entrySiteParts(en);
  if (!parts.site && !parts.customer) return '';
  return parts.customer ? `${parts.customer} — ${parts.site}` : parts.site;
}

function fmtDShort(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtD(s);
  const [y, mo, d] = s.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).getUTCDay();
  const ns = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${ns[weekday]}, ${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.`;
}

function entryWorkLabel(en) {
  if (en.workTypeLabel) return en.workTypeLabel;
  const wt = WORK_TYPES.find((w) => w.id === en.workTypeId);
  return wt ? wt.label : '';
}

function isAbsenceEntry(en) {
  return en.billable === false;
}

function entryObjektCell(en) {
  if (isAbsenceEntry(en)) {
    return `${escapeAttr(entryWorkLabel(en) || 'Absenz')}<span class="entry-abs-badge">Absenz</span>`;
  }
  return escapeAttr(entrySiteLabel(en) || '—');
}

function entryHoursValue(en) {
  if (en.hours != null && !Number.isNaN(Number(en.hours))) return Number(en.hours);
  return Math.round((net(en) / 60) * 100) / 100;
}

function isLegacyEntry(en) {
  return en.hours == null;
}

function isEntryInvoiced(en) {
  return !!(en.invoiceId && en.invoiceNumber);
}

function entryStatusLabel(en) {
  if (en.billable === false) return 'Nicht verrechenbar';
  if (isEntryInvoiced(en)) return en.invoiceNumber;
  return 'Offen';
}

function entryActionButtonsHtml(en) {
  if (isEntryInvoiced(en)) {
    const tip = escapeAttr(`Verrechnet auf Rechnung ${en.invoiceNumber}`);
    return `<div class="entry-acts">
      <div class="entry-acts-icons" title="${tip}">
        <div class="ib disabled" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div class="ib del disabled" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </div>
      </div>
      <div class="entry-acts-btns">
        <button type="button" class="btn btn-g" disabled title="${tip}">Bearbeiten</button>
        <button type="button" class="btn btn-d" disabled title="${tip}">Löschen</button>
      </div>
    </div>`;
  }
  const id = escapeAttr(en.id);
  return `<div class="entry-acts">
    <div class="entry-acts-icons">
      <button type="button" class="ib" onclick="openEdit('${id}')" title="Bearbeiten" aria-label="Bearbeiten">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button type="button" class="ib del" onclick="quickDel('${id}')" title="Löschen" aria-label="Löschen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
    <div class="entry-acts-btns">
      <button type="button" class="btn btn-g" onclick="openEdit('${id}')">Bearbeiten</button>
      <button type="button" class="btn btn-d" onclick="quickDel('${id}')">Löschen</button>
    </div>
  </div>`;
}

function entryTimeLabel(en) {
  if (en.hours != null && !Number.isNaN(Number(en.hours))) {
    const h = Number(en.hours);
    return `${h % 1 ? h.toFixed(1) : h}h`;
  }
  return `${mStr(en.from)} – ${mStr(en.to)}`;
}

function mStr(m) {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function mDur(m) {
  return m % 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.floor(m / 60)}h`;
}

/** Shared hour display for dashboard + reports: one decimal, German comma, "h" suffix. */
function formatHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n)) return '0,0 h';
  return `${n.toFixed(1).replace('.', ',')} h`;
}

function formatHoursFromMinutes(mins) {
  return formatHours((Number(mins) || 0) / 60);
}

function fmtD(s) {
  const [y, mo, d] = s.split('-');
  return `${d}.${mo}.${y}`;
}

function today() {
  return IsoWeek.zonedYmd(new Date());
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
  return IsoWeek.datesInCurrentIsoWeek(new Date());
}

function kw(s) {
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : IsoWeek.zonedYmd(new Date(s));
  return IsoWeek.getISOWeekPartsFromYmd(ymd).week;
}

/** Sidebar always shows the logged-in account (admin stays admin even when viewing an employee). */
function syncSidebarFromCur() {
  if (!ME) return;
  const fullName = `${ME.firstName} ${ME.lastName}`;
  const roleLbl = ME.jobTitle || (ME.role === 'ADMIN' ? 'Admin' : 'Mitarbeiter');
  const av = document.getElementById('sAv');
  const name = document.getElementById('sName');
  const role = document.getElementById('sRole');
  if (av) {
    av.textContent = (ME.firstName[0] + ME.lastName[0]).toUpperCase();
    av.style.background = ME.avatarColor || '#12B8E1';
  }
  if (name) name.textContent = fullName;
  if (role) role.textContent = roleLbl;
  const topName = document.getElementById('topUserName');
  if (topName) topName.textContent = fullName;
}

function switchUser(id) {
  curUser = id;
  const s = document.getElementById('userSwitcher');
  if (s && EMPS.some((e) => e.id === id)) s.value = id;
  refreshCur();
}

function tick() {
  const ymd = IsoWeek.zonedYmd(new Date());
  const [y, mo, d] = ymd.split('-').map(Number);
  // Weekday for the Zurich civil date (UTC noon avoids DST edge cases)
  const weekday = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).getUTCDay();
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  document.getElementById('topDate').textContent = `${days[weekday]}, ${d}. ${MOS[mo]} ${y}`;
}
setInterval(tick, 30000);

const TITLES = {
  meine: 'Meine Zeiten',
  monat: 'Monatsübersicht',
  dashboard: 'Admin Dashboard',
  team: 'Team verwalten',
  stammdaten: 'Stammdaten',
  // lohn: 'Lohnabrechnung', // hidden — external Treuhänder
  alle: 'Alle Einträge',
  rapporte: 'Rapporte',
  rechnungen: 'Rechnungen',
  stundenexport: 'Stundenexport',
  absenzen: 'Absenzen',
  profil: 'Profil',
};

let activeViewName = '';

function syncMobileChrome(n) {
  document.querySelectorAll('.mbnav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === n);
  });
  const fab = document.getElementById('mobileFab');
  if (fab) {
    const showFab = n === 'meine';
    fab.classList.toggle('show', showFab);
    fab.setAttribute('aria-hidden', showFab ? 'false' : 'true');
    fab.tabIndex = showFab ? 0 : -1;
  }
  document.body.classList.toggle('mobile-meine-open', n === 'meine');
}

function showView(n) {
  if (!n) return;
  // Same tab: only refresh chrome, don't re-fetch (avoids “dead” taps while sync runs).
  if (n === activeViewName) {
    syncMobileChrome(n);
    return;
  }
  activeViewName = n;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const el = document.getElementById(`view-${n}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach((i) => {
    i.classList.toggle('active', i.getAttribute('onclick') === `showView('${n}')`);
  });
  const titleEl = document.getElementById('topTitle');
  if (titleEl) titleEl.textContent = TITLES[n] || '';
  syncMobileChrome(n);
  if (n === 'profil') renderProfil();
  else refreshView(n);
}

/** Instant bottom-nav response on iPhone (pointerdown, no click delay / swallowed first tap). */
function bindMobileBottomNav() {
  const nav = document.getElementById('mobileBottomNav');
  if (!nav || nav.dataset.bound === '1') return;
  nav.dataset.bound = '1';
  let lastPointerView = '';
  let lastPointerAt = 0;

  function go(btn) {
    if (!btn || !nav.contains(btn)) return false;
    const view = btn.getAttribute('data-view');
    if (!view) return false;
    btn.classList.add('is-pressed');
    showView(view);
    return true;
  }

  nav.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const btn = e.target.closest('.mbnav-item');
      if (!go(btn)) return;
      lastPointerView = btn.getAttribute('data-view') || '';
      lastPointerAt = Date.now();
      // Stop the delayed click that iOS fires afterwards (felt like “tap does nothing”).
      e.preventDefault();
    },
    { passive: false }
  );

  const clearPressed = () => {
    nav.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
  };
  nav.addEventListener('pointerup', clearPressed);
  nav.addEventListener('pointercancel', clearPressed);
  nav.addEventListener('pointerleave', clearPressed);

  // Keyboard / desktop fallback when pointerdown was not used
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.mbnav-item');
    if (!btn || !nav.contains(btn)) return;
    e.preventDefault();
    const view = btn.getAttribute('data-view') || '';
    if (view && view === lastPointerView && Date.now() - lastPointerAt < 450) return;
    go(btn);
  });
}

function refreshCur() {
  const v = document.querySelector('.view.active');
  if (v) refreshView(v.id.replace('view-', ''));
}

function refreshView(n) {
  if (n === 'meine') renderMeine();
  if (n === 'monat') renderMonat();
  if (n === 'profil') renderProfil();
  if (n === 'dashboard' && IS_ADMIN) renderDash();
  if (n === 'team' && IS_ADMIN) renderTeam();
  // Payroll view hidden (Treuhänder). Uncomment with nav/view to restore.
  // if (n === 'lohn') {
  //   syncLohnEditability();
  //   if (IS_ADMIN) {
  //     renderPayrollRulesForm();
  //     fillLohnSel();
  //   }
  //   renderLohn();
  // }
  if (n === 'stundenexport' && IS_ADMIN) {
    loadHoursExport();
  }
  if (n === 'absenzen') {
    renderAbsenzen();
  }
  if (n === 'alle' && IS_ADMIN) {
    fillAlleSel();
    renderAlle();
  }
  if (n === 'stammdaten' && IS_ADMIN) {
    loadStammdaten();
  }
  if (n === 'rapporte' && IS_ADMIN) {
    loadReports();
  }
  if (n === 'rechnungen' && IS_ADMIN) {
    loadInvoices();
  }
}

function showProfilErr(msg) {
  const el = document.getElementById('pProfileErr');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function renderProfil() {
  if (!ME) return;
  const av = document.getElementById('pAv');
  const name = document.getElementById('pName');
  const role = document.getElementById('pRole');
  const email = document.getElementById('pEmail');
  const sync = document.getElementById('pSyncStatus');
  const first = document.getElementById('pFirstName');
  const last = document.getElementById('pLastName');
  if (av) {
    av.textContent = `${(ME.firstName || '?')[0]}${(ME.lastName || '?')[0]}`.toUpperCase();
    av.style.background = ME.avatarColor || '#12B8E1';
  }
  if (name) name.textContent = `${ME.firstName} ${ME.lastName}`;
  if (role) role.textContent = ME.jobTitle || (ME.role === 'ADMIN' ? 'Admin' : 'Mitarbeiter');
  if (email) email.textContent = ME.email || '—';
  if (first && document.activeElement !== first) first.value = ME.firstName || '';
  if (last && document.activeElement !== last) last.value = ME.lastName || '';
  if (sync) {
    const sites = SITES.filter((s) => s.active !== false).length;
    const types = WORK_TYPES.filter((w) => w.active !== false).length;
    sync.textContent = `${sites} Objekte · ${types} Arbeitsarten geladen`;
  }
  showProfilErr('');
}

async function saveProfilSettings() {
  if (!ME) return;
  showProfilErr('');
  const firstName = (document.getElementById('pFirstName')?.value || '').trim();
  const lastName = (document.getElementById('pLastName')?.value || '').trim();
  const currentPassword = document.getElementById('pCurrentPassword')?.value || '';
  const newPassword = document.getElementById('pNewPassword')?.value || '';
  const newPassword2 = document.getElementById('pNewPassword2')?.value || '';
  if (!firstName || !lastName) {
    showProfilErr('Vor- und Nachname sind erforderlich.');
    return;
  }
  if (newPassword || newPassword2 || currentPassword) {
    if (newPassword.length < 8) {
      showProfilErr('Neues Passwort mindestens 8 Zeichen.');
      return;
    }
    if (newPassword !== newPassword2) {
      showProfilErr('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    if (!currentPassword) {
      showProfilErr('Aktuelles Passwort eingeben, um das Passwort zu ändern.');
      return;
    }
  }
  const body = { firstName, lastName };
  if (newPassword) {
    body.currentPassword = currentPassword;
    body.newPassword = newPassword;
  }
  const btn = document.getElementById('pSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Speichern…';
  }
  try {
    const res = await api('/auth/me', { method: 'PATCH', body: JSON.stringify(body) });
    ME = res.user;
    syncSidebarFromCur();
    if (document.getElementById('pCurrentPassword')) document.getElementById('pCurrentPassword').value = '';
    if (document.getElementById('pNewPassword')) document.getElementById('pNewPassword').value = '';
    if (document.getElementById('pNewPassword2')) document.getElementById('pNewPassword2').value = '';
    renderProfil();
    toast(newPassword ? 'Profil und Passwort gespeichert' : 'Profil gespeichert');
  } catch (e) {
    showProfilErr(e.message || 'Speichern fehlgeschlagen');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Änderungen speichern';
    }
  }
}

function doLogout() {
  stopEntrySync();
  localStorage.removeItem(TOKEN_KEY);
  window.location.reload();
}

async function refreshProfilMasterData() {
  const btn = document.getElementById('pSyncBtn');
  const sync = document.getElementById('pSyncStatus');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Aktualisiere…';
  }
  try {
    await ensureEntryMasterData();
    await loadData();
    renderProfil();
    if (sync) {
      sync.textContent = `${SITES.filter((s) => s.active !== false).length} Objekte · ${WORK_TYPES.filter((w) => w.active !== false).length} Arbeitsarten · gerade aktualisiert`;
    }
    toast('Stammdaten synchronisiert');
  } catch (e) {
    toast(e.message || 'Synchronisation fehlgeschlagen');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Jetzt synchronisieren';
    }
  }
}

function formatReportHours(h) {
  return formatHours(h);
}

function ensureReportRangeDefaults() {
  if (reportFrom && reportTo) return;
  const cur = IsoWeek.getISOWeekParts(new Date());
  const b = IsoWeek.isoWeekBounds(cur.year, cur.week);
  reportFrom = b.from;
  reportTo = b.to;
}

function fillReportFilterSelects() {
  const custSel = document.getElementById('rpCustomer');
  const wtSel = document.getElementById('rpWorkType');
  if (custSel) {
    const prev = reportCustomerId || custSel.value || '';
    custSel.innerHTML =
      `<option value="">Alle</option>` +
      CUSTOMERS.map((c) => `<option value="${escapeAttr(c.id)}">${escapeAttr(c.name)}</option>`).join('');
    if (prev) custSel.value = prev;
    reportCustomerId = custSel.value;
  }
  if (wtSel) {
    const prev = reportWorkTypeId || wtSel.value || '';
    const types = WORK_TYPES.filter((w) => w.active !== false);
    const selected = prev ? WORK_TYPES.find((w) => w.id === prev) : null;
    let html =
      `<option value="">Alle</option>` +
      types.map((w) => `<option value="${escapeAttr(w.id)}">${escapeAttr(w.label)}</option>`).join('');
    if (selected && selected.active === false) {
      html += `<option value="${escapeAttr(selected.id)}">${escapeAttr(selected.label)} (inaktiv)</option>`;
    }
    wtSel.innerHTML = html;
    if (prev) wtSel.value = prev;
    reportWorkTypeId = wtSel.value;
  }
}

function syncReportFilterUi() {
  const openBtn = document.getElementById('rpModeOpen');
  const rangeBtn = document.getElementById('rpModeRange');
  const rangeRow = document.getElementById('rpRangeRow');
  const fromEl = document.getElementById('rpFrom');
  const toEl = document.getElementById('rpTo');
  if (openBtn) openBtn.classList.toggle('active', reportMode === 'open');
  if (rangeBtn) rangeBtn.classList.toggle('active', reportMode === 'range');
  if (rangeRow) rangeRow.style.display = reportMode === 'range' ? 'flex' : 'none';
  if (fromEl) fromEl.value = reportFrom || '';
  if (toEl) toEl.value = reportTo || '';
  const custSel = document.getElementById('rpCustomer');
  const wtSel = document.getElementById('rpWorkType');
  if (custSel) custSel.value = reportCustomerId || '';
  if (wtSel) wtSel.value = reportWorkTypeId || '';
}

function reportFilterSummaryText() {
  const modeLabel = reportMode === 'open' ? 'Offene Stunden' : 'Zeitraum';
  let rangePart = '';
  if (reportMode === 'range' && reportFrom && reportTo) {
    rangePart = ` · ${IsoWeek.formatDe(reportFrom)}–${IsoWeek.formatDe(reportTo)}`;
  }
  const cust = CUSTOMERS.find((c) => c.id === reportCustomerId);
  const custLabel = cust ? cust.name : 'alle Kunden';
  const wt = WORK_TYPES.find((w) => w.id === reportWorkTypeId);
  const wtLabel = wt ? `Arbeitsart: ${wt.label}` : 'alle Arbeitsarten';
  return `${modeLabel}${rangePart} · ${custLabel} · ${wtLabel}`;
}

function updateReportFilterSummary() {
  const el = document.getElementById('rpFilterSummary');
  if (el) el.textContent = reportFilterSummaryText();
}

function setReportMode(mode) {
  reportMode = mode === 'range' ? 'range' : 'open';
  if (reportMode === 'range') ensureReportRangeDefaults();
  syncReportFilterUi();
  loadReports();
}

function setReportPreset(kind) {
  const today = IsoWeek.zonedYmd(new Date());
  if (kind === 'thisWeek') {
    const cur = IsoWeek.getISOWeekParts(new Date());
    const b = IsoWeek.isoWeekBounds(cur.year, cur.week);
    reportFrom = b.from;
    reportTo = b.to;
  } else if (kind === 'lastWeek') {
    const cur = IsoWeek.getISOWeekParts(new Date());
    const prev = IsoWeek.shiftIsoWeek(cur.year, cur.week, -1);
    const b = IsoWeek.isoWeekBounds(prev.year, prev.week);
    reportFrom = b.from;
    reportTo = b.to;
  } else if (kind === 'thisMonth') {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    reportFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    reportTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  reportMode = 'range';
  syncReportFilterUi();
  loadReports();
}

function onReportFilterChange() {
  const fromEl = document.getElementById('rpFrom');
  const toEl = document.getElementById('rpTo');
  const custSel = document.getElementById('rpCustomer');
  const wtSel = document.getElementById('rpWorkType');
  if (fromEl) reportFrom = fromEl.value || '';
  if (toEl) reportTo = toEl.value || '';
  if (custSel) reportCustomerId = custSel.value || '';
  if (wtSel) reportWorkTypeId = wtSel.value || '';
  loadReports();
}

function billableOpenEntries(entries) {
  return (entries || []).filter(
    (en) => !en.invoiceId && !en.invoiceNumber && en.billable !== false && Number(en.hours) > 0
  );
}

async function ensureReportFilterData() {
  if (CUSTOMERS.length && WORK_TYPES.length) return;
  await fetchMasterData();
}

async function loadReports() {
  if (!IS_ADMIN) return;
  const body = document.getElementById('rpBody');
  if (body) {
    body.innerHTML = `<div class="card rp-empty">Lade Rapporte…</div>`;
  }
  try {
    await ensureReportFilterData();
    fillReportFilterSelects();
    if (reportMode === 'range') ensureReportRangeDefaults();
    syncReportFilterUi();
    updateReportFilterSummary();
    const params = new URLSearchParams({ mode: reportMode });
    if (reportMode === 'range') {
      if (!reportFrom || !reportTo) {
        throw new Error('Bitte Von- und Bis-Datum wählen');
      }
      params.set('from', reportFrom);
      params.set('to', reportTo);
    }
    if (reportCustomerId) params.set('customerId', reportCustomerId);
    if (reportWorkTypeId) params.set('workTypeId', reportWorkTypeId);
    const data = await api(`/reports?${params.toString()}`);
    lastReportsData = data;
    updateReportFilterSummary();
    renderReports(data);
  } catch (e) {
    lastReportsData = null;
    if (body) {
      body.innerHTML = `<div class="card rp-empty" style="color:var(--red);">${escapeAttr(e.message)}</div>`;
    }
  }
}

function formatHoursDeCsv(n) {
  return (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
}

async function loadHoursExport() {
  if (!IS_ADMIN) return;
  const sel = document.getElementById('exMonSel');
  const body = document.getElementById('exBody');
  const title = document.getElementById('exTitle');
  const badge = document.getElementById('exTotalBadge');
  if (!sel || !body) return;
  if (!sel.options.length) fillMonthSelects();
  const month = sel.value || currentMonthKey();
  if (title) title.textContent = `Stundenexport · ${monthGermanLabel(month)}`;
  body.innerHTML = `<div class="rp-empty" style="box-shadow:none;border:none;">Lade…</div>`;
  try {
    const data = await api(`/exports/hours?month=${encodeURIComponent(month)}&format=json`);
    const rows = data.rows || [];
    const totals = data.totals || { hoursTotal: 0, hoursBillable: 0, hoursNonBillable: 0 };
    if (badge) badge.textContent = `${formatHoursDeCsv(totals.hoursTotal)} h`;
    if (!rows.length) {
      body.innerHTML = `<div class="rp-empty" style="box-shadow:none;border:none;">Keine zeitverfolgten Mitarbeiter.</div>`;
      return;
    }
    const tableRows = rows
      .map(
        (r) => `<tr>
        <td>${escapeAttr(r.employeeName)}</td>
        <td class="mono" style="color:var(--t3);">${escapeAttr(r.personnelNumber || '—')}</td>
        <td class="mono">${escapeAttr(r.month)}</td>
        <td class="mono">${escapeAttr(formatHoursDeCsv(r.hoursTotal))}</td>
        <td class="mono">${escapeAttr(formatHoursDeCsv(r.hoursBillable))}</td>
        <td class="mono">${escapeAttr(formatHoursDeCsv(r.hoursNonBillable))}</td>
      </tr>`
      )
      .join('');
    body.innerHTML = `<table>
      <thead><tr>
        <th>Mitarbeiter</th><th>Personalnummer</th><th>Monat</th>
        <th>Stunden total</th><th>davon verrechenbar</th><th>davon nicht verrechenbar</th>
      </tr></thead>
      <tbody>${tableRows}
        <tr style="font-weight:800;background:rgba(240,242,247,.85);">
          <td colspan="3">Total</td>
          <td class="mono">${escapeAttr(formatHoursDeCsv(totals.hoursTotal))}</td>
          <td class="mono">${escapeAttr(formatHoursDeCsv(totals.hoursBillable))}</td>
          <td class="mono">${escapeAttr(formatHoursDeCsv(totals.hoursNonBillable))}</td>
        </tr>
      </tbody>
    </table>`;
  } catch (e) {
    body.innerHTML = `<div class="rp-empty" style="color:var(--red);box-shadow:none;border:none;">${escapeAttr(e.message)}</div>`;
  }
}

async function downloadHoursExportCsv() {
  if (!IS_ADMIN) return;
  const sel = document.getElementById('exMonSel');
  const month = (sel && sel.value) || currentMonthKey();
  const t = localStorage.getItem(TOKEN_KEY);
  try {
    const r = await fetch(`/api/exports/hours?month=${encodeURIComponent(month)}&format=csv`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || 'Export fehlgeschlagen');
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saniga-stunden-${month}.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast(e.message || 'Export fehlgeschlagen');
  }
}

const ABSENCE_TYPE_ORDER = ['Ferien', 'Krankheit', 'Unfall', 'Feiertag', 'Militär'];

function absenceTypesSorted() {
  return WORK_TYPES.filter((w) => w.active !== false && w.billable === false).sort((a, b) => {
    const ia = ABSENCE_TYPE_ORDER.indexOf(a.label);
    const ib = ABSENCE_TYPE_ORDER.indexOf(b.label);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.label.localeCompare(b.label, 'de');
  });
}

async function renderAbsenzen() {
  const teamSec = document.getElementById('absTeamSection');
  if (teamSec) teamSec.classList.toggle('hidden', !IS_ADMIN);
  await renderAbsenzenMine();
  if (IS_ADMIN) await renderAbsenzenTeam();
}

async function renderAbsenzenMine() {
  const body = document.getElementById('absMineBody');
  const cards = document.getElementById('absMineCards');
  const count = document.getElementById('absMineCount');
  if (!body) return;
  try {
    const res = await api('/absences');
    const groups = res.groups || [];
    if (count) count.textContent = String(groups.length);
    if (!groups.length) {
      body.innerHTML =
        '<div class="rp-empty" style="box-shadow:none;border:none;">Noch keine Absenzen erfasst.</div>';
      if (cards) {
        cards.innerHTML =
          '<div class="rp-empty" style="box-shadow:none;border:none;">Noch keine Absenzen erfasst.</div>';
      }
      return;
    }
    body.innerHTML = `<table class="desktop-table">
      <thead><tr><th>Zeitraum</th><th>Art</th><th>Tage</th><th>Stunden</th><th>Bemerkung</th><th></th></tr></thead>
      <tbody>${groups
        .map((g) => {
          const range =
            g.from === g.to
              ? IsoWeek.formatDe(g.from)
              : `${IsoWeek.formatDe(g.from)} – ${IsoWeek.formatDe(g.to)}`;
          return `<tr>
            <td class="mono" style="font-size:13px;">${escapeAttr(range)}</td>
            <td>${escapeAttr(g.workTypeLabel)}</td>
            <td class="mono">${escapeAttr(String(g.days))}</td>
            <td class="mono">${escapeAttr(formatHours(g.hours))}</td>
            <td style="color:var(--t2);font-size:13px;">${escapeAttr(g.note || '—')}</td>
            <td><button type="button" class="btn btn-d" onclick="deleteAbsenceGroup('${escapeAttr(g.groupId)}')">Löschen</button></td>
          </tr>`;
        })
        .join('')}</tbody></table>`;
    if (cards) {
      cards.innerHTML = groups
        .map((g) => {
          const range =
            g.from === g.to
              ? IsoWeek.formatDe(g.from)
              : `${IsoWeek.formatDe(g.from)} – ${IsoWeek.formatDe(g.to)}`;
          return `<div class="m-card">
            <div class="m-card-top">
              <span class="m-card-date">${escapeAttr(range)}</span>
              <span class="m-card-hours">${escapeAttr(formatHours(g.hours))}</span>
            </div>
            <div class="m-card-mid">${escapeAttr(g.workTypeLabel)} · ${escapeAttr(String(g.days))} Tage</div>
            <div class="m-card-note">${escapeAttr(g.note || '—')}</div>
            <div class="m-card-acts">
              <button type="button" class="btn btn-d" onclick="deleteAbsenceGroup('${escapeAttr(g.groupId)}')">Löschen</button>
            </div>
          </div>`;
        })
        .join('');
    }
  } catch (e) {
    body.innerHTML = `<div class="rp-empty" style="color:var(--red);box-shadow:none;border:none;">${escapeAttr(e.message)}</div>`;
    if (cards) {
      cards.innerHTML = `<div class="rp-empty" style="color:var(--red);box-shadow:none;border:none;">${escapeAttr(e.message)}</div>`;
    }
  }
}

async function renderAbsenzenTeam() {
  if (!IS_ADMIN) return;
  const sel = document.getElementById('absMonSel');
  const body = document.getElementById('absBody');
  const title = document.getElementById('absTitle');
  const badge = document.getElementById('absTotalBadge');
  if (!sel || !body) return;
  if (!sel.options.length) fillMonthSelects();
  const month = sel.value || currentMonthKey();
  if (title) title.textContent = `Team · ${monthGermanLabel(month)}`;
  try {
    await ensureEntryMasterData();
  } catch (e) {
    body.innerHTML = `<div class="rp-empty" style="color:var(--red);box-shadow:none;border:none;">${escapeAttr(e.message)}</div>`;
    return;
  }
  const absenceTypes = absenceTypesSorted();
  const team = trackedEmps();
  if (!absenceTypes.length) {
    body.innerHTML = `<div class="rp-empty" style="box-shadow:none;border:none;">Keine Absenz-Arten vorhanden.</div>`;
    if (badge) badge.textContent = '0,0 h';
    return;
  }
  let grand = 0;
  const rows = team.map((emp) => {
    const cells = absenceTypes.map((wt) => {
      const hrs = ENTRIES.filter(
        (en) =>
          en.empId === emp.id &&
          en.workTypeId === wt.id &&
          en.date.startsWith(month) &&
          en.billable === false
      ).reduce((s, en) => s + entryHoursValue(en), 0);
      grand += hrs;
      return hrs;
    });
    const rowTotal = cells.reduce((s, h) => s + h, 0);
    return { emp, cells, rowTotal };
  });
  const head = `<tr><th>Mitarbeiter</th>${absenceTypes
    .map((w) => `<th>${escapeAttr(w.label)}</th>`)
    .join('')}<th>Total</th></tr>`;
  const bodyRows = rows
    .map((r) => {
      const cellHtml = r.cells
        .map((h) => `<td class="mono">${h > 0 ? escapeAttr(formatHoursDeCsv(h)) : '—'}</td>`)
        .join('');
      return `<tr>
        <td>${escapeAttr(r.emp.first)} ${escapeAttr(r.emp.last)}</td>
        ${cellHtml}
        <td class="mono" style="font-weight:700;">${escapeAttr(formatHoursDeCsv(r.rowTotal))}</td>
      </tr>`;
    })
    .join('');
  const colTotals = absenceTypes.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
  const foot = `<tr style="font-weight:800;background:rgba(240,242,247,.85);">
      <td>Total</td>
      ${colTotals.map((h) => `<td class="mono">${escapeAttr(formatHoursDeCsv(h))}</td>`).join('')}
      <td class="mono">${escapeAttr(formatHoursDeCsv(grand))}</td>
    </tr>`;
  if (badge) badge.textContent = `${formatHoursDeCsv(grand)} h`;
  body.innerHTML = `<table><thead>${head}</thead><tbody>${bodyRows}${foot}</tbody></table>`;
}

function showAbsErr(msg) {
  const el = document.getElementById('absErr');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

async function openAbsenceDialog() {
  showAbsErr('');
  try {
    await ensureEntryMasterData();
  } catch (e) {
    toast(e.message);
    return;
  }
  const types = absenceTypesSorted();
  const typeSel = document.getElementById('absType');
  if (!types.length) {
    toast('Keine Absenz-Arten vorhanden.');
    return;
  }
  typeSel.innerHTML = types
    .map((w) => `<option value="${escapeAttr(w.id)}">${escapeAttr(w.label)}</option>`)
    .join('');
  const empFg = document.getElementById('absEmpFg');
  const empSel = document.getElementById('absEmp');
  if (IS_ADMIN) {
    empFg.classList.remove('hidden');
    empSel.innerHTML = EMPS.map(
      (e) => `<option value="${escapeAttr(e.id)}">${escapeAttr(formatEmpSelectLabel(e))}</option>`
    ).join('');
    empSel.value = curUser || ME.id;
  } else {
    empFg.classList.add('hidden');
  }
  const t = today();
  document.getElementById('absFrom').value = t;
  document.getElementById('absTo').value = t;
  document.getElementById('absHalfDay').checked = false;
  document.getElementById('absNote').value = '';
  openAbsenceSheet();
}

async function saveAbsence() {
  showAbsErr('');
  const workTypeId = document.getElementById('absType').value;
  const from = document.getElementById('absFrom').value;
  const to = document.getElementById('absTo').value;
  const halfDay = document.getElementById('absHalfDay').checked;
  const note = document.getElementById('absNote').value.trim();
  if (!workTypeId || !from || !to) {
    showAbsErr('Bitte Art und Zeitraum angeben.');
    return;
  }
  const body = { workTypeId, from, to, halfDay, note };
  if (IS_ADMIN) {
    const uid = document.getElementById('absEmp').value;
    if (uid) body.userId = uid;
  }
  try {
    const res = await api('/absences', { method: 'POST', body: JSON.stringify(body) });
    closeM('moAbsence');
    toast(`${res.days} Tag(e), ${formatHours(res.hours)} erfasst`);
    await loadData();
    markLocalEntriesState();
    refreshCur();
  } catch (e) {
    showAbsErr(e.message);
  }
}

async function deleteAbsenceGroup(groupId) {
  if (!groupId) return;
  if (!confirm('Diese Absenz inkl. aller Tage wirklich löschen?')) return;
  try {
    await api(`/absences/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    toast('Absenz gelöscht');
    await loadData();
    markLocalEntriesState();
    refreshCur();
  } catch (e) {
    toast(e.message);
  }
}

async function openInvoiceDownload(invoiceId, format) {
  if (!IS_ADMIN || !invoiceId) return;
  try {
    const res = await api(`/invoices/${encodeURIComponent(invoiceId)}/download-link`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    });
    if (!res?.url) throw new Error('Download-Link fehlt');
    window.open(res.url, '_blank', 'noopener');
  } catch (e) {
    toast(e.message || 'Download fehlgeschlagen');
  }
}

function invoiceDownloadLinksHtml(invoiceId) {
  const id = escapeAttr(invoiceId);
  return `<button type="button" class="btn btn-g" onclick="openInvoiceDownload('${id}','pdf')">PDF</button>
    <button type="button" class="btn btn-g" onclick="openInvoiceDownload('${id}','docx')">Word</button>`;
}

function invoiceResultRowHtml(invoice, { created = false } = {}) {
  const label = created
    ? `Rechnung ${escapeAttr(invoice.number)} erstellt`
    : `Rechnung ${escapeAttr(invoice.number)}`;
  return `<div class="rp-inv-result" data-invoice-id="${escapeAttr(invoice.id)}">
    <span class="rp-inv-result-label">${label}</span>
    ${invoiceDownloadLinksHtml(invoice.id)}
  </div>`;
}

function siteInvoicesFromEntries(entries) {
  const map = new Map();
  for (const en of entries || []) {
    if (en.invoiceId && en.invoiceNumber && !map.has(en.invoiceId)) {
      map.set(en.invoiceId, { id: en.invoiceId, number: en.invoiceNumber });
    }
  }
  return [...map.values()];
}

function formatSwissChf(n) {
  const fixed = (Math.round(Number(n) * 100) / 100).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
}

function formatInvoicePeriod(from, to) {
  const fmt = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${dt.getUTCFullYear()}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

function findReportSite(siteId) {
  const customers = lastReportsData?.customers || [];
  for (const c of customers) {
    const site = (c.sites || []).find((s) => s.id === siteId);
    if (site) return { customer: c, site };
  }
  return null;
}

function renderReports(data) {
  const body = document.getElementById('rpBody');
  if (!body) return;
  const customers = data.customers || [];
  if (!customers.length) {
    const emptyMsg =
      reportMode === 'open'
        ? 'Keine offenen Stunden mit Objekt.'
        : 'Keine Einträge mit Objekt in diesem Zeitraum.';
    body.innerHTML = `<div class="card rp-empty">${emptyMsg}</div>`;
    return;
  }
  const flash = reportInvoiceFlash;
  reportInvoiceFlash = null;
  body.innerHTML = customers
    .map((c) => {
      const sitesHtml = (c.sites || [])
        .map((s) => {
          const entries = s.entries || [];
          const openBillable = billableOpenEntries(entries);
          const siteInvoices = siteInvoicesFromEntries(entries);
          const rows = entries
            .map((en) => {
              const invoiced = !!(en.invoiceId || en.invoiceNumber);
              const nonBillable = en.billable === false;
              const rowClass = [
                invoiced ? 'rp-entry-invoiced' : '',
                nonBillable ? 'rp-entry-nonbillable' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const invBadge = en.invoiceNumber
                ? `<span class="rp-inv-badge">${escapeAttr(en.invoiceNumber)}</span>`
                : '';
              const nbBadge = nonBillable
                ? `<span class="rp-nb-badge">nicht verrechenbar</span>`
                : '';
              return `<tr class="${rowClass}">
              <td>${escapeAttr(fmtD(en.date))}${invBadge}</td>
              <td>${escapeAttr(en.employeeName)}</td>
              <td>${escapeAttr(en.workType)}${nbBadge}</td>
              <td class="mono">${escapeAttr(formatReportHours(en.hours))}</td>
              <td style="color:var(--t2);">${escapeAttr(en.note || '—')}</td>
            </tr>`;
            })
            .join('');
          const createBtn = openBillable.length
            ? `<button type="button" class="btn btn-g" data-rp-create-inv onclick="createReportInvoice('${escapeAttr(s.id)}')">Rechnung erstellen</button>`
            : '';
          const resultRows = siteInvoices
            .map((inv) =>
              invoiceResultRowHtml(inv, {
                created: !!(flash && flash.siteId === s.id && flash.invoiceId === inv.id),
              })
            )
            .join('');
          return `<div class="rp-site" data-site-id="${escapeAttr(s.id)}">
            <div class="rp-site-head">
              <div class="rp-site-label">${escapeAttr(s.label)}</div>
              <div class="rp-site-total">${escapeAttr(formatReportHours(s.totalHours))} Total</div>
              <div class="rp-site-actions">
                ${createBtn}
                <span class="rp-inv-msg" data-rp-inv-msg></span>
              </div>
            </div>
            <div data-rp-inv-results>${resultRows}</div>
            <table>
              <thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Arbeit</th><th>Stunden</th><th>Bemerkung</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
        })
        .join('');
      return `<div class="card rp-customer" style="padding:20px 22px;">
        <div class="rp-customer-head">
          <div class="rp-customer-name">${escapeAttr(c.name)}</div>
          <div class="rp-customer-total">${escapeAttr(formatReportHours(c.totalHours))} Total</div>
        </div>
        ${sitesHtml}
      </div>`;
    })
    .join('');
}

function reportSiteBlock(siteId) {
  return document.querySelector(`.rp-site[data-site-id="${siteId}"]`);
}

function setReportInvoiceMessage(siteId, msg, isErr) {
  const block = reportSiteBlock(siteId);
  if (!block) return;
  const el = block.querySelector('[data-rp-inv-msg]');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function buildReportInvoicePayload(siteId, entries) {
  const dates = (entries || []).map((e) => e.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const from = reportMode === 'range' && reportFrom ? reportFrom : dates[0];
  const to = reportMode === 'range' && reportTo ? reportTo : dates[dates.length - 1];
  if (!from || !to) return null;
  const payload = { siteId, from, to };
  if (reportWorkTypeId) payload.workTypeId = reportWorkTypeId;
  return payload;
}

async function createReportInvoice(siteId) {
  if (!IS_ADMIN) return;
  const found = findReportSite(siteId);
  if (!found) {
    setReportInvoiceMessage(siteId, 'Objekt nicht gefunden', true);
    return;
  }
  const openBillable = billableOpenEntries(found.site.entries);
  if (!openBillable.length) {
    setReportInvoiceMessage(siteId, 'Keine offenen verrechenbaren Stunden für dieses Objekt.', true);
    return;
  }
  const payload = buildReportInvoicePayload(siteId, openBillable);
  if (!payload) {
    setReportInvoiceMessage(siteId, 'Datum für die Verrechnung fehlt.', true);
    return;
  }
  pendingReportInvoice = { ...payload };
  setReportInvoiceMessage(siteId, '', false);
  const modal = document.getElementById('moRpInvoice');
  const body = document.getElementById('rpInvConfirmBody');
  const err = document.getElementById('rpInvConfirmErr');
  if (!modal || !body) {
    setReportInvoiceMessage(siteId, 'Bestätigungsdialog fehlt – bitte Seite neu laden.', true);
    return;
  }
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  body.innerHTML = `<div style="color:var(--t2);">Ansätze werden geladen…</div>`;
  modal.classList.add('open');

  try {
    const preview = await api('/invoices/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const lineRows = (preview.lineItems || [])
      .flatMap((g) =>
        (g.employees || []).map(
          (emp) =>
            `<li><strong>${escapeAttr(g.workTypeLabel)}</strong> · ${escapeAttr(emp.employeeName)}: ${escapeAttr(formatReportHours(emp.hours))} h × CHF ${escapeAttr(formatSwissChf(emp.chfPerHour))} = CHF ${escapeAttr(formatSwissChf(emp.amount))}</li>`
        )
      )
      .join('');
    const totalHours = Math.round(
      (preview.lineItems || []).reduce((s, g) => s + Number(g.hours || 0), 0) * 100
    ) / 100;
    body.innerHTML = `
      <div><strong>${escapeAttr(preview.customer?.name || found.customer.name)}</strong> · ${escapeAttr(preview.site?.label || found.site.label)}</div>
      <div style="margin-top:10px;color:var(--t2);font-size:12px;">${escapeAttr(reportFilterSummaryText())}</div>
      <ul style="margin:12px 0 0;padding-left:18px;">
        ${lineRows || '<li>Keine Positionen</li>'}
        <li style="margin-top:6px;"><strong>Total:</strong> ${escapeAttr(formatReportHours(totalHours))} h</li>
        <li><strong>Zeitraum:</strong> ${escapeAttr(IsoWeek.formatDe(preview.periodFrom || payload.from))} – ${escapeAttr(IsoWeek.formatDe(preview.periodTo || payload.to))}</li>
        <li><strong>Netto:</strong> CHF ${escapeAttr(formatSwissChf(preview.subtotal))}</li>
      </ul>`;
  } catch (e) {
    modal.classList.remove('open');
    pendingReportInvoice = null;
    setReportInvoiceMessage(siteId, e.message || 'Vorschau fehlgeschlagen', true);
  }
}

async function confirmCreateReportInvoice() {
  if (!IS_ADMIN || !pendingReportInvoice) return;
  const { siteId, from, to, workTypeId } = pendingReportInvoice;
  if (!from || !to) {
    const errEl = document.getElementById('rpInvConfirmErr');
    if (errEl) {
      errEl.textContent = 'from und to sind erforderlich.';
      errEl.style.display = 'block';
    }
    return;
  }
  const btn = document.getElementById('rpInvConfirmBtn');
  const err = document.getElementById('rpInvConfirmErr');
  if (btn) btn.disabled = true;
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  const payload = { siteId, from, to };
  if (workTypeId) payload.workTypeId = workTypeId;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    const r = await fetch('/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Ungültige Antwort' };
    }
    if (r.status === 409) {
      throw new Error('Keine offenen verrechenbaren Stunden für diese Auswahl.');
    }
    if (!r.ok) {
      throw new Error(data.error || `HTTP ${r.status}`);
    }
    const invoice = data.invoice;
    pendingReportInvoice = null;
    closeM('moRpInvoice');
    if (invoice?.id && invoice?.number) {
      reportInvoiceFlash = { siteId, invoiceId: invoice.id, number: invoice.number };
    }
    await loadReports();
  } catch (e) {
    if (err) {
      err.textContent = e.message || 'Rechnung fehlgeschlagen';
      err.style.display = 'block';
    }
    setReportInvoiceMessage(siteId, e.message || 'Rechnung fehlgeschlagen', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadInvoices() {
  if (!IS_ADMIN) return;
  const body = document.getElementById('invBody');
  if (!body) return;
  body.innerHTML = `<div class="card rp-empty">Lade Rechnungen…</div>`;
  try {
    const data = await api('/invoices');
    renderInvoices(data.invoices || []);
  } catch (e) {
    body.innerHTML = `<div class="card rp-empty" style="color:var(--red);">${escapeAttr(e.message)}</div>`;
  }
}

function renderInvoices(invoices) {
  const body = document.getElementById('invBody');
  if (!body) return;
  if (!invoices.length) {
    body.innerHTML = `<div class="card rp-empty">Noch keine Rechnungen erstellt.</div>`;
    return;
  }
  body.innerHTML = `<div class="card" style="padding:18px 20px;"><div class="inv-list">${invoices
    .map((inv) => {
      const customer = inv.customer?.name || '—';
      const site = inv.site?.label || '—';
      const period = formatInvoicePeriod(inv.periodFrom, inv.periodTo);
      const cancelled = !!inv.cancelledAt;
      const id = escapeAttr(inv.id);
      const cancelBtn = cancelled
        ? ''
        : `<button type="button" class="btn btn-g" data-inv-cancel-toggle onclick="toggleInvoiceCancelPanel('${id}')">Stornieren</button>`;
      const statusBadge = cancelled
        ? `<span class="inv-badge-cancelled">Storniert</span>`
        : '';
      const reasonLine = cancelled
        ? `<div class="inv-cancel-reason">Grund: ${escapeAttr(inv.cancelledReason || '—')}</div>`
        : '';
      return `<div class="inv-row ${cancelled ? 'cancelled' : ''}" data-invoice-id="${id}">
        <div class="inv-row-top">
          <div class="inv-row-main">
            <div class="inv-row-num">${escapeAttr(inv.number)}${statusBadge}</div>
            <div class="inv-row-meta">${escapeAttr(customer)} · ${escapeAttr(site)} · ${escapeAttr(period)}</div>
            ${reasonLine}
          </div>
          <div class="inv-row-total">CHF ${escapeAttr(formatSwissChf(inv.total))}</div>
          <div class="inv-row-actions">
            ${invoiceDownloadLinksHtml(inv.id)}
            ${cancelBtn}
          </div>
        </div>
        <div class="inv-cancel-panel" data-inv-cancel-panel>
          <div class="fg">
            <label>Begründung der Stornierung</label>
            <input type="text" data-inv-cancel-reason maxlength="500" placeholder="z.B. Fehlerhaft erstellt">
          </div>
          <p class="inv-cancel-err" data-inv-cancel-err></p>
          <div class="inv-cancel-actions">
            <button type="button" class="btn btn-g" onclick="toggleInvoiceCancelPanel('${id}')">Abbrechen</button>
            <button type="button" class="btn btn-p" data-inv-cancel-confirm onclick="confirmCancelInvoice('${id}')">Stornierung bestätigen</button>
          </div>
        </div>
      </div>`;
    })
    .join('')}</div></div>`;
}

function invoiceRowEl(invoiceId) {
  return document.querySelector(`.inv-row[data-invoice-id="${invoiceId}"]`);
}

function toggleInvoiceCancelPanel(invoiceId) {
  const row = invoiceRowEl(invoiceId);
  if (!row) return;
  const panel = row.querySelector('[data-inv-cancel-panel]');
  if (!panel) return;
  const open = !panel.classList.contains('open');
  document.querySelectorAll('[data-inv-cancel-panel].open').forEach((p) => {
    if (p !== panel) p.classList.remove('open');
  });
  panel.classList.toggle('open', open);
  if (open) {
    const input = panel.querySelector('[data-inv-cancel-reason]');
    if (input) input.focus();
  }
}

async function confirmCancelInvoice(invoiceId) {
  const row = invoiceRowEl(invoiceId);
  if (!row) return;
  const panel = row.querySelector('[data-inv-cancel-panel]');
  const input = panel?.querySelector('[data-inv-cancel-reason]');
  const err = panel?.querySelector('[data-inv-cancel-err]');
  const btn = panel?.querySelector('[data-inv-cancel-confirm]');
  const reason = (input?.value || '').trim();
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  if (!reason) {
    if (err) {
      err.textContent = 'Bitte eine Begründung angeben.';
      err.style.display = 'block';
    }
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await api(`/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    toast('Rechnung storniert');
    await loadInvoices();
  } catch (e) {
    if (err) {
      err.textContent = e.message || 'Stornierung fehlgeschlagen';
      err.style.display = 'block';
    }
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

function showSdErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function showStammdatenTab(tab) {
  sdTab = tab;
  document.querySelectorAll('.sd-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-sd-tab') === tab);
  });
  document.querySelectorAll('.sd-panel').forEach((p) => p.classList.remove('active'));
  const panel = document.getElementById(`sd-panel-${tab}`);
  if (panel) panel.classList.add('active');
  if (tab === 'kunden') renderCustomers();
  if (tab === 'objekte') {
    fillSiteCustomerSelect();
    renderSites();
  }
  if (tab === 'arbeitsarten') renderWorkTypes();
  if (tab === 'ansaetze') {
    fillRateSelects();
    renderRates();
  }
  if (tab === 'firma') renderCompany();
}

async function loadStammdaten() {
  if (!IS_ADMIN) return;
  try {
    const [cRes, sRes, wRes, coRes, rRes] = await Promise.all([
      api('/customers'),
      api('/sites'),
      api('/work-types'),
      api('/company'),
      api('/rates'),
    ]);
    CUSTOMERS = cRes.customers || [];
    SITES = sRes.sites || [];
    WORK_TYPES = wRes.workTypes || [];
    COMPANY = coRes.company || null;
    RATES = rRes.rates || [];
    masterFingerprint = fingerprintMaster(CUSTOMERS, SITES, WORK_TYPES);
    showStammdatenTab(sdTab || 'kunden');
  } catch (e) {
    showSdErr('sdCustErr', e.message);
    toast(e.message);
  }
}

function fillRateSelects() {
  const cust = document.getElementById('sdRateCust');
  const wt = document.getElementById('sdRateWt');
  const emp = document.getElementById('sdRateEmp');
  if (cust) {
    cust.innerHTML =
      '<option value="">Alle</option>' +
      CUSTOMERS.map((c) => `<option value="${escapeAttr(c.id)}">${escapeAttr(c.name)}</option>`).join('');
  }
  if (wt) {
    wt.innerHTML =
      '<option value="">Alle</option>' +
      WORK_TYPES.filter((w) => w.active !== false)
        .map((w) => `<option value="${escapeAttr(w.id)}">${escapeAttr(w.label)}</option>`)
        .join('');
  }
  if (emp) {
    emp.innerHTML =
      '<option value="">Alle</option>' +
      EMPS.map(
        (e) =>
          `<option value="${escapeAttr(e.id)}">${escapeAttr(`${e.first} ${e.last}`.trim())}</option>`
      ).join('');
  }
  const from = document.getElementById('sdRateFrom');
  if (from && !from.value) {
    from.value = IsoWeek.zonedYmd();
  }
}

function formatRateYmdDe(ymd) {
  if (!ymd) return '—';
  return IsoWeek.formatDe(ymd);
}

function renderRates() {
  const body = document.getElementById('sdRateBody');
  const count = document.getElementById('sdRateCount');
  if (!body) return;
  if (count) count.textContent = String(RATES.length);
  if (!RATES.length) {
    body.innerHTML = '<tr><td colspan="6" style="color:var(--t3);">Noch keine Ansätze.</td></tr>';
    return;
  }
  body.innerHTML = RATES.map((r) => {
    const cust = r.customer?.name || 'Alle';
    const wt = r.workType?.label || 'Alle';
    const emp = r.user?.name || 'Alle';
    return `<tr>
      <td>${escapeAttr(cust)}</td>
      <td>${escapeAttr(wt)}</td>
      <td>${escapeAttr(emp)}</td>
      <td class="mono">${escapeAttr(formatSwissChf(r.chfPerHour))}</td>
      <td>${escapeAttr(formatRateYmdDe(r.validFrom))}</td>
      <td>${escapeAttr(formatRateYmdDe(r.validTo))}</td>
    </tr>`;
  }).join('');
}

async function addRate() {
  showSdErr('sdRateErr', '');
  const customerId = document.getElementById('sdRateCust')?.value || '';
  const workTypeId = document.getElementById('sdRateWt')?.value || '';
  const userId = document.getElementById('sdRateEmp')?.value || '';
  const chfPerHour = Number(document.getElementById('sdRateChf')?.value);
  const validFrom = document.getElementById('sdRateFrom')?.value || '';
  const validTo = document.getElementById('sdRateTo')?.value || '';
  if (!validFrom || !(chfPerHour > 0)) {
    showSdErr('sdRateErr', 'Bitte CHF/Stunde und gültig ab angeben.');
    return;
  }
  try {
    await api('/rates', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customerId || null,
        workTypeId: workTypeId || null,
        userId: userId || null,
        chfPerHour,
        validFrom,
        validTo: validTo || null,
      }),
    });
    document.getElementById('sdRateChf').value = '';
    document.getElementById('sdRateTo').value = '';
    toast('Ansatz gespeichert');
    await loadStammdaten();
    showStammdatenTab('ansaetze');
  } catch (e) {
    showSdErr('sdRateErr', e.message);
  }
}

function fillSiteCustomerSelect() {
  const sel = document.getElementById('sdSiteCust');
  if (!sel) return;
  const prev = sel.value;
  if (!CUSTOMERS.length) {
    sel.innerHTML = '<option value="">Kein Kunde vorhanden</option>';
    return;
  }
  sel.innerHTML = CUSTOMERS.map(
    (c) => `<option value="${escapeAttr(c.id)}">${escapeAttr(c.name)}</option>`
  ).join('');
  if (prev && CUSTOMERS.some((c) => c.id === prev)) sel.value = prev;
}

function renderCustomers() {
  const body = document.getElementById('sdCustBody');
  const count = document.getElementById('sdCustCount');
  if (!body) return;
  if (count) count.textContent = String(CUSTOMERS.length);
  if (!CUSTOMERS.length) {
    body.innerHTML = '<tr><td colspan="7" style="color:var(--t3);">Noch keine Kunden.</td></tr>';
    return;
  }
  body.innerHTML = CUSTOMERS.map((c) => {
    const id = escapeAttr(c.id);
    const days = c.paymentTermDays == null ? 14 : Number(c.paymentTermDays);
    return `<tr data-id="${id}">
      <td><input class="sd-inline-input" type="text" id="sdCustName_${id}" value="${escapeAttr(c.name || '')}" maxlength="200"></td>
      <td><input class="sd-inline-input" type="text" id="sdCustStreet_${id}" value="${escapeAttr(c.street || '')}" maxlength="500" placeholder="—"></td>
      <td><input class="sd-inline-input" type="text" id="sdCustZip_${id}" value="${escapeAttr(c.postalCode || '')}" maxlength="20" placeholder="—"></td>
      <td><input class="sd-inline-input" type="text" id="sdCustCity_${id}" value="${escapeAttr(c.city || '')}" maxlength="120" placeholder="—"></td>
      <td><input class="sd-inline-input" type="text" id="sdCustContact_${id}" value="${escapeAttr(c.contactPerson || '')}" maxlength="200" placeholder="—"></td>
      <td><input class="sd-inline-input" type="number" id="sdCustPay_${id}" value="${escapeAttr(days)}" min="0" max="365" step="1" style="width:72px;"></td>
      <td><div class="sd-actions"><button type="button" class="btn btn-g" onclick="saveCustomer('${id}')">Speichern</button></div></td>
    </tr>`;
  }).join('');
}

function readCustomerForm() {
  return {
    name: document.getElementById('sdCustName').value.trim(),
    street: document.getElementById('sdCustStreet').value.trim() || null,
    postalCode: document.getElementById('sdCustZip').value.trim() || null,
    city: document.getElementById('sdCustCity').value.trim() || null,
    contactPerson: document.getElementById('sdCustContact').value.trim() || null,
    paymentTermDays: Number(document.getElementById('sdCustPayDays').value) || 14,
  };
}

async function addCustomer() {
  showSdErr('sdCustErr', '');
  const body = readCustomerForm();
  if (!body.name) {
    showSdErr('sdCustErr', 'Bitte einen Namen eingeben.');
    return;
  }
  try {
    await api('/customers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    document.getElementById('sdCustName').value = '';
    document.getElementById('sdCustStreet').value = '';
    document.getElementById('sdCustZip').value = '';
    document.getElementById('sdCustCity').value = '';
    document.getElementById('sdCustContact').value = '';
    document.getElementById('sdCustPayDays').value = '14';
    toast('Kunde hinzugefügt');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdCustErr', e.message);
  }
}

async function saveCustomer(id) {
  showSdErr('sdCustErr', '');
  const name = (document.getElementById(`sdCustName_${id}`)?.value || '').trim();
  if (!name) {
    showSdErr('sdCustErr', 'Name darf nicht leer sein.');
    return;
  }
  const paymentTermDays = Number(document.getElementById(`sdCustPay_${id}`)?.value);
  try {
    await api(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        street: (document.getElementById(`sdCustStreet_${id}`)?.value || '').trim() || null,
        postalCode: (document.getElementById(`sdCustZip_${id}`)?.value || '').trim() || null,
        city: (document.getElementById(`sdCustCity_${id}`)?.value || '').trim() || null,
        contactPerson: (document.getElementById(`sdCustContact_${id}`)?.value || '').trim() || null,
        paymentTermDays: Number.isFinite(paymentTermDays) ? paymentTermDays : 14,
      }),
    });
    toast('Kunde gespeichert');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdCustErr', e.message);
  }
}

function renderCompany() {
  showSdErr('sdCoErr', '');
  if (!COMPANY) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v == null ? '' : String(v);
  };
  set('sdCoName', COMPANY.name || '');
  set('sdCoStreet', COMPANY.street || '');
  set('sdCoZip', COMPANY.postalCode || '');
  set('sdCoCity', COMPANY.city || '');
  set('sdCoUid', COMPANY.uid || '');
  set('sdCoVat', COMPANY.vatRate ?? 8.1);
  set('sdCoInvStart', COMPANY.invoiceStartNumber ?? 1);
}

async function saveCompany() {
  showSdErr('sdCoErr', '');
  const name = (document.getElementById('sdCoName')?.value || '').trim();
  if (!name) {
    showSdErr('sdCoErr', 'Firmenname ist erforderlich.');
    return;
  }
  try {
    const res = await api('/company', {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        street: (document.getElementById('sdCoStreet')?.value || '').trim() || null,
        postalCode: (document.getElementById('sdCoZip')?.value || '').trim() || null,
        city: (document.getElementById('sdCoCity')?.value || '').trim() || null,
        uid: (document.getElementById('sdCoUid')?.value || '').trim() || null,
        vatRate: Number(document.getElementById('sdCoVat')?.value),
        invoiceStartNumber: Number(document.getElementById('sdCoInvStart')?.value),
      }),
    });
    COMPANY = res.company;
    renderCompany();
    toast('Firma gespeichert');
  } catch (e) {
    showSdErr('sdCoErr', e.message);
  }
}

function renderSites() {
  const body = document.getElementById('sdSiteBody');
  const count = document.getElementById('sdSiteCount');
  if (!body) return;
  if (count) count.textContent = String(SITES.length);
  if (!SITES.length) {
    body.innerHTML = '<tr><td colspan="6" style="color:var(--t3);">Noch keine Objekte.</td></tr>';
    return;
  }
  body.innerHTML = SITES.map((s) => {
    const id = escapeAttr(s.id);
    const custName = s.customer?.name || '—';
    const active = s.active !== false;
    return `<tr class="${active ? '' : 'sd-row-inactive'}" data-id="${id}">
      <td>${escapeAttr(s.label || '')}</td>
      <td>${escapeAttr(s.objectNumber || '—')}</td>
      <td>${escapeAttr(custName)}</td>
      <td>${escapeAttr(s.address || '—')}</td>
      <td><span class="badge ${active ? 'bg' : 'br'}">${active ? 'aktiv' : 'inaktiv'}</span></td>
      <td><div class="sd-actions">
        <button type="button" class="btn btn-g" onclick="toggleSiteActive('${id}', ${active ? 'false' : 'true'})">${active ? 'Deaktivieren' : 'Aktivieren'}</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function addSite() {
  showSdErr('sdSiteErr', '');
  const customerId = document.getElementById('sdSiteCust').value;
  const label = document.getElementById('sdSiteLabel').value.trim();
  const objectNumber = document.getElementById('sdSiteObjNr').value.trim();
  const address = document.getElementById('sdSiteAddr').value.trim();
  if (!customerId) {
    showSdErr('sdSiteErr', 'Bitte einen Kunden wählen.');
    return;
  }
  if (!label) {
    showSdErr('sdSiteErr', 'Bitte eine Bezeichnung eingeben.');
    return;
  }
  try {
    await api('/sites', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        label,
        objectNumber: objectNumber || null,
        address: address || null,
      }),
    });
    document.getElementById('sdSiteLabel').value = '';
    document.getElementById('sdSiteObjNr').value = '';
    document.getElementById('sdSiteAddr').value = '';
    toast('Objekt hinzugefügt');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdSiteErr', e.message);
  }
}

async function toggleSiteActive(id, active) {
  showSdErr('sdSiteErr', '');
  try {
    await api(`/sites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: active === true || active === 'true' }),
    });
    toast(active === true || active === 'true' ? 'Objekt aktiviert' : 'Objekt deaktiviert');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdSiteErr', e.message);
  }
}

function renderWorkTypes() {
  const body = document.getElementById('sdWtBody');
  const count = document.getElementById('sdWtCount');
  if (!body) return;
  if (count) count.textContent = String(WORK_TYPES.length);
  if (!WORK_TYPES.length) {
    body.innerHTML = '<tr><td colspan="4" style="color:var(--t3);">Noch keine Arbeitsarten.</td></tr>';
    return;
  }
  body.innerHTML = WORK_TYPES.map((w) => {
    const id = escapeAttr(w.id);
    const active = w.active !== false;
    const billable = w.billable !== false;
    return `<tr class="${active ? '' : 'sd-row-inactive'}" data-id="${id}">
      <td>${escapeAttr(w.label || '')}</td>
      <td>${billable ? 'ja' : 'nein'}</td>
      <td><span class="badge ${active ? 'bg' : 'br'}">${active ? 'aktiv' : 'inaktiv'}</span></td>
      <td><div class="sd-actions">
        <button type="button" class="btn btn-g" onclick="toggleWorkTypeActive('${id}', ${active ? 'false' : 'true'})">${active ? 'Deaktivieren' : 'Aktivieren'}</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function addWorkType() {
  showSdErr('sdWtErr', '');
  const label = document.getElementById('sdWtLabel').value.trim();
  const billable = document.getElementById('sdWtBillable').checked;
  if (!label) {
    showSdErr('sdWtErr', 'Bitte eine Bezeichnung eingeben.');
    return;
  }
  try {
    await api('/work-types', {
      method: 'POST',
      body: JSON.stringify({ label, billable }),
    });
    document.getElementById('sdWtLabel').value = '';
    document.getElementById('sdWtBillable').checked = true;
    toast('Arbeitsart hinzugefügt');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdWtErr', e.message);
  }
}

async function toggleWorkTypeActive(id, active) {
  showSdErr('sdWtErr', '');
  try {
    await api(`/work-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: active === true || active === 'true' }),
    });
    toast(active === true || active === 'true' ? 'Arbeitsart aktiviert' : 'Arbeitsart deaktiviert');
    await loadStammdaten();
  } catch (e) {
    showSdErr('sdWtErr', e.message);
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
  // Erwarteter Lohn / Stundenlohn line hidden — payroll is external (Treuhänder).
  // const mLohnLabel = document.getElementById('mLohnLabel');
  // if (mLohnLabel) {
  //   mLohnLabel.textContent = `Erwarteter Lohn ${MOS[+m.split('-')[1]]}`;
  //   document.getElementById('mLohn').textContent = `CHF ${Math.round(hrs * (e?.rate || 35)).toLocaleString('de-CH')}.–`;
  //   document.getElementById('mRate').textContent = `bei CHF ${e?.rate || 35}.–/h`;
  // }

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
    .map((en) => {
      const workLbl = entryWorkLabel(en) || (isAbsenceEntry(en) ? 'Absenz' : 'Arbeitsart');
      const parts = entrySiteParts(en);
      const absClass = isAbsenceEntry(en) ? ' entry-absence' : '';
      const absBadge = isAbsenceEntry(en) ? '<span class="entry-abs-badge">Absenz</span>' : '';
      const note = (en.note || '').trim();
      const siteLine = isAbsenceEntry(en)
        ? `<div class="ec-project"><div class="ec-site">Absenz${absBadge}</div></div>`
        : `<div class="ec-project">
            ${parts.customer ? `<div class="ec-customer">${escapeAttr(parts.customer)}</div>` : ''}
            <div class="ec-site">${escapeAttr(parts.site || 'Objekt')}</div>
          </div>`;
      const desktopMeta = isAbsenceEntry(en)
        ? workLbl
        : [entrySiteLabel(en), workLbl].filter(Boolean).join(' · ') || '—';
      return `
    <div class="ei entry-card${absClass}">
      <div class="ei-dot"></div>
      <div class="entry-card-line1">
        <div class="ei-date">${fmtD(en.date)}${absBadge}</div>
        <div class="ei-dur">${mDur(net(en))}</div>
      </div>
      <div class="ei-time">${entryTimeLabel(en)}</div>
      <div class="entry-card-line2">${escapeAttr(desktopMeta)}</div>
      <div class="entry-card-line3">${note ? escapeAttr(note) : '—'}</div>
      <div class="ei-note">${escapeAttr(desktopMeta)}</div>
      <div class="ec-body">
        <div class="ec-top">
          <div class="ec-date">${fmtDShort(en.date)}</div>
          <div class="ec-hours">${escapeAttr(formatHours(entryHoursValue(en)))}</div>
        </div>
        <div class="ec-work">${escapeAttr(workLbl)}</div>
        ${siteLine}
        ${note ? `<div class="ec-note">${escapeAttr(note)}</div>` : ''}
      </div>
      <div class="ei-acts">${entryActionButtonsHtml(en)}</div>
    </div>`;
    })
    .join('');
}

function renderWeekStrip() {
  const strip = document.getElementById('weekStrip');
  if (!strip) return;
  const wk = wkDates();
  const t = today();
  const ns = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  strip.innerHTML = wk
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
  const totHrs = entries.reduce((s, e) => s + entryHoursValue(e), 0);
  document.getElementById('monBadge').textContent = `${formatHours(totHrs)} Total`;
  const body = document.getElementById('monBody');
  const cards = document.getElementById('monCards');
  if (!entries.length) {
    if (body) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge für diesen Monat.</td></tr>`;
    }
    if (cards) {
      cards.innerHTML = `<div class="rp-empty" style="box-shadow:none;border:none;">Keine Einträge für diesen Monat.</div>`;
    }
    return;
  }
  if (body) {
    body.innerHTML = entries
      .map((en) => {
        const alt = isLegacyEntry(en)
          ? `<span class="entry-alt-badge" title="Aus Von/Bis berechnet">alt</span>`
          : '';
        const rowClass = isAbsenceEntry(en) ? 'entry-absence' : '';
        return `<tr class="${rowClass}">
        <td>${fmtD(en.date)}${alt}</td>
        <td>${entryObjektCell(en)}</td>
        <td>${escapeAttr(entryWorkLabel(en) || '—')}</td>
        <td class="mono">${escapeAttr(formatHours(entryHoursValue(en)))}</td>
        <td style="color:var(--t2);font-size:13px;">${escapeAttr(en.note || '—')}</td>
        <td>${entryActionButtonsHtml(en)}</td>
      </tr>`;
      })
      .join('');
  }
  if (cards) {
    cards.innerHTML = entries
      .map((en) => {
        const line2 = isAbsenceEntry(en)
          ? entryWorkLabel(en) || 'Absenz'
          : [entrySiteLabel(en), entryWorkLabel(en)].filter(Boolean).join(' · ') || '—';
        return `<div class="m-card${isAbsenceEntry(en) ? ' entry-absence' : ''}">
          <div class="m-card-top">
            <span class="m-card-date">${fmtD(en.date)}</span>
            <span class="m-card-hours">${escapeAttr(formatHours(entryHoursValue(en)))}</span>
          </div>
          <div class="m-card-mid">${escapeAttr(line2)}</div>
          <div class="m-card-note">${escapeAttr(en.note || '—')}</div>
          <div class="m-card-acts">${entryActionButtonsHtml(en)}</div>
        </div>`;
      })
      .join('');
  }
}

function openRapporteOpenHours() {
  if (!IS_ADMIN) return;
  reportMode = 'open';
  syncReportFilterUi();
  showView('rapporte');
}

function openAnsaetzeFromDash() {
  if (!IS_ADMIN) return;
  sdTab = 'ansaetze';
  showView('stammdaten');
}

function renderDashOpenBlock(stats) {
  const hrsEl = document.getElementById('dOpenHrs');
  const amtEl = document.getElementById('dOpenAmt');
  const body = document.getElementById('dOpenBody');
  const count = document.getElementById('dOpenCount');
  const warn = document.getElementById('dOpenMissing');
  if (!hrsEl || !amtEl || !body) return;

  const totalHours = Number(stats?.totalHours || 0);
  const totalAmount = Number(stats?.totalAmount || 0);
  hrsEl.textContent = formatHours(totalHours);
  amtEl.textContent = `netto CHF ${formatSwissChf(totalAmount)}`;

  const sites = stats?.sites || [];
  if (count) count.textContent = String(sites.length);

  const missing = stats?.missingRate || { count: 0, hours: 0 };
  if (warn) {
    if (missing.count > 0) {
      const n = missing.count;
      const hLabel = formatHours(missing.hours);
      warn.innerHTML =
        `${n} ${n === 1 ? 'Eintrag hat' : 'Einträge haben'} keinen Ansatz (${escapeAttr(hLabel)}) und sind im Betrag nicht enthalten. ` +
        `<a href="#" onclick="event.preventDefault();openAnsaetzeFromDash();">Ansätze in Stammdaten öffnen</a>`;
      warn.style.display = 'block';
    } else {
      warn.innerHTML = '';
      warn.style.display = 'none';
    }
  }

  if (!sites.length) {
    body.innerHTML =
      '<tr><td colspan="4" style="color:var(--t3);padding:18px 10px;">Keine offenen verrechenbaren Stunden.</td></tr>';
    return;
  }

  const rows = [];
  for (const s of sites) {
    const stale = Number(s.ageDays) > 21;
    const amountCell =
      s.missingRateCount > 0 && !(Number(s.amount) > 0)
        ? '<span style="color:var(--saniga-red);font-weight:600;">Ansatz fehlt</span>'
        : s.missingRateCount > 0
          ? `CHF ${escapeAttr(formatSwissChf(s.amount))} <span style="color:var(--t3);font-size:11px;">(+ Ansatz fehlt)</span>`
          : `CHF ${escapeAttr(formatSwissChf(s.amount))}`;
    rows.push(`<tr class="${stale ? 'dash-open-stale' : ''}">
      <td><strong>${escapeAttr(s.customerName)}</strong><div style="color:var(--t3);font-size:12px;margin-top:2px;">${escapeAttr(s.siteLabel)}</div></td>
      <td class="mono">${escapeAttr(formatHours(s.hours))}</td>
      <td>${amountCell}</td>
      <td><span class="dash-open-age ${stale ? 'stale' : ''}">${escapeAttr(String(s.ageDays))} Tage</span><div style="color:var(--t3);font-size:11px;margin-top:2px;">seit ${escapeAttr(IsoWeek.formatDe(s.oldestDate))}</div></td>
    </tr>`);
  }
  body.innerHTML = rows.join('');
}

async function renderDash() {
  const t = today();
  const m = currentMonthKey();
  const monName = MOS[+m.split('-')[1]];
  const wk = wkDates();
  const team = trackedEmps();
  const teamIds = new Set(team.map((e) => e.id));
  const wkM = ENTRIES.filter((e) => wk.includes(e.date) && teamIds.has(e.empId)).reduce(
    (s, e) => s + net(e),
    0
  );
  const monM = ENTRIES.filter((e) => e.date.startsWith(m) && teamIds.has(e.empId)).reduce(
    (s, e) => s + net(e),
    0
  );
  const soll = team.reduce((s, e) => s + (e.target || 0) * 4, 0);
  // Same user set + month as Stunden card: Σ hours × hourlyRate
  const lohn = team.reduce((s, e) => s + totH(e.id, m) * (e.rate || 0), 0);
  document.getElementById('dWk').textContent = formatHoursFromMinutes(wkM);
  const dMonLbl = document.getElementById('dMonLbl');
  const dLohnLbl = document.getElementById('dLohnLbl');
  if (dMonLbl) dMonLbl.textContent = `Stunden ${monName}`;
  if (dLohnLbl) dLohnLbl.textContent = `Lohnkosten ${monName}`;
  document.getElementById('dMon').textContent = formatHoursFromMinutes(monM);
  document.getElementById('dMonSub').textContent = `von ${formatHours(soll)} Soll`;
  document.getElementById('dLohn').textContent = `CHF ${Math.round(lohn).toLocaleString('de-CH')}.–`;
  document.getElementById('dKW').textContent = String(IsoWeek.getISOWeekPartsFromYmd(t).week);

  document.getElementById('dTeam').innerHTML = team
    .map((e) => {
      const tM = ENTRIES.filter((en) => en.empId === e.id && en.date === t).reduce((s, en) => s + net(en), 0);
      const ok = tM > 0;
      return `<div class="ei">
      <div style="width:32px;height:32px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0;">${ini(e)}</div>
      <div style="flex:1;font-size:13.5px;font-weight:500;">${e.first} ${e.last}</div>
      <div style="font-size:12px;color:var(--t3);margin-right:10px;">${e.role}</div>
      <span class="badge ${ok ? 'bg' : 'br'}"><span class="bdot"></span>${ok ? formatHoursFromMinutes(tM) : 'Kein Eintrag'}</span>
    </div>`;
    })
    .join('');

  document.getElementById('dWkProg').innerHTML = team
    .map((e) => {
      const target = e.target > 0 ? e.target : 45;
      const hrs = ENTRIES.filter((en) => en.empId === e.id && wk.includes(en.date)).reduce((s, en) => s + net(en), 0) / 60;
      const pct = Math.min(100, Math.round((hrs / target) * 100));
      const col = pct >= 95 ? 'var(--green)' : pct >= 70 ? 'var(--saniga-red)' : 'var(--red)';
      return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:13px;font-weight:500;">${e.first} ${e.last}</span>
        <span class="mono" style="font-size:12px;color:var(--t2);">${formatHours(hrs)} / ${formatHours(target)}</span>
      </div>
      <div class="pb"><div class="pf" style="width:${pct}%;background:${col};"></div></div>
    </div>`;
    })
    .join('');

  try {
    const openStats = await api('/dashboard/open');
    renderDashOpenBlock(openStats);
  } catch (e) {
    renderDashOpenBlock({ totalHours: 0, totalAmount: 0, sites: [], missingRate: { count: 0, hours: 0 } });
    const warn = document.getElementById('dOpenMissing');
    if (warn) {
      warn.textContent = e.message || 'Offene Stunden konnten nicht geladen werden.';
      warn.style.display = 'block';
    }
  }
}

function renderTeamProfile() {
  const ph = document.getElementById('teamProfPlaceholder');
  const body = document.getElementById('teamProfBody');
  if (!ph || !body) return;
  const list = trackedEmps();
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
  const delBtn = body.querySelector('button[onclick="deleteTeamEmployee()"]');
  if (delBtn) delBtn.style.display = e.userRole === 'ADMIN' ? 'none' : '';
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
  const list = trackedEmps();
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
  document.getElementById('lEmpSel').innerHTML = trackedEmps()
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

async function ensureAlleFilterData() {
  if (CUSTOMERS.length && SITES.length && WORK_TYPES.length) return;
  await fetchMasterData();
}

function fillAlleSel() {
  const empSel = document.getElementById('aEmpF');
  const custSel = document.getElementById('aCustF');
  const wtSel = document.getElementById('aWtF');
  if (empSel) {
    const prev = empSel.value;
    empSel.innerHTML =
      '<option value="">Alle</option>' +
      trackedEmps()
        .map((e) => `<option value="${escapeAttr(e.id)}">${escapeAttr(e.first)} ${escapeAttr(e.last)}</option>`)
        .join('');
    if (prev) empSel.value = prev;
  }
  if (custSel) {
    const prev = custSel.value;
    custSel.innerHTML =
      '<option value="">Alle</option>' +
      CUSTOMERS.map((c) => `<option value="${escapeAttr(c.id)}">${escapeAttr(c.name)}</option>`).join('');
    if (prev) custSel.value = prev;
  }
  if (wtSel) {
    const prev = wtSel.value;
    const types = WORK_TYPES.filter((w) => w.active !== false);
    const selected = prev ? WORK_TYPES.find((w) => w.id === prev) : null;
    let html =
      '<option value="">Alle</option>' +
      types.map((w) => `<option value="${escapeAttr(w.id)}">${escapeAttr(w.label)}</option>`).join('');
    if (selected && selected.active === false) {
      html += `<option value="${escapeAttr(selected.id)}">${escapeAttr(selected.label)} (inaktiv)</option>`;
    }
    wtSel.innerHTML = html;
    if (prev) wtSel.value = prev;
  }
}

function renderAlle() {
  ensureAlleFilterData()
    .then(() => {
      fillAlleSel();
      renderAlleTable();
    })
    .catch((e) => {
      const body = document.getElementById('aBody');
      if (body) {
        body.innerHTML = `<tr><td colspan="8" style="color:var(--red);">${escapeAttr(e.message)}</td></tr>`;
      }
    });
}

function renderAlleTable() {
  const eid = document.getElementById('aEmpF')?.value || '';
  const fr = document.getElementById('aFrom')?.value || '';
  const to = document.getElementById('aTo')?.value || '';
  const custId = document.getElementById('aCustF')?.value || '';
  const wtId = document.getElementById('aWtF')?.value || '';
  const f = ENTRIES.filter((en) => {
    if (eid && en.empId !== eid) return false;
    if (fr && en.date < fr) return false;
    if (to && en.date > to) return false;
    if (wtId && en.workTypeId !== wtId) return false;
    if (custId) {
      const site = SITES.find((s) => s.id === en.siteId);
      const cId = site?.customerId || site?.customer?.id;
      if (cId !== custId) return false;
    }
    return true;
  }).sort((a, b) => (a.date > b.date ? -1 : 1));

  const totHrs = f.reduce((s, e) => s + entryHoursValue(e), 0);
  const aCount = document.getElementById('aCount');
  const aHours = document.getElementById('aHoursTotal');
  if (aCount) aCount.textContent = `${f.length} Einträge`;
  if (aHours) aHours.textContent = formatHours(totHrs);

  document.getElementById('aBody').innerHTML = f.length
    ? f
        .map((en) => {
          const e = ge(en.empId) || { first: '?', last: '', color: '#94a3b8' };
          const rowClass = isAbsenceEntry(en) ? 'entry-absence' : '';
          return `<tr class="${rowClass}">
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;">${ini(e)}</div>
        ${escapeAttr(e.first)} ${escapeAttr(e.last)}
      </div></td>
      <td class="mono" style="font-size:13px;">${fmtD(en.date)}${isLegacyEntry(en) ? '<span class="entry-alt-badge">alt</span>' : ''}</td>
      <td>${entryObjektCell(en)}</td>
      <td>${escapeAttr(entryWorkLabel(en) || '—')}</td>
      <td class="mono">${escapeAttr(formatHours(entryHoursValue(en)))}</td>
      <td style="font-size:12px;font-weight:600;color:var(--t2);">${escapeAttr(entryStatusLabel(en))}</td>
      <td style="color:var(--t2);font-size:13px;">${escapeAttr(en.note || '—')}</td>
      <td>${entryActionButtonsHtml(en)}</td>
    </tr>`;
        })
        .join('')
    : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--t3);">Keine Einträge gefunden.</td></tr>`;
}

function fillEntryEmp(selId) {
  const s = document.getElementById('eEmp');
  s.innerHTML = EMPS.map((e) => `<option value="${e.id}" ${e.id === selId ? 'selected' : ''}>${formatEmpSelectLabel(e)}</option>`).join('');
}

function showEntryErr(msg) {
  const el = document.getElementById('eEntryErr');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

/** Always fetch current sites/work types (and customers) before entry dropdowns are shown. */
async function ensureEntryMasterData() {
  await fetchMasterData();
}

function siteOptionLabel(s, { inactive = false } = {}) {
  const cust = s.customer?.name || CUSTOMERS.find((c) => c.id === s.customerId)?.name || '';
  const base = cust ? `${cust} — ${s.label}` : s.label || 'Objekt';
  return inactive || s.active === false ? `${base} (inaktiv)` : base;
}

function fillEntrySiteSelect(selectedId) {
  const sel = document.getElementById('eSite');
  if (!sel) return;
  const keep =
    selectedId !== undefined && selectedId !== null && selectedId !== ''
      ? selectedId
      : sel.value || '';
  const active = SITES.filter((s) => s.active !== false);
  const selected = keep ? SITES.find((s) => s.id === keep) : null;
  const rows = active.slice();
  if (selected && !rows.some((s) => s.id === selected.id)) {
    rows.push(selected);
  } else if (keep && !rows.some((s) => s.id === keep)) {
    rows.push({
      id: keep,
      label: 'Objekt',
      active: false,
      customerId: null,
      customer: null,
    });
  }
  if (!rows.length) {
    sel.innerHTML = '<option value="">Kein aktives Objekt</option>';
    return;
  }
  sel.innerHTML = rows
    .map((s) => {
      const inactive = s.active === false;
      return `<option value="${escapeAttr(s.id)}">${escapeAttr(siteOptionLabel(s, { inactive }))}</option>`;
    })
    .join('');
  if (keep) sel.value = keep;
}

function fillEntryWorkTypeSelect(selectedId) {
  const sel = document.getElementById('eWorkType');
  if (!sel) return;
  const keep =
    selectedId !== undefined && selectedId !== null && selectedId !== ''
      ? selectedId
      : sel.value || '';
  // Hours dialog: billable work types only (absences use «Absenzen»).
  const active = WORK_TYPES.filter((w) => w.active !== false && w.billable !== false);
  const selected = keep ? WORK_TYPES.find((w) => w.id === keep) : null;
  const opt = (w, inactive = false) => {
    const label = inactive || w.active === false ? `${w.label} (inaktiv)` : w.label;
    return `<option value="${escapeAttr(w.id)}">${escapeAttr(label)}</option>`;
  };
  let html = active.map((w) => opt(w)).join('');
  if (selected && (selected.active === false || selected.billable === false)) {
    html += opt(selected, true);
  } else if (keep && !active.some((w) => w.id === keep) && !selected) {
    html += `<option value="${escapeAttr(keep)}">Arbeitsart (inaktiv)</option>`;
  }
  if (!html) {
    sel.innerHTML = '<option value="">Keine aktive Arbeitsart</option>';
    onEntryWorkTypeChange();
    return;
  }
  sel.innerHTML = html;
  if (keep) sel.value = keep;
  onEntryWorkTypeChange();
}

function selectedEntryWorkType() {
  const id = document.getElementById('eWorkType')?.value;
  return WORK_TYPES.find((w) => w.id === id) || null;
}

function onEntryWorkTypeChange() {
  const siteFg = document.getElementById('eSiteFg');
  const hoursLabel = document.getElementById('eHoursLabel');
  if (siteFg) siteFg.style.display = '';
  if (hoursLabel) hoursLabel.textContent = 'Stunden';
}

function calcPreview() {
  const calc = document.getElementById('eCalc');
  if (!calc) return;
  const f = document.getElementById('eFrom').value;
  const t = document.getElementById('eTo').value;
  const b = +document.getElementById('eBrk').value || 0;
  if (!f || !t) {
    calc.textContent = '—';
    return;
  }
  const [fh, fm] = f.split(':').map(Number);
  const [th, tm] = t.split(':').map(Number);
  const n = th * 60 + tm - (fh * 60 + fm) - b;
  calc.textContent = n > 0 ? mDur(n) : '⚠️ Ungültige Zeit';
}
['eFrom', 'eTo', 'eBrk'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', calcPreview);
});
{
  const dateEl = document.getElementById('eDate');
  if (dateEl) {
    dateEl.addEventListener('input', syncEntryDateDisplay);
    dateEl.addEventListener('change', syncEntryDateDisplay);
  }
  ['absFrom', 'absTo'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', syncAbsenceDateDisplays);
    el.addEventListener('change', syncAbsenceDateDisplays);
  });
}

async function openAdd(date) {
  if (IS_ADMIN && !EMPS.length) {
    toast('Bitte zuerst unter «Team verwalten» eine Person anlegen.');
    return;
  }
  showEntryErr('');
  editId = null;
  fillEntryEmp(IS_ADMIN ? curUser : ME.id);
  document.getElementById('mEntryTitle').textContent = 'Stunden erfassen';
  document.getElementById('mEntrySub').textContent =
    'Mehrere Einträge am selben Tag für verschiedene Objekte sind möglich.';
  document.getElementById('eDate').value = date || today();
  document.getElementById('eHours').value = '8';
  document.getElementById('eNote').value = '';
  document.getElementById('eDel').style.display = 'none';
  try {
    await ensureEntryMasterData();
    fillEntrySiteSelect('');
    fillEntryWorkTypeSelect('');
  } catch (e) {
    showEntryErr(e.message);
  }
  openEntrySheet();
}

function openAddDate(d) {
  openAdd(d);
}

async function openEdit(id) {
  const en = ENTRIES.find((e) => e.id === id);
  if (!en) return;
  if (isAbsenceEntry(en)) {
    toast('Absenzen bitte unter «Absenzen» verwalten.');
    showView('absenzen');
    return;
  }
  if (isEntryInvoiced(en)) {
    toast(`Verrechnet auf Rechnung ${en.invoiceNumber} — Bearbeitung gesperrt`);
    return;
  }
  showEntryErr('');
  editId = id;
  fillEntryEmp(en.empId);
  document.getElementById('mEntryTitle').textContent = 'Eintrag bearbeiten';
  document.getElementById('mEntrySub').textContent = 'Passe Datum, Arbeit/Absenz und Stunden an und speichere.';
  document.getElementById('eDate').value = en.date;
  document.getElementById('eHours').value = String(
    Math.max(0.5, Math.round(entryHoursValue(en) * 2) / 2)
  );
  document.getElementById('eNote').value = en.note || '';
  document.getElementById('eDel').style.display = '';
  try {
    await ensureEntryMasterData();
    fillEntrySiteSelect(en.siteId || '');
    fillEntryWorkTypeSelect(en.workTypeId || '');
  } catch (e) {
    showEntryErr(e.message);
  }
  openEntrySheet();
}

function collectEntryForm() {
  const empId = document.getElementById('eEmp').value;
  const date = document.getElementById('eDate').value;
  const workTypeId = document.getElementById('eWorkType').value;
  const hours = Number(document.getElementById('eHours').value);
  const note = document.getElementById('eNote').value.trim();
  const wt = WORK_TYPES.find((w) => w.id === workTypeId);
  const siteId = document.getElementById('eSite').value;

  if (!date) return { error: 'Bitte ein Datum wählen.' };
  if (!workTypeId) return { error: 'Bitte eine Arbeitsart wählen.' };
  if (wt && wt.billable === false) {
    return { error: 'Absenzen bitte unter «Absenzen» erfassen.' };
  }
  if (!siteId) {
    return { error: 'Bitte ein Objekt wählen.' };
  }
  const hoursCheck = EntryLimits.validateEntryHours(hours);
  if (!hoursCheck.ok) return { error: hoursCheck.error };
  const dateCheck = EntryLimits.validateEntryDate(date, {
    todayYmd: IsoWeek.zonedYmd(new Date()),
    isAdmin: IS_ADMIN,
  });
  if (!dateCheck.ok) return { error: dateCheck.error };

  const payload = { date, siteId, workTypeId, hours: hoursCheck.hours, note };
  if (IS_ADMIN) payload.userId = empId;
  return { payload, empId, hours: hoursCheck.hours, wt };
}

function localDailyTotal(empId, date, addHours, excludeId) {
  const others = ENTRIES.filter(
    (en) => en.empId === empId && en.date === date && en.id !== excludeId
  );
  const sum = others.reduce((s, en) => s + entryHoursValue(en), 0);
  return EntryLimits.round1(sum + Number(addHours));
}

function findDuplicateEntries(empId, date, siteId, workTypeId, excludeId) {
  return ENTRIES.filter(
    (en) =>
      en.empId === empId &&
      en.date === date &&
      (en.siteId || null) === (siteId || null) &&
      en.workTypeId === workTypeId &&
      en.id !== excludeId
  );
}

function showEntryConfirmDialog({ dailyTotal, needsDailyConfirm, duplicates, wt }) {
  const body = document.getElementById('entryConfirmBody');
  const err = document.getElementById('entryConfirmErr');
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  const parts = [];
  if (needsDailyConfirm) {
    parts.push(
      `<p style="margin:0 0 10px;"><strong>Hohes Tages-Total:</strong> Nach dem Speichern wären es <strong>${escapeAttr(EntryLimits.formatHoursDe(dailyTotal))} Stunden</strong> an diesem Tag (Schwelle ${EntryLimits.DAILY_HOURS_WARN} h). Ist das korrekt?</p>`
    );
  }
  if (duplicates.length) {
    const list = duplicates
      .map(
        (en) =>
          `<li>${escapeAttr(fmtD(en.date))} · ${escapeAttr(formatHours(entryHoursValue(en)))} · ${escapeAttr(entryWorkLabel(en) || '—')}${en.note ? ` · ${escapeAttr(en.note)}` : ''}</li>`
      )
      .join('');
    parts.push(
      `<p style="margin:0 0 6px;"><strong>Möglicher Duplikat:</strong> Es gibt bereits einen Eintrag für denselben Mitarbeiter, dasselbe Datum, Objekt und ${escapeAttr(wt?.billable === false ? 'Absenz' : 'Arbeitsart')}.</p><ul style="margin:0;padding-left:18px;">${list}</ul>`
    );
  }
  if (body) body.innerHTML = parts.join('') || '<p>Bitte bestätigen.</p>';
  document.getElementById('moEntryConfirm').classList.add('open');
}

async function persistEntryPayload(payload) {
  if (editId) {
    await api(`/time-entries/${editId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    toast('Eintrag aktualisiert ✓');
  } else {
    await api('/time-entries', { method: 'POST', body: JSON.stringify(payload) });
    toast('Eintrag gespeichert ✓');
  }
  pendingEntrySave = null;
  closeM('moEntryConfirm');
  closeM('moEntry');
  await loadData();
  refreshCur();
}

async function saveEntry() {
  showEntryErr('');
  const collected = collectEntryForm();
  if (collected.error) {
    showEntryErr(collected.error);
    return;
  }
  const { payload, empId, hours, wt } = collected;
  const dailyTotal = localDailyTotal(empId, payload.date, hours, editId);
  const needsDailyConfirm = dailyTotal > EntryLimits.DAILY_HOURS_WARN;
  const duplicates = findDuplicateEntries(
    empId,
    payload.date,
    payload.siteId,
    payload.workTypeId,
    editId
  );

  if (needsDailyConfirm || duplicates.length) {
    pendingEntrySave = { payload, needsDailyConfirm };
    showEntryConfirmDialog({ dailyTotal, needsDailyConfirm, duplicates, wt });
    return;
  }

  try {
    await persistEntryPayload(payload);
  } catch (e) {
    if (e.status === 409 && e.data?.code === 'DAILY_TOTAL') {
      pendingEntrySave = { payload, needsDailyConfirm: true };
      showEntryConfirmDialog({
        dailyTotal: e.data.dailyTotal,
        needsDailyConfirm: true,
        duplicates,
        wt,
      });
      return;
    }
    showEntryErr(e.message);
  }
}

async function confirmSaveEntry() {
  if (!pendingEntrySave) return;
  const btn = document.getElementById('entryConfirmBtn');
  const err = document.getElementById('entryConfirmErr');
  if (btn) btn.disabled = true;
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
  const payload = { ...pendingEntrySave.payload };
  if (pendingEntrySave.needsDailyConfirm) payload.confirmDailyTotal = true;
  try {
    await persistEntryPayload(payload);
  } catch (e) {
    if (err) {
      err.textContent = e.message || 'Speichern fehlgeschlagen';
      err.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteEntry() {
  if (!editId) return;
  const en = ENTRIES.find((e) => e.id === editId);
  if (en && isEntryInvoiced(en)) {
    showEntryErr(`Verrechnet auf Rechnung ${en.invoiceNumber} — Löschen gesperrt`);
    return;
  }
  try {
    await api(`/time-entries/${editId}`, { method: 'DELETE' });
    await loadData();
    closeM('moEntry');
    toast('Eintrag gelöscht');
    refreshCur();
  } catch (e) {
    showEntryErr(e.message);
  }
}

async function quickDel(id) {
  const en = ENTRIES.find((e) => e.id === id);
  if (en && isEntryInvoiced(en)) {
    toast(`Verrechnet auf Rechnung ${en.invoiceNumber} — Löschen gesperrt`);
    return;
  }
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

function showEmpErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function openAddEmp() {
  document.getElementById('eEmail').value = '';
  document.getElementById('eFirst').value = '';
  document.getElementById('eLast').value = '';
  document.getElementById('eRate').value = '35';
  document.getElementById('eTarget').value = '45';
  showEmpErr('eEmpErr', '');
  document.getElementById('moEmpForm').style.display = '';
  document.getElementById('moEmpInviteResult').style.display = 'none';
  document.getElementById('moEmp').classList.add('open');
}

async function addEmp() {
  showEmpErr('eEmpErr', '');
  const first = document.getElementById('eFirst').value.trim();
  const last = document.getElementById('eLast').value.trim();
  const email = document.getElementById('eEmail').value.trim();
  if (!first || !last || !email) {
    showEmpErr('eEmpErr', 'Bitte E-Mail, Vor- und Nachname eingeben.');
    return;
  }
  try {
    const res = await api('/invitations', {
      method: 'POST',
      body: JSON.stringify({
        email,
        firstName: first,
        lastName: last,
        jobTitle: document.getElementById('eRole').value,
        hourlyRate: +document.getElementById('eRate').value || 35,
        weeklyHours: +document.getElementById('eTarget').value || 45,
      }),
    });
    const link = `${window.location.origin}/join.html?token=${encodeURIComponent(res.invitation.token)}`;
    document.getElementById('eInviteLink').value = link;
    document.getElementById('moEmpForm').style.display = 'none';
    document.getElementById('moEmpInviteResult').style.display = '';
    toast(`Einladung für ${first} ${last} erstellt`);
  } catch (e) {
    showEmpErr('eEmpErr', e.message);
  }
}

function copyInviteLink() {
  const input = document.getElementById('eInviteLink');
  if (!input || !input.value) return;
  input.select();
  navigator.clipboard.writeText(input.value).then(
    () => toast('Link kopiert'),
    () => {
      try {
        document.execCommand('copy');
        toast('Link kopiert');
      } catch {
        toast('Link manuell kopieren');
      }
    }
  );
}

function openEditEmp() {
  const e = teamSelEmpId != null ? ge(teamSelEmpId) : null;
  if (!e || !IS_ADMIN) return;
  showEmpErr('editEmpErr', '');
  document.getElementById('editFirst').value = e.first;
  document.getElementById('editLast').value = e.last;
  const roleSel = document.getElementById('editRole');
  const opts = [...roleSel.options].map((o) => o.value);
  if (e.role && !opts.includes(e.role)) {
    const opt = document.createElement('option');
    opt.value = e.role;
    opt.textContent = e.role;
    roleSel.appendChild(opt);
  }
  roleSel.value = e.role || 'Mitarbeiter';
  document.getElementById('editRate').value = String(e.rate);
  document.getElementById('editTarget').value = String(e.target);
  document.getElementById('moEditEmp').classList.add('open');
}

async function saveEditEmp() {
  showEmpErr('editEmpErr', '');
  const e = teamSelEmpId != null ? ge(teamSelEmpId) : null;
  if (!e) return;
  const firstName = document.getElementById('editFirst').value.trim();
  const lastName = document.getElementById('editLast').value.trim();
  const jobTitle = document.getElementById('editRole').value;
  const hourlyRate = +document.getElementById('editRate').value;
  const weeklyHours = +document.getElementById('editTarget').value;
  if (!firstName || !lastName) {
    showEmpErr('editEmpErr', 'Vor- und Nachname sind erforderlich.');
    return;
  }
  if (!(hourlyRate >= 0) || !(weeklyHours >= 0 && weeklyHours <= 60)) {
    showEmpErr('editEmpErr', 'Bitte gültigen Stundenlohn und Soll-Stunden prüfen.');
    return;
  }
  try {
    await api(`/employees/${e.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ firstName, lastName, jobTitle, hourlyRate, weeklyHours }),
    });
    await loadData();
    closeM('moEditEmp');
    toast('Mitarbeiter aktualisiert ✓');
    renderTeam();
  } catch (err) {
    showEmpErr('editEmpErr', err.message);
  }
}

function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  if (id === 'moEntry' || id === 'moAbsence') {
    document.body.classList.remove('entry-sheet-open');
  }
}

function syncDateDisplay(inputId, displayId, emptyLabel) {
  const input = document.getElementById(inputId);
  const disp = document.getElementById(displayId);
  if (!input || !disp) return;
  const v = input.value;
  if (!v) {
    disp.textContent = emptyLabel || 'Datum wählen';
    disp.classList.add('is-empty');
    return;
  }
  disp.classList.remove('is-empty');
  disp.textContent = fmtD(v);
}

function syncEntryDateDisplay() {
  syncDateDisplay('eDate', 'eDateDisplay', 'Datum wählen');
}

function syncAbsenceDateDisplays() {
  syncDateDisplay('absFrom', 'absFromDisplay', 'Von wählen');
  syncDateDisplay('absTo', 'absToDisplay', 'Bis wählen');
}

function openEntrySheet() {
  document.body.classList.add('entry-sheet-open');
  document.getElementById('moEntry').classList.add('open');
  syncEntryDateDisplay();
}

function openAbsenceSheet() {
  document.body.classList.add('entry-sheet-open');
  document.getElementById('moAbsence').classList.add('open');
  syncAbsenceDateDisplays();
}

document.querySelectorAll('.mo').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target !== m) return;
    // Full-screen sheets: no backdrop dismiss on phone.
    if (
      (m.id === 'moEntry' || m.id === 'moAbsence') &&
      window.matchMedia('(max-width: 767px)').matches
    ) {
      return;
    }
    m.classList.remove('open');
    if (m.id === 'moEntry' || m.id === 'moAbsence') {
      document.body.classList.remove('entry-sheet-open');
    }
  });
});

function toast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3600);
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
  ensureSelfInEmps();
  curUser = ME.id;
  fillUserSwitcher();
  const sw = document.getElementById('userSwitcher');
  if (sw) sw.value = curUser;
  syncSidebarFromCur();
  tick();
  bindMobileBottomNav();
  activeViewName = '';
  showView(IS_ADMIN ? 'dashboard' : 'meine');
  startEntrySync();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ME) {
    pollRemoteEntries();
  }
});

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
document.getElementById('logoutBtn').addEventListener('click', doLogout);
const profilLogoutBtn = document.getElementById('profilLogoutBtn');
if (profilLogoutBtn) profilLogoutBtn.addEventListener('click', doLogout);

bindMobileBottomNav();
trySession();
