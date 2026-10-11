/**
 * Official public holidays for Canton Zürich (ZH).
 * Saniga AG is in Hinwil ZH — kantonal holidays apply.
 * Only weekdays are returned (weekend holidays need no absence entry).
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Anonymous Gregorian algorithm → Easter Sunday (month 1–12). */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function addDays(year, month, day, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function isWeekday(year, month, day) {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/**
 * All official ZH public holidays for a year (incl. weekends).
 * @returns {{ date: string, name: string }[]}
 */
function zhHolidaysAll(year) {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter.year, easter.month, easter.day, -2);
  const easterMonday = addDays(easter.year, easter.month, easter.day, 1);
  const ascension = addDays(easter.year, easter.month, easter.day, 39);
  const whitMonday = addDays(easter.year, easter.month, easter.day, 50);

  return [
    { date: ymd(year, 1, 1), name: 'Neujahr' },
    { date: ymd(year, 1, 2), name: 'Berchtoldstag' },
    {
      date: ymd(goodFriday.year, goodFriday.month, goodFriday.day),
      name: 'Karfreitag',
    },
    {
      date: ymd(easterMonday.year, easterMonday.month, easterMonday.day),
      name: 'Ostermontag',
    },
    { date: ymd(year, 5, 1), name: 'Tag der Arbeit' },
    {
      date: ymd(ascension.year, ascension.month, ascension.day),
      name: 'Auffahrt',
    },
    {
      date: ymd(whitMonday.year, whitMonday.month, whitMonday.day),
      name: 'Pfingstmontag',
    },
    { date: ymd(year, 8, 1), name: 'Bundesfeiertag' },
    { date: ymd(year, 12, 25), name: 'Weihnachtstag' },
    { date: ymd(year, 12, 26), name: 'Stephanstag' },
  ];
}

/** Weekday ZH holidays only (for time-entry seeding). */
function zhHolidaysWeekdays(year) {
  return zhHolidaysAll(year).filter((h) => {
    const [y, m, d] = h.date.split('-').map(Number);
    return isWeekday(y, m, d);
  });
}

function holidayYearsAround(now = new Date()) {
  const y = now.getFullYear();
  return [y, y + 1];
}

module.exports = {
  easterSunday,
  zhHolidaysAll,
  zhHolidaysWeekdays,
  holidayYearsAround,
};
