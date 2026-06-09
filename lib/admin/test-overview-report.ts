import { isElevateXModule } from '@/lib/elevatex';
import type { AdminExamType } from '@/lib/admin/exam-type';
import type { AdminTestOverviewItem } from '@/lib/admin/tests-overview-data';
import { formatCollegeDateTime } from '@/lib/college-timezone';

/** Map an admin Tests overview row to the report tab + test filter for PDF/CSV export. */
export function reportFiltersForTestOverview(test: AdminTestOverviewItem): {
  examType: AdminExamType;
  testId: string | undefined;
  scheduleId: string | undefined;
} {
  const scheduleId = overviewScheduleId(test);

  if (test.kind === 'evalora_module') {
    if (isElevateXModule(test.test_id ?? '')) {
      return { examType: 'elevatex', testId: test.test_id ?? 'placement_full', scheduleId };
    }
    if (/\brmset\b/i.test(test.title) || /\brmset\b/i.test(test.test_id ?? '')) {
      return { examType: 'rmset', testId: test.test_id ?? undefined, scheduleId };
    }
    return { examType: 'all', testId: test.test_id ?? undefined, scheduleId };
  }

  // Scope by test + schedule window only — exam-type buckets can drop rows the overview already counted.
  if (test.kind === 'faculty_schedule' || test.kind === 'faculty_published') {
    return { examType: 'all', testId: test.test_id ?? undefined, scheduleId };
  }

  return { examType: 'all', testId: test.test_id ?? undefined, scheduleId };
}

export function overviewScheduleId(test: AdminTestOverviewItem): string | undefined {
  if (test.id.startsWith('schedule:')) return test.id.slice('schedule:'.length);
  if (test.id.startsWith('evalora:')) return test.id.slice('evalora:'.length);
  return undefined;
}

export function scheduleLabelForTestOverview(test: AdminTestOverviewItem): string | undefined {
  if (!test.starts_at) return undefined;
  const start = formatCollegeDateTime(test.starts_at);
  const slot = test.slot_number ? `Slot ${test.slot_number} · ` : '';
  if (!test.ends_at) return `${slot}${start} IST`;
  return `${slot}${start} → ${formatCollegeDateTime(test.ends_at)} IST`;
}
