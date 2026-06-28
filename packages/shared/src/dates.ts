/**
 * Date and fiscal-year utilities.
 *
 * Conventions:
 *  - All Date instances are interpreted and produced in UTC. Local time is a
 *    user-presentation concern handled at the edges.
 *  - Fiscal year defaults to India (Apr 1 - Mar 31). Configurable for tenants
 *    on other fiscal calendars (e.g. US federal Oct 1, UK Apr 6).
 *  - Periods are inclusive on both ends — end-exclusive ranges would force
 *    every caller to subtract a day in the UI.
 */

export interface FiscalYearConfig {
  /** 1-12, default 4 (April). */
  startMonth: number;
  /** 1-31, default 1. */
  startDay: number;
}

const DEFAULT_FY: FiscalYearConfig = { startMonth: 4, startDay: 1 };

function toDate(d: Date | string): Date {
  if (d instanceof Date) return new Date(d.getTime());
  // Accept both YYYY-MM-DD (parsed as UTC midnight) and full ISO strings.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(`${d}T00:00:00.000Z`);
  }
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${d}`);
  }
  return parsed;
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function endOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    23, 59, 59, 999,
  ));
}

export interface FiscalYearInfo {
  fyLabel: string;
  startsAt: Date;
  endsAt: Date;
  /** The calendar year in which the fiscal year starts. */
  year: number;
}

export function getFiscalYear(
  date: Date | string,
  config: FiscalYearConfig = DEFAULT_FY,
): FiscalYearInfo {
  const d = toDate(date);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  // If the date falls before the FY start in its calendar year, it belongs to
  // the FY that started the previous calendar year.
  const startsInYear =
    m > config.startMonth || (m === config.startMonth && day >= config.startDay)
      ? y
      : y - 1;
  const startsAt = utc(startsInYear, config.startMonth, config.startDay);
  // End: one day before the next FY's start.
  const nextStart = utc(startsInYear + 1, config.startMonth, config.startDay);
  const endsAt = new Date(nextStart.getTime() - 1);
  const yyShort = String((startsInYear + 1) % 100).padStart(2, '0');
  return {
    fyLabel: `FY${startsInYear}-${yyShort}`,
    startsAt,
    endsAt,
    year: startsInYear,
  };
}

interface DateRange {
  start: Date;
  end: Date;
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function fyFromLabel(label: string, config: FiscalYearConfig): FiscalYearInfo {
  const m = /^FY(\d{4})-(\d{2})$/.exec(label);
  if (!m || m[1] === undefined) throw new Error(`Invalid FY label: ${label}`);
  const startYear = Number(m[1]);
  const startsAt = utc(startYear, config.startMonth, config.startDay);
  const endsAt = new Date(
    utc(startYear + 1, config.startMonth, config.startDay).getTime() - 1,
  );
  const yyShort = String((startYear + 1) % 100).padStart(2, '0');
  return {
    fyLabel: `FY${startYear}-${yyShort}`,
    startsAt,
    endsAt,
    year: startYear,
  };
}

export function parsePeriod(
  s: string,
  config: FiscalYearConfig = DEFAULT_FY,
): DateRange {
  const raw = s.trim();

  // Range form: YYYY-MM-DD..YYYY-MM-DD
  const rangeMatch = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    return {
      start: toDate(rangeMatch[1]),
      end: endOfDayUtc(toDate(rangeMatch[2])),
    };
  }

  // Quarter: "Q1 FY2024-25" through Q4 — quarters relative to FY start.
  const qMatch = /^Q([1-4])\s+FY(\d{4})-(\d{2})$/i.exec(raw);
  if (qMatch && qMatch[1] && qMatch[2]) {
    const q = Number(qMatch[1]);
    const fy = fyFromLabel(`FY${qMatch[2]}-${qMatch[3]}`, config);
    const qStartMonth = ((config.startMonth - 1 + (q - 1) * 3) % 12) + 1;
    const qStartYear =
      config.startMonth + (q - 1) * 3 > 12 ? fy.year + 1 : fy.year;
    const qStart = utc(qStartYear, qStartMonth, config.startDay);
    const nextQ = new Date(qStart);
    nextQ.setUTCMonth(nextQ.getUTCMonth() + 3);
    return { start: qStart, end: new Date(nextQ.getTime() - 1) };
  }

  // FY label: "FY2024-25"
  if (/^FY\d{4}-\d{2}$/i.test(raw)) {
    const fy = fyFromLabel(raw.toUpperCase(), config);
    return { start: fy.startsAt, end: fy.endsAt };
  }

  // "Apr 2024"
  const monthNameMatch = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(raw);
  if (monthNameMatch && monthNameMatch[1] && monthNameMatch[2]) {
    const monthKey = monthNameMatch[1].slice(0, 3).toLowerCase();
    const monthIdx = MONTH_NAMES.indexOf(monthKey);
    if (monthIdx >= 0) {
      const year = Number(monthNameMatch[2]);
      const start = utc(year, monthIdx + 1, 1);
      const nextMonthStart = utc(year, monthIdx + 2, 1);
      return { start, end: new Date(nextMonthStart.getTime() - 1) };
    }
  }

  // ISO month "2024-04"
  const isoMonthMatch = /^(\d{4})-(\d{2})$/.exec(raw);
  if (isoMonthMatch && isoMonthMatch[1] && isoMonthMatch[2]) {
    const y = Number(isoMonthMatch[1]);
    const mo = Number(isoMonthMatch[2]);
    const start = utc(y, mo, 1);
    const nextMonthStart = utc(y, mo + 1, 1);
    return { start, end: new Date(nextMonthStart.getTime() - 1) };
  }

  throw new Error(`Unrecognized period: ${s}`);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function formatPeriod(start: Date, end: Date): string {
  return `${isoDate(start)}..${isoDate(end)}`;
}

const MS_PER_DAY = 86_400_000;

export function daysInPeriod(start: Date, end: Date): number {
  // Inclusive: a single-day period is 1 day, not 0.
  const startDay = Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
  );
  const endDay = Date.UTC(
    end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(),
  );
  return Math.floor((endDay - startDay) / MS_PER_DAY) + 1;
}

export function overlapDays(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): number {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (end < start) return 0;
  return daysInPeriod(start, end);
}

export interface MonthBucket {
  start: Date;
  end: Date;
  year: number;
  /** 1-12. */
  month: number;
}

export function splitIntoMonths(start: Date, end: Date): MonthBucket[] {
  const out: MonthBucket[] = [];
  let cursor = utc(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  // First bucket: from `start` to either end-of-month or `end`.
  let firstNextMonth = utc(start.getUTCFullYear(), start.getUTCMonth() + 2, 1);
  let firstEnd = new Date(
    Math.min(firstNextMonth.getTime() - 1, end.getTime()),
  );
  out.push({
    start: new Date(start.getTime()),
    end: firstEnd,
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
  });
  cursor = firstNextMonth;
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const nextMonthStart = utc(y, m + 1, 1);
    const monthEnd = new Date(
      Math.min(nextMonthStart.getTime() - 1, end.getTime()),
    );
    out.push({
      start: new Date(cursor.getTime()),
      end: monthEnd,
      year: y,
      month: m,
    });
    cursor = nextMonthStart;
  }
  return out;
}
