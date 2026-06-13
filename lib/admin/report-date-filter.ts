const IST_TIME_ZONE = 'Asia/Kolkata';

/** Calendar date in IST as YYYY-MM-DD (en-CA locale). */
export function getDateKeyInTimeZone(date: Date, timeZone = IST_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getTodayDateKeyInIST(now = new Date()): string {
  return getDateKeyInTimeZone(now, IST_TIME_ZONE);
}

/** UTC ISO bounds for a calendar day in IST (for DB range queries). */
export function getIstDayBoundsIso(dateKey: string): { start: string; end: string } {
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

/** True if an ISO timestamp falls on the given calendar day in IST. */
export function isInstantOnDateKey(
  iso: string | null | undefined,
  dateKey: string,
  timeZone = IST_TIME_ZONE,
): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return getDateKeyInTimeZone(d, timeZone) === dateKey;
}

export function parseReportDateFilter(
  value: string | null | undefined,
): { dateKey: string; label: string } | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const dateKey = raw === 'today' ? getTodayDateKeyInIST() : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return { dateKey, label: formatDateKeyLabel(dateKey) };
}

function parseDateKeyParam(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const dateKey = raw === 'today' ? getTodayDateKeyInIST() : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return dateKey;
}

export type ReportDateRangeFilter = {
  startKey: string;
  endKey: string;
  label: string;
  isSingleDay: boolean;
};

/** Inclusive IST calendar-day range (startKey ≤ endKey). */
export function parseReportDateRangeFilter(
  startValue: string | null | undefined,
  endValue?: string | null | undefined,
): ReportDateRangeFilter | null {
  const startKey = parseDateKeyParam(startValue);
  if (!startKey) return null;
  const endKey = parseDateKeyParam(endValue) ?? startKey;
  if (startKey > endKey) {
    return {
      startKey: endKey,
      endKey: startKey,
      label: formatDateRangeLabel(endKey, startKey),
      isSingleDay: endKey === startKey,
    };
  }
  return {
    startKey,
    endKey,
    label: formatDateRangeLabel(startKey, endKey),
    isSingleDay: startKey === endKey,
  };
}

export function formatDateRangeLabel(startKey: string, endKey: string): string {
  if (startKey === endKey) return formatDateKeyLabel(startKey);
  return `${formatDateKeyLabel(startKey)} – ${formatDateKeyLabel(endKey)}`;
}

/** True if an ISO timestamp falls on any calendar day in [startKey, endKey] (IST, inclusive). */
export function isInstantInDateRange(
  iso: string | null | undefined,
  startKey: string,
  endKey: string,
  timeZone = IST_TIME_ZONE,
): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const key = getDateKeyInTimeZone(d, timeZone);
  return key >= startKey && key <= endKey;
}

/** True if schedule start falls on any day in [startKey, endKey] (IST). */
export function isScheduleStartInDateRange(
  startsAt: string | null | undefined,
  startKey: string,
  endKey: string,
): boolean {
  if (!startsAt || !startKey || !endKey) return false;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const key = getDateKeyInTimeZone(d);
  return key >= startKey && key <= endKey;
}

/** Prefer completion time; fall back to start time for in-progress attempts. */
export function attemptActivityDateKey(attempt: {
  completed_at: string | null;
  created_at: string;
}): string | null {
  const iso = attempt.completed_at ?? attempt.created_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return getDateKeyInTimeZone(d, IST_TIME_ZONE);
}
