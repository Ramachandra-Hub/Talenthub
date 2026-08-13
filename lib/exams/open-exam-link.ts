import { randomBytes, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { studentAuthEmail } from '@/lib/college-auth';
import { DEPARTMENTS, ACADEMIC_YEARS } from '@/lib/college-brand';
import { normalizeRoll } from '@/lib/exam-schedule-slots';
import { DEFAULT_EXAM_STUDENT_PASSWORD } from '@/lib/roster-credentials-export';
import { hashPassword, verifyPassword } from '@/lib/password';
import { studentTakeUrlForTestId } from '@/lib/exam-builder/elevatex-exam';
import * as XLSX from 'xlsx';

export function newOpenLinkToken(): string {
  return randomBytes(16).toString('hex');
}

export function openJoinPath(token: string): string {
  return `/join/${token}`;
}

export function resolveOpenLinkPassword(stored: string | null | undefined): string {
  return stored?.trim() || DEFAULT_EXAM_STUDENT_PASSWORD;
}

export type OpenExamPublicInfo = {
  title: string;
  duration: number;
  defaultPassword: string;
  token: string;
};

export async function getOpenExamByToken(token: string): Promise<OpenExamPublicInfo | null> {
  const exam = await prisma.exam.findUnique({
    where: { openLinkToken: token },
    select: {
      title: true,
      duration: true,
      openLinkEnabled: true,
      openLinkPassword: true,
      publishedTestId: true,
      status: true,
    },
  });
  if (!exam?.openLinkEnabled || !exam.publishedTestId) return null;
  return {
    title: exam.title,
    duration: exam.duration,
    defaultPassword: resolveOpenLinkPassword(exam.openLinkPassword),
    token,
  };
}

export type JoinOpenExamResult = {
  takeUrl: string;
  rollNumber: string;
  userId: string;
};

export async function joinOpenExam(input: {
  token: string;
  rollNumber: string;
  password: string;
  branch: string;
  year: string;
}): Promise<JoinOpenExamResult> {
  const rollNumber = normalizeRoll(input.rollNumber);
  const branch = input.branch.trim();
  const year = input.year.trim();
  const password = input.password;

  if (!rollNumber) throw new Error('Roll number is required.');
  if (!DEPARTMENTS.includes(branch as (typeof DEPARTMENTS)[number])) {
    throw new Error('Select a valid department / branch.');
  }
  if (!ACADEMIC_YEARS.includes(year as (typeof ACADEMIC_YEARS)[number])) {
    throw new Error('Select a valid academic year.');
  }

  const exam = await prisma.exam.findUnique({
    where: { openLinkToken: input.token },
    select: {
      id: true,
      title: true,
      openLinkEnabled: true,
      openLinkPassword: true,
      publishedTestId: true,
      facultyExamRequestId: true,
    },
  });
  if (!exam?.openLinkEnabled || !exam.publishedTestId) {
    throw new Error('This open exam link is not active.');
  }

  const expected = resolveOpenLinkPassword(exam.openLinkPassword);
  const email = studentAuthEmail(rollNumber);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ rollNumber }, { rollNumber: rollNumber.replace(/\s+/g, '') }, { email }],
    },
  });

  const existingMatches = existing?.passwordHash
    ? await verifyPassword(password, existing.passwordHash)
    : false;
  const passwordOk = existingMatches || password === expected;
  if (!passwordOk) {
    throw new Error(`Use the default exam password (${expected}).`);
  }

  const passwordHash =
    existingMatches && existing?.passwordHash
      ? existing.passwordHash
      : await hashPassword(expected);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          rollNumber,
          branch,
          academicYear: year,
          userRole: 'student',
          ...(existingMatches ? {} : { passwordHash }),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          rollNumber,
          fullName: rollNumber,
          branch,
          academicYear: year,
          userRole: 'student',
        },
      });

  await prisma.examOpenLinkEntry.upsert({
    where: {
      examId_rollNumber: { examId: exam.id, rollNumber },
    },
    create: {
      examId: exam.id,
      rollNumber,
      branch,
      year,
      userId: user.id,
    },
    update: {
      branch,
      year,
      userId: user.id,
    },
  });

  if (exam.facultyExamRequestId) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { facultyExamRequestId: exam.facultyExamRequestId, attemptRound: 1 },
      orderBy: { slotNumber: 'asc' },
      select: { id: true, slotNumber: true },
    });
    if (schedule) {
      const rosterRow = await prisma.examStudentRoster.findFirst({
        where: { scheduleId: schedule.id, rollNumber },
        select: { id: true },
      });
      if (!rosterRow) {
        await prisma.examStudentRoster.create({
          data: {
            scheduleId: schedule.id,
            rollNumber,
            fullName: user.fullName ?? rollNumber,
            branch,
            year,
          },
        });
      }
      const already = await prisma.examSlotRosterEntry.findFirst({
        where: {
          scheduleId: schedule.id,
          rollNumber,
        },
        select: { id: true },
      });
      if (!already) {
        await prisma.examSlotRosterEntry.create({
          data: {
            id: randomUUID(),
            facultyExamRequestId: exam.facultyExamRequestId,
            scheduleId: schedule.id,
            slotNumber: schedule.slotNumber ?? 1,
            rollNumber,
            studentName: user.fullName ?? rollNumber,
            email,
            department: branch,
            year,
          },
        });
      }
    }
  }

  return {
    takeUrl: studentTakeUrlForTestId(exam.publishedTestId),
    rollNumber,
    userId: user.id,
  };
}

