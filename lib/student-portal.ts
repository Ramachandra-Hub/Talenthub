import type { StudentEvaloraModule } from '@/lib/evalora/module-schedule';
import { isElevateXTestId } from '@/lib/elevatex';
import { isScheduleWindowOpen, type StudentExamSchedule } from '@/lib/exam-schedule';
import type { StudentSlotExamPortalNotice } from '@/lib/exam-schedule-slots';
import { formatSlotWindowLabel } from '@/lib/exam-schedule-slots';
import { resolveStudentExamDescription } from '@/lib/placement/elevatex-exam-config';

export type PortalExamItem = {
  id: string;
  source: 'evalora' | 'faculty';
  kind: 'live' | 'upcoming';
  title: string;
  description: string;
  notice: string | null;
  starts_at: string;
  ends_at: string | null;
  href: string;
  icon: string;
  badge?: string;
  duration_minutes?: number | null;
  module_key?: string;
  test_id?: string;
  slot_number?: number | null;
  slot_window_label?: string | null;
  /** False when exam is live in admin but slot window has not opened yet. */
  window_open?: boolean;
};

export type StudentPortalPayload = {
  featured: PortalExamItem | null;
  live: PortalExamItem[];
  upcoming: PortalExamItem[];
  slot_notices: StudentSlotExamPortalNotice[];
  department: string | null;
  year: string | null;
  message?: string;
};

function fromEvalora(mod: StudentEvaloraModule): PortalExamItem {
  return {
    id: mod.schedule_id,
    source: 'evalora',
    kind: mod.kind,
    title: mod.title,
    description: mod.description,
    notice: mod.notice,
    starts_at: mod.starts_at,
    ends_at: mod.ends_at,
    href: mod.href,
    icon: mod.icon,
    badge: mod.badge,
    module_key: mod.module_key,
  };
}

function fromFaculty(exam: StudentExamSchedule, department?: string | null): PortalExamItem {
  const slotNumber =
    exam.slot_number != null && Number.isFinite(Number(exam.slot_number))
      ? Number(exam.slot_number)
      : null;

  return {
    id: exam.id,
    source: 'faculty',
    kind: exam.kind,
    title: exam.title,
    description: resolveStudentExamDescription(
      exam.description,
      exam.topic,
      department,
    ),
    notice: exam.notice,
    starts_at: exam.starts_at,
    ends_at: exam.ends_at,
    href: exam.take_url,
    icon: '🏫',
    badge: exam.duration_minutes ? `${exam.duration_minutes} min` : undefined,
    duration_minutes: exam.duration_minutes,
    test_id: String(exam.test_id ?? ''),
    slot_number: slotNumber,
    slot_window_label: slotNumber
      ? formatSlotWindowLabel({ starts_at: exam.starts_at, ends_at: exam.ends_at })
      : null,
    window_open: isScheduleWindowOpen(exam),
  };
}

function portalExamKey(item: PortalExamItem): string {
  if (item.module_key) return `mod:${item.module_key}`;
  if (item.test_id) return `test:${item.test_id}`;
  return `id:${item.id}`;
}

function dedupePortalItems(items: PortalExamItem[]): PortalExamItem[] {
  const byKey = new Map<string, PortalExamItem>();
  const rank = (item: PortalExamItem) => {
    if (item.source === 'faculty' && item.kind === 'live' && item.window_open !== false) return 4;
    if (item.source === 'faculty' && item.kind === 'live') return 3;
    if (item.kind === 'live') return 2;
    return 1;
  };

  for (const item of items) {
    const key = portalExamKey(item);
    const prev = byKey.get(key);
    if (!prev || rank(item) > rank(prev)) {
      byKey.set(key, item);
      continue;
    }
    if (rank(item) === rank(prev) && item.source === 'faculty' && prev.source === 'evalora') {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

function evaloraCoveredByFacultyItem(
  mod: PortalExamItem,
  facultyItems: PortalExamItem[],
): boolean {
  if (mod.module_key !== 'placement_full') return false;
  return facultyItems.some((f) => f.test_id && isElevateXTestId(f.test_id));
}

export function buildStudentPortalPayload(input: {
  evaloraLive: StudentEvaloraModule[];
  evaloraUpcoming: StudentEvaloraModule[];
  facultyLive: StudentExamSchedule[];
  facultyUpcoming: StudentExamSchedule[];
  slotNotices?: StudentSlotExamPortalNotice[];
  department: string | null;
  year: string | null;
  message?: string;
}): StudentPortalPayload {
  const facultyLiveItems = input.facultyLive.map((exam) => fromFaculty(exam, input.department));
  const facultyUpcomingItems = input.facultyUpcoming.map((exam) =>
    fromFaculty(exam, input.department),
  );
  const allFaculty = [...facultyLiveItems, ...facultyUpcomingItems];

  const evaloraLive = input.evaloraLive
    .map(fromEvalora)
    .filter((mod) => !evaloraCoveredByFacultyItem(mod, allFaculty));
  const evaloraUpcoming = input.evaloraUpcoming
    .map(fromEvalora)
    .filter((mod) => !evaloraCoveredByFacultyItem(mod, allFaculty));

  const live = dedupePortalItems([...facultyLiveItems, ...evaloraLive]).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  const upcoming = dedupePortalItems([...facultyUpcomingItems, ...evaloraUpcoming]).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  let featured: PortalExamItem | null = null;
  if (live.length > 0) {
    featured = live[0];
  } else if (upcoming.length > 0) {
    featured = upcoming[0];
  }

  return {
    featured,
    live,
    upcoming,
    slot_notices: input.slotNotices ?? [],
    department: input.department,
    year: input.year,
    message: input.message,
  };
}
