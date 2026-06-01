import { targetDepartmentsMatchStudent } from '@/lib/department-match';
import { academicYearInList } from '@/lib/academic-year-match';
import { parseTargetStringArray } from '@/lib/targeting-parse';
import {
  getEvaloraModule,
  type EvaloraModuleDef,
  type EvaloraModuleKey,
} from '@/lib/evalora/modules';

export type EvaloraModuleScheduleRow = {
  id: string;
  module_key: string;
  title: string | null;
  notice: string | null;
  status: 'scheduled' | 'live' | 'ended';
  starts_at: string;
  ends_at: string | null;
  target_departments: string[];
  target_years: string[];
};

export type StudentEvaloraModule = {
  schedule_id: string;
  module_key: EvaloraModuleKey;
  kind: 'live' | 'upcoming';
  title: string;
  notice: string | null;
  starts_at: string;
  ends_at: string | null;
  href: string;
  icon: string;
  description: string;
  badge?: string;
};

function matchesStudent(
  row: Pick<EvaloraModuleScheduleRow, 'target_departments' | 'target_years'>,
  department: string,
  year: string,
): boolean {
  const years = parseTargetStringArray(row.target_years);
  if (years.length > 0 && !academicYearInList(year, years)) return false;
  return targetDepartmentsMatchStudent(row.target_departments, department);
}

function isLive(row: Pick<EvaloraModuleScheduleRow, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()) {
  if (row.status !== 'live') return false;
  const start = new Date(row.starts_at).getTime();
  if (Number.isNaN(start) || now < start) return false;
  if (!row.ends_at) return true;
  return now <= new Date(row.ends_at).getTime();
}

function isUpcoming(
  row: Pick<EvaloraModuleScheduleRow, 'status' | 'starts_at'>,
  now = Date.now(),
) {
  if (row.status === 'ended' || row.status === 'live') return false;
  return new Date(row.starts_at).getTime() > now;
}

export function partitionEvaloraModulesForStudent(
  rows: EvaloraModuleScheduleRow[],
  department: string,
  year: string,
): { live: StudentEvaloraModule[]; upcoming: StudentEvaloraModule[] } {
  const now = Date.now();
  const live: StudentEvaloraModule[] = [];
  const upcoming: StudentEvaloraModule[] = [];

  for (const row of rows) {
    if (!matchesStudent(row, department, year)) continue;
    const def = getEvaloraModule(row.module_key);
    if (!def) continue;

    const title = row.title?.trim() || def.name;
    const base: StudentEvaloraModule = {
      schedule_id: row.id,
      module_key: def.key,
      kind: 'live',
      title,
      notice: row.notice,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      href: def.href,
      icon: def.icon,
      description: def.description,
      badge: def.badge,
    };

    if (isLive(row, now)) live.push({ ...base, kind: 'live' });
    else if (isUpcoming(row, now)) upcoming.push({ ...base, kind: 'upcoming' });
  }

  live.sort((a, b) => a.title.localeCompare(b.title));
  upcoming.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  return { live, upcoming };
}

export function moduleDefForKey(key: string): EvaloraModuleDef | undefined {
  return getEvaloraModule(key);
}
