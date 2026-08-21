import { describe, expect, it } from 'vitest';
import type { ExamScheduleRow } from '@/lib/exam-schedule';
import {
  EXAM_SLOT_CAPACITY_DEFAULT,
  EXAM_SLOT_COUNT,
  type ExamScheduleSlotInput,
  combineDateAndTime,
  normalizeRoll,
  parseRosterCsv,
  parseScheduleSlotsJson,
  resolveStudentSlotPortalNotice,
  validateScheduleSlots,
  validateElevateXPublishSlots,
  validateOptionalConfiguredSlots,
  validateSequentialSlotGoLive,
} from '@/lib/exam-schedule-slots';

function mockSchedule(
  slot: number,
  status: ExamScheduleRow['status'],
  startsAt: string,
  endsAt: string,
): ExamScheduleRow {
  return {
    id: `sched-slot-${slot}`,
    title: `Midterm · Slot ${slot}`,
    description: null,
    notice: null,
    faculty_exam_request_id: 'req-1',
    test_id: 'test-1',
    status,
    starts_at: startsAt,
    ends_at: endsAt,
    target_departments: ['CSE'],
    target_years: ['3'],
    slot_number: slot,
    created_by: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  };
}

function makeValidSlots(): ExamScheduleSlotInput[] {
  return Array.from({ length: EXAM_SLOT_COUNT }, (_, i) => ({
    slot_number: i + 1,
    exam_date: '2026-06-15',
    start_time: '09:00',
    end_time: '11:00',
    roster: [{ roll_number: `RCE${String(i + 1).padStart(3, '0')}` }],
  }));
}

describe('normalizeRoll', () => {
  it('trims, uppercases, and removes spaces', () => {
    expect(normalizeRoll('  rce 001  ')).toBe('RCE001');
  });
});

describe('combineDateAndTime', () => {
  it('builds UTC ISO from IST date and HH:mm', () => {
    expect(combineDateAndTime('2026-06-15', '09:30')).toBe('2026-06-15T04:00:00.000Z');
  });

  it('returns empty string for invalid input', () => {
    expect(combineDateAndTime('', '09:00')).toBe('');
    expect(combineDateAndTime('2026-06-15', '')).toBe('');
  });
});

describe('parseRosterCsv', () => {
  it('parses headered CSV with department and year', () => {
    const rows = parseRosterCsv(
      'roll,name,email,department,year\nRCE001,Alice,alice@test.com,CSE,3\nRCE002,Bob,,ECE,2',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      roll_number: 'RCE001',
      student_name: 'Alice',
      email: 'alice@test.com',
      branch: 'CSE',
      academic_year: '3',
    });
    expect(rows[1]?.branch).toBe('ECE');
  });

  it('parses ElevateX-style roll,email,password,department,year rows', () => {
    const rows = parseRosterCsv(
      'RCE001,alice@test.com,Exam2026,CSE,3\nRCE002,bob@test.com,Exam2026,ECE,2',
    );
    expect(rows[0]).toMatchObject({
      roll_number: 'RCE001',
      email: 'alice@test.com',
      password: 'Exam2026',
      branch: 'CSE',
      academic_year: '3',
    });
  });

  it('parses headerless lines and deduplicates rolls', () => {
    const rows = parseRosterCsv('RCE001\nRCE001\nRCE002');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.roll_number)).toEqual(['RCE001', 'RCE002']);
  });
});

describe('parseScheduleSlotsJson', () => {
  it('normalizes roster rolls and sorts by slot number', () => {
    const slots = parseScheduleSlotsJson([
      { slot_number: 2, exam_date: '2026-06-01', start_time: '10:00', end_time: '12:00', roster: [{ roll_number: 'b1' }] },
      { slot_number: 1, exam_date: '2026-06-01', start_time: '08:00', end_time: '10:00', roster: [{ roll_number: ' a1 ' }] },
    ]);
    expect(slots.map((s) => s.slot_number)).toEqual([1, 2]);
    expect(slots[0].roster[0].roll_number).toBe('A1');
  });
});

