/** Ramachandra College exams run on Indian Standard Time (IST, UTC+5:30). */
export const COLLEGE_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET = '+05:30';

/** Combine YYYY-MM-DD + HH:mm as IST → UTC ISO string for AWS RDS. */
export function combineDateAndTimeIst(dateStr: string, timeStr: string): string {
  const date = dateStr.trim();
  let time = timeStr.trim();
  if (!date || !time) return '';
  if (/^\d{1,2}:\d{2}$/.test(time)) time = `${time}:00`;
  const ms = new Date(`${date}T${time}${IST_OFFSET}`).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toISOString();
}

/** Parse `<input type="datetime-local">` value as IST wall time. */
export function parseDatetimeLocalAsIst(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  let normalized = v;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    normalized = `${v}:00`;
  }
  const ms = new Date(`${normalized}${IST_OFFSET}`).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Fill datetime-local input from stored UTC ISO, shown in IST. */
export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLLEGE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

const DEFAULT_DISPLAY: Intl.DateTimeFormatOptions = {
  timeZone: COLLEGE_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
};

/** Human-readable schedule time for admins and students (always IST). */
export function formatCollegeDateTime(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { ...DEFAULT_DISPLAY, ...options });
}

/** YYYY-MM-DD for today in college timezone (IST). */
export function todayIstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COLLEGE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Inclusive IST calendar-day range → UTC ISO bounds for DB queries. */
export function resolveIstDateRange(
  from?: string | null,
  to?: string | null,
): { fromDate: string; toDate: string; fromIso: string; toIso: string } {
  const today = todayIstDateKey();
  let fromDate = (from?.trim() || today).slice(0, 10);
  let toDate = (to?.trim() || fromDate).slice(0, 10);
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

  const fromIso = combineDateAndTimeIst(fromDate, '00:00');
  const toIso = combineDateAndTimeIst(toDate, '23:59');
  const endMs = new Date(toIso).getTime() + 59_999;

  return {
    fromDate,
    toDate,
    fromIso: fromIso || new Date(0).toISOString(),
    toIso: Number.isFinite(endMs) ? new Date(endMs).toISOString() : new Date().toISOString(),
  };
}

export function isoFallsInIstDateRange(
  iso: string,
  fromIso: string,
  toIso: string,
): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(fromIso).getTime() && t <= new Date(toIso).getTime();
}
