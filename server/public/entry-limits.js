/**
 * Shared entry validation thresholds and helpers (browser + Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.EntryLimits = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ENTRY_HOURS_MIN = 0.5;
  const ENTRY_HOURS_MAX = 16;
  const DAILY_HOURS_WARN = 13;
  const BACKDATE_MAX_DAYS = 60;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseYmd(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return { y, m, d };
  }

  function formatHoursDe(n) {
    return (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
  }

  function entryHoursValue(e) {
    if (e == null) return 0;
    if (e.hours != null && !Number.isNaN(Number(e.hours))) return Number(e.hours);
    const from = e.fromMinutes ?? e.from ?? 0;
    const to = e.toMinutes ?? e.to ?? 0;
    const brk = e.breakMinutes ?? e.brk ?? 0;
    return Math.max(0, (to - from - brk) / 60);
  }

  function daysBetweenYmd(fromYmd, toYmd) {
    const a = parseYmd(fromYmd);
    const b = parseYmd(toYmd);
    const da = Date.UTC(a.y, a.m - 1, a.d);
    const db = Date.UTC(b.y, b.m - 1, b.d);
    return Math.round((db - da) / 86400000);
  }

  function validateEntryHours(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h < ENTRY_HOURS_MIN || h > ENTRY_HOURS_MAX) {
      return {
        ok: false,
        error: `Stunden müssen zwischen ${formatHoursDe(ENTRY_HOURS_MIN)} und ${ENTRY_HOURS_MAX} liegen.`,
      };
    }
    return { ok: true, hours: h };
  }

  /**
   * @param {string} dateYmd
   * @param {{ todayYmd: string, isAdmin: boolean }} opts
   */
  function validateEntryDate(dateYmd, opts) {
    const todayYmd = opts.todayYmd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || ''))) {
      return { ok: false, error: 'Ungültiges Datum' };
    }
    if (dateYmd > todayYmd) {
      return { ok: false, error: 'Datum darf nicht in der Zukunft liegen.' };
    }
    const ageDays = daysBetweenYmd(dateYmd, todayYmd);
    if (ageDays > BACKDATE_MAX_DAYS && !opts.isAdmin) {
      return {
        ok: false,
        error: `Datum darf höchstens ${BACKDATE_MAX_DAYS} Tage zurückliegen.`,
      };
    }
    return { ok: true };
  }

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  return {
    ENTRY_HOURS_MIN,
    ENTRY_HOURS_MAX,
    DAILY_HOURS_WARN,
    BACKDATE_MAX_DAYS,
    pad2,
    parseYmd,
    formatHoursDe,
    entryHoursValue,
    daysBetweenYmd,
    validateEntryHours,
    validateEntryDate,
    round1,
  };
});