describe('resolveStudentSlotPortalNotice', () => {
  const windowLabel = '15 Jun 2026, 10:00 – 12:00';
  const now = new Date('2026-06-15T10:30:00Z').getTime();

  it('returns null when the student slot window is open', () => {
    const mySchedule = mockSchedule(
      4,
      'live',
      '2026-06-15T09:00:00Z',
      '2026-06-15T12:00:00Z',
    );
    expect(
      resolveStudentSlotPortalNotice({
        examTitle: 'Midterm',
        facultyExamRequestId: 'req-1',
        assignedSlot: 4,
        windowLabel,
        mySchedule,
        relatedSchedules: [mySchedule],
        now,
      }),
    ).toBeNull();
  });

  it('warns when another slot is live (Slot 4 student during Slot 1)', () => {
    const slot1Live = mockSchedule(
      1,
      'live',
      '2026-06-15T09:00:00Z',
      '2026-06-15T12:00:00Z',
    );
    const slot4Scheduled = mockSchedule(
      4,
      'scheduled',
      '2026-06-15T14:00:00Z',
      '2026-06-15T16:00:00Z',
    );

    const notice = resolveStudentSlotPortalNotice({
      examTitle: 'Midterm',
      facultyExamRequestId: 'req-1',
      assignedSlot: 4,
      windowLabel,
      mySchedule: slot4Scheduled,
      relatedSchedules: [slot1Live, slot4Scheduled],
      now,
    });

    expect(notice?.headline).toBe(
      `Your slot: Slot 4 · ${windowLabel} · Not live yet`,
    );
    expect(notice?.detail).toContain('Slot 1 is live right now');
    expect(notice?.detail).toContain('Slot 4');
    expect(notice?.tone).toBe('warning');
  });

  it('shows not live yet when the assigned slot is not opened', () => {
    const slot2Scheduled = mockSchedule(
      2,
      'scheduled',
      '2026-06-15T14:00:00Z',
      '2026-06-15T16:00:00Z',
    );

    const notice = resolveStudentSlotPortalNotice({
      examTitle: 'Midterm',
      facultyExamRequestId: 'req-1',
      assignedSlot: 2,
      windowLabel,
      mySchedule: slot2Scheduled,
      relatedSchedules: [slot2Scheduled],
      now,
    });

    expect(notice?.headline).toContain('Slot 2');
    expect(notice?.headline).toContain('Not live yet');
    expect(notice?.detail).toContain('Slot 2 has not been opened');
  });
});

describe('validateElevateXPublishSlots', () => {
  it('accepts only slot 1 configured', () => {
    const slots: ExamScheduleSlotInput[] = Array.from({ length: EXAM_SLOT_COUNT }, (_, i) => ({
      slot_number: i + 1,
      exam_date: i === 0 ? '2026-06-15' : '',
      start_time: '09:00',
      end_time: '11:00',
      roster: i === 0 ? [{ roll_number: 'EXS1001' }] : [],
    }));
    expect(validateElevateXPublishSlots(slots)).toBeNull();
    expect(validateOptionalConfiguredSlots(slots)).toBeNull();
  });

  it('rejects missing slot 1 roster', () => {
    const slots: ExamScheduleSlotInput[] = [
      {
        slot_number: 1,
        exam_date: '2026-06-15',
        start_time: '09:00',
        end_time: '11:00',
        roster: [],
      },
    ];
    expect(validateElevateXPublishSlots(slots)).toMatch(/upload at least one student/i);
  });

  it('rejects partially filled slot 2', () => {
    const slots = makeValidSlots();
    slots[1] = { ...slots[1], exam_date: '2026-06-16', roster: [] };
    expect(validateElevateXPublishSlots(slots)).toBeNull();
    expect(validateOptionalConfiguredSlots(slots)).toMatch(/complete date, time, and roster/i);
  });
});

describe('validateScheduleSlots', () => {
  it('accepts eight complete slots', () => {
    expect(validateScheduleSlots(makeValidSlots())).toBeNull();
  });

  it('rejects wrong slot count', () => {
    const slots = makeValidSlots().slice(0, 7);
    expect(validateScheduleSlots(slots)).toMatch(/all 8 slots/i);
  });

  it('rejects end time before start time', () => {
    const slots = makeValidSlots();
    slots[0] = { ...slots[0], start_time: '14:00', end_time: '10:00' };
    expect(validateScheduleSlots(slots)).toMatch(/end time must be after/i);
  });

  it(`rejects more than ${EXAM_SLOT_CAPACITY_DEFAULT} students per slot`, () => {
    const slots = makeValidSlots();
    slots[0] = {
      ...slots[0],
      roster: Array.from({ length: EXAM_SLOT_CAPACITY_DEFAULT + 1 }, (_, i) => ({
        roll_number: `OVER${i}`,
      })),
    };
    expect(validateScheduleSlots(slots)).toMatch(/maximum 150/i);
  });
});

describe('validateSequentialSlotGoLive', () => {
  const base = '2026-06-15T03:30:00.000Z';
  const end = '2026-06-15T05:30:00.000Z';

  it('allows slot 1 when no other slot is live', () => {
    const related = [
      mockSchedule(1, 'scheduled', base, end),
      mockSchedule(2, 'scheduled', base, end),
    ];
    expect(validateSequentialSlotGoLive(related, 1)).toBeNull();
  });

  it('blocks slot 2 while slot 1 is still scheduled', () => {
    const related = [
      mockSchedule(1, 'scheduled', base, end),
      mockSchedule(2, 'scheduled', base, end),
    ];
    expect(validateSequentialSlotGoLive(related, 2)).toMatch(/end Slot 1/i);
  });

  it('allows slot 2 after slot 1 ended', () => {
    const related = [
      mockSchedule(1, 'ended', base, end),
      mockSchedule(2, 'scheduled', base, end),
    ];
    expect(validateSequentialSlotGoLive(related, 2)).toBeNull();
  });

  it('blocks slot 3 when slot 2 is still live', () => {
    const related = [
      mockSchedule(1, 'ended', base, end),
      mockSchedule(2, 'live', base, end),
      mockSchedule(3, 'scheduled', base, end),
    ];
    expect(validateSequentialSlotGoLive(related, 3)).toMatch(/End Slot 2/i);
  });
});
