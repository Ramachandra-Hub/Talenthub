'use client';

import type { ElevateXProgrammingLanguage } from '@/lib/placement/elevatex-exam-config';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import { CodingProblemsUploadPanel } from '@/components/admin/coding-problems-upload-panel';

type Props = {
  requestId: string | null;
  initialProblems: ProgrammingProblem[];
  initialDefaultLanguage: ElevateXProgrammingLanguage;
  onProblemsChange?: (problems: ProgrammingProblem[]) => void;
  onDefaultLanguageChange?: (lang: ElevateXProgrammingLanguage) => void;
  onSaved?: () => void;
};

export function ElevateXProgrammingUploadPanel(props: Props) {
  return (
    <CodingProblemsUploadPanel
      title="Programming section — C / Python coding exam"
      requestId={props.requestId}
      initialProblems={props.initialProblems}
      initialDefaultLanguage={props.initialDefaultLanguage}
      onProblemsChange={props.onProblemsChange}
      onDefaultLanguageChange={props.onDefaultLanguageChange}
      onSaved={props.onSaved}
    />
  );
}
