/**
 * Shared ISO-week helpers (Europe/Zurich civil dates).
 * Works in the browser (window.IsoWeek) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IsoWeek = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TZ = 'Europe/Zurich';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Calendar YYYY-MM-DD in Europe/Zurich for an instant. */
  function zonedYmd(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function parseYmd(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return { y, m, d };
  }

  /** Format YYYY-MM-DD as DD.MM.YYYY */
  function formatDe(ymd) {
    const { y, m, d } = parseYmd(ymd);
    return `${pad2(d)}.${pad2(m)}.${y}`;
  }

  /**
   * ISO week-year + week number for a civil YYYY-MM-DD
   * (algorithm via Thursday of that week).
   */
  function getISOWeekPartsFromYmd(ymd) {
    const { y, m, d } = parseYmd(ymd);
    const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const isoYear = utc.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
    return { year: isoYear, week };
  }

  function getISOWeekParts(date = new Date()) {
    return getISOWeekPartsFromYmd(zonedYmd(date));
  }

  /** Monday–Sunday YYYY-MM-DD for an ISO week (week-year + week). */
  function isoWeekBounds(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4, 12, 0, 0));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      days.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    }
    return {
      from: days[0],
      to: days[6],
      days,
      fromLabel: formatDe(days[0]),
      toLabel: formatDe(days[6]),
    };
  }

  /** Seven YYYY-MM-DD strings for the ISO week containing `date` (Zurich). */
  function datesInCurrentIsoWeek(date = new Date()) {
    const { year, week } = getISOWeekParts(date);
    return isoWeekBounds(year, week).days;
  }

  function shiftIsoWeek(year, week, deltaWeeks) {
    const { from } = isoWeekBounds(year, week);
    const { y, m, d } = parseYmd(from);
    const utc = new Date(Date.UTC(y, m - 1, d + deltaWeeks * 7, 12, 0, 0));
    const ymd = `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
    return getISOWeekPartsFromYmd(ymd);
  }

  return {
    TZ,
    zonedYmd,
    formatDe,
    getISOWeekParts,
    getISOWeekPartsFromYmd,
    isoWeekBounds,
    datesInCurrentIsoWeek,
    shiftIsoWeek,
  };
});
