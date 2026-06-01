import type { StudentEvaloraModule } from '@/lib/evalora/module-schedule';
import { isScheduleWindowOpen, type StudentExamSchedule } from '@/lib/exam-schedule';
import type { StudentSlotExamPortalNotice } from '@/lib/exam-schedule-slots';
import { formatSlotWindowLabel } from '@/lib/exam-schedule-slots';

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

function fromFaculty(exam: StudentExamSchedule): PortalExamItem {
  const slotNumber =
    exam.slot_number != null && Number.isFinite(Number(exam.slot_number))
      ? Number(exam.slot_number)
      : null;

  return {
    id: exam.id,
    source: 'faculty',
    kind: exam.kind,
    title: exam.title,
    description: exam.description?.trim() || exam.topic?.trim() || 'Faculty department examination.',
    notice: exam.notice,
    starts_at: exam.starts_at,
    ends_at: exam.ends_at,
    href: exam.take_url,
    icon: '🏫',
    badge: exam.duration_minutes ? `${exam.duration_minutes} min` : undefined,
    duration_minutes: exam.duration_minutes,
    slot_number: slotNumber,
    slot_window_label: slotNumber
      ? formatSlotWindowLabel({ starts_at: exam.starts_at, ends_at: exam.ends_at })
      : null,
    window_open: isScheduleWindowOpen(exam),
  };
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
  const live = [
    ...input.facultyLive.map(fromFaculty),
    ...input.evaloraLive.map(fromEvalora),
  ];
  const upcoming = [
    ...input.facultyUpcoming.map(fromFaculty),
    ...input.evaloraUpcoming.map(fromEvalora),
  ].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

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
