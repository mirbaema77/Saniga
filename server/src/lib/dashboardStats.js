/**
 * Dashboard month hours + Lohnkosten for time-tracked users (same set / period).
 */

function entryNetMinutes(e) {
  if (e.hours != null && !Number.isNaN(Number(e.hours))) {
    return Math.round(Number(e.hours) * 60);
  }
  const from = e.fromMinutes ?? e.from ?? 0;
  const to = e.toMinutes ?? e.to ?? 0;
  const brk = e.breakMinutes ?? e.brk ?? 0;
  return to - from - brk;
}

function entryUserId(e) {
  return e.userId ?? e.empId;
}

/**
 * @param {Array} entries
 * @param {Array<{id:string,hourlyRate:number|string,isTimeTracked?:boolean}>} users
 * @param {string} monthKey YYYY-MM
 */
function monthHoursAndLaborCost(entries, users, monthKey) {
  const tracked = (users || []).filter((u) => u.isTimeTracked !== false);
  const trackedIds = new Set(tracked.map((u) => u.id));
  const monthEntries = (entries || []).filter(
    (e) => String(e.date || '').startsWith(monthKey) && trackedIds.has(entryUserId(e))
  );

  let totalMinutes = 0;
  const minutesByUser = new Map(tracked.map((u) => [u.id, 0]));
  for (const e of monthEntries) {
    const mins = entryNetMinutes(e);
    totalMinutes += mins;
    const uid = entryUserId(e);
    minutesByUser.set(uid, (minutesByUser.get(uid) || 0) + mins);
  }

  let laborCost = 0;
  for (const u of tracked) {
    const hrs = (minutesByUser.get(u.id) || 0) / 60;
    laborCost += hrs * Number(u.hourlyRate || 0);
  }

  return {
    totalMinutes,
    totalHours: totalMinutes / 60,
    laborCost,
    trackedUserIds: tracked.map((u) => u.id),
  };
}

module.exports = {
  entryNetMinutes,
  monthHoursAndLaborCost,
};
