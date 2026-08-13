import type { PortalExamItem } from '@/lib/student-portal';
import { isElevateXTestId } from '@/lib/elevatex';
import { resolveStudentExamDescription } from '@/lib/placement/elevatex-exam-config';
import { COLLEGE } from '@/lib/college-brand';
import { formatCollegeDateTime } from '@/lib/college-timezone';

export type ExamPresentationSection = {
  title: string;
  detail: string;
  icon: string;
};

export type StudentExamPresentation = {
  isElevateX: boolean;
  overview: string;
  paperSections: ExamPresentationSection[];
  scheduleLines: string[];
  guidelines: string[];
};

function paperSectionsFromDescription(
  description: string,
  isElevateX: boolean,
): ExamPresentationSection[] {
  const parts = description
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return [
      {
        icon: '📋',
        title: 'Examination paper',
        detail: isElevateX
          ? 'Multi-section assessment covering technical aptitude and programming skills.'
          : 'Faculty-approved question paper as configured by your department.',
      },
    ];
  }

  return parts.map((part, index) => {
    const lower = part.toLowerCase();
    let icon = '📋';
    let title = `Section ${index + 1}`;

    if (lower.includes('mcq') || lower.includes('multiple')) {
      icon = '🛠️';
      title = 'Technical — MCQ';
    } else if (lower.includes('coding') || lower.includes('problem')) {
      icon = '💻';
      title = 'Programming';
    } else if (lower.includes('aptitude')) {
      icon = '📐';
      title = 'Aptitude';
    } else if (lower.includes('speaking') || lower.includes('communication')) {
      icon = '🎙️';
      title = 'Communication';
    } else if (lower.includes('psychometric')) {
      icon = '🧠';
      title = 'Psychometric';
    } else if (lower.includes('logic')) {
      icon = '🧩';
      title = 'Logic';
    }

    return { icon, title, detail: part };
  });
}

export function buildStudentExamPresentation(
  exam: PortalExamItem,
  department?: string | null,
): StudentExamPresentation {
  const isElevateX = exam.test_id ? isElevateXTestId(exam.test_id) : false;
  const description = resolveStudentExamDescription(exam.description, null, department);

  const overview = isElevateX
    ? `This ElevateX assessment is conducted by the ${COLLEGE.departmentTitle} to evaluate your C programming fundamentals and practical coding ability. Your attempt is time-bound, auto-graded where applicable, and linked to your roll number for official reporting.`
    : `This examination has been published by your department and approved by the examination cell. It is visible here because your roll number, branch, and academic year match the scheduled roster. Please read the schedule and instructions below before you begin.`;

  const scheduleLines: string[] = [];
  if (exam.slot_number) {
    scheduleLines.push(`Assigned slot: Slot ${exam.slot_number}`);
    if (exam.slot_window_label) {
      scheduleLines.push(`Window: ${exam.slot_window_label}`);
    }
  }
  scheduleLines.push(`Opens: ${formatCollegeDateTime(exam.starts_at)}`);
  if (exam.ends_at) {
    scheduleLines.push(`Closes: ${formatCollegeDateTime(exam.ends_at)}`);
  }
  if (exam.duration_minutes) {
    scheduleLines.push(`Duration: ${exam.duration_minutes} minutes (as configured by faculty)`);
  }

  const guidelines = [
    'Sign in with the roll number and password issued by the examination cell.',
    'Confirm your department and year match your college records before starting.',
    'Use a laptop or desktop with a stable internet connection — avoid mobile browsers if possible.',
    'Do not refresh, navigate away, or open duplicate tabs once the examination has started.',
    'The Start examination control appears only when your slot window is officially open.',
    'Contact your department coordinator immediately if you cannot see your assigned paper.',
  ];

  if (isElevateX) {
    guidelines.splice(
      3,
      0,
      'For coding sections, write complete C programs — partial code may not receive marks.',
    );
  }

  return {
    isElevateX,
    overview,
    paperSections: paperSectionsFromDescription(description, isElevateX),
    scheduleLines,
    guidelines,
  };
}
