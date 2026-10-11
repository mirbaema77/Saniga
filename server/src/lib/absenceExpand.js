const { ABSENCE_WORK_TYPE_LABELS } = require('./absenceWorkTypes');

function ymdToUtcDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToYmd(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, delta) {
  const dt = ymdToUtcDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return utcDateToYmd(dt);
}

/** Weekdays (Mon–Fri) inclusive between fromYmd and toYmd. */
function weekdaysInRange(fromYmd, toYmd) {
  const dates = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    const dow = ymdToUtcDate(cur).getUTCDay(); // 0=Sun … 6=Sat
    if (dow !== 0 && dow !== 6) dates.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return dates;
}

function dailyHoursFromWeekly(weeklyHours, halfDay) {
  const full = Math.round((Number(weeklyHours || 45) / 5) * 100) / 100;
  if (halfDay) return Math.round((full / 2) * 100) / 100;
  return full;
}

function minutesFromHours(hours) {
  return Math.round(Number(hours) * 60);
}

function isAbsenceWorkType(wt) {
  if (!wt || wt.billable !== false) return false;
  return ABSENCE_WORK_TYPE_LABELS.includes(wt.label) || wt.billable === false;
}

/**
 * Group time entries that belong to absences for list display.
 * @param {Array} entries — non-billable entries with workType
 */
function groupAbsenceEntries(entries) {
  const byGroup = new Map();
  const singles = [];

  for (const e of entries || []) {
    if (e.workType && e.workType.billable !== false) continue;
    if (e.absenceGroupId) {
      if (!byGroup.has(e.absenceGroupId)) byGroup.set(e.absenceGroupId, []);
      byGroup.get(e.absenceGroupId).push(e);
    } else {
      singles.push(e);
    }
  }

  const groups = [];

  for (const [groupId, rows] of byGroup) {
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));
    const hours = rows.reduce((s, r) => s + Number(r.hours != null ? r.hours : 0), 0);
    const note = rows.find((r) => r.note)?.note || '';
    groups.push({
      groupId,
      userId: rows[0].userId,
      workTypeId: rows[0].workTypeId,
      workTypeLabel: rows[0].workType?.label || 'Absenz',
      from: rows[0].date,
      to: rows[rows.length - 1].date,
      days: rows.length,
      hours: Math.round(hours * 100) / 100,
      note,
      entryIds: rows.map((r) => r.id),
      halfDay: null,
    });
  }

  for (const e of singles) {
    const hours = Number(e.hours != null ? e.hours : 0);
    groups.push({
      groupId: e.id,
      userId: e.userId,
      workTypeId: e.workTypeId,
      workTypeLabel: e.workType?.label || 'Absenz',
      from: e.date,
      to: e.date,
      days: 1,
      hours: Math.round(hours * 100) / 100,
      note: e.note || '',
      entryIds: [e.id],
      halfDay: null,
      legacy: true,
    });
  }

  groups.sort((a, b) => {
    if (a.from !== b.from) return a.from > b.from ? -1 : 1;
    return (b.to || '').localeCompare(a.to || '');
  });

  return groups;
}

module.exports = {
  weekdaysInRange,
  dailyHoursFromWeekly,
  minutesFromHours,
  ymdToUtcDate,
  addDaysYmd,
  isAbsenceWorkType,
  groupAbsenceEntries,
  ABSENCE_WORK_TYPE_LABELS,
};