export async function listOpenLinkEntries(examId: string) {
  return prisma.examOpenLinkEntry.findMany({
    where: { examId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Open-link exams stay hidden on the student portal until the student joins via the public URL. */
export async function getOpenLinkRequestVisibility(rollNumber: string | null | undefined): Promise<{
  openLinkRequestIds: Set<string>;
  joinedOpenLinkRequestIds: Set<string>;
}> {
  const exams = await prisma.exam.findMany({
    where: { openLinkEnabled: true, facultyExamRequestId: { not: null } },
    select: { id: true, facultyExamRequestId: true },
    take: 500,
  });
  const openLinkRequestIds = new Set(
    exams
      .map((exam) => exam.facultyExamRequestId)
      .filter((id): id is string => Boolean(id)),
  );
  const joinedOpenLinkRequestIds = new Set<string>();
  const roll = rollNumber ? normalizeRoll(rollNumber) : '';
  if (roll && exams.length) {
    const entries = await prisma.examOpenLinkEntry.findMany({
      where: {
        rollNumber: roll,
        examId: { in: exams.map((exam) => exam.id) },
      },
      select: { examId: true },
    });
    const requestByExamId = new Map(
      exams.map((exam) => [exam.id, exam.facultyExamRequestId] as const),
    );
    for (const entry of entries) {
      const requestId = requestByExamId.get(entry.examId);
      if (requestId) joinedOpenLinkRequestIds.add(requestId);
    }
  }
  return { openLinkRequestIds, joinedOpenLinkRequestIds };
}

export function studentMaySeeOpenLinkExam(
  requestId: string | null | undefined,
  openLinkRequestIds: Set<string>,
  joinedOpenLinkRequestIds: Set<string>,
): boolean {
  if (!requestId || !openLinkRequestIds.has(requestId)) return true;
  return joinedOpenLinkRequestIds.has(requestId);
}

export function openLinkEntriesToXlsxBuffer(
  examTitle: string,
  defaultPassword: string,
  rows: { rollNumber: string; branch: string; year: string; createdAt: Date }[],
): Buffer {
  const sheet = rows.map((row, index) => ({
    '#': index + 1,
    'Roll number': row.rollNumber,
    Branch: row.branch,
    Year: row.year,
    'Joined at': row.createdAt.toISOString(),
    'Default password': defaultPassword,
    Exam: examTitle,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    sheet.length
      ? sheet
      : [
          {
            '#': '',
            'Roll number': '',
            Branch: '',
            Year: '',
            'Joined at': '',
            'Default password': defaultPassword,
            Exam: examTitle,
          },
        ],
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Open link joins');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
