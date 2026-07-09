'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { PlacementMcqRunner } from '@/components/placement/placement-mcq-runner';
import { PlacementCodingSection } from '@/components/placement/placement-coding-section';
import type { PlacementCodingSubmission, PlacementMcqAnswerMap, PlacementTechnicalFormat } from '@/lib/placement/types';
import type { Question } from '@/lib/types';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import { cn } from '@/lib/utils';

type Props = {
  format: PlacementTechnicalFormat;
  mcq?: { questions: Question[]; answers: PlacementMcqAnswerMap };
  coding?: {
    problems: ProgrammingProblem[];
    submissions: Record<string, PlacementCodingSubmission>;
  };
  onMcqAnswerChange: (questionId: string, value: string | null) => void;
  onCodingSubmissionChange: (submission: PlacementCodingSubmission) => void;
};

export function PlacementTechnicalSection({
  format,
  mcq,
  coding,
  onMcqAnswerChange,
  onCodingSubmissionChange,
}: Props) {
  const [tab, setTab] = useState<'mcq' | 'coding'>(format === 'coding' ? 'coding' : 'mcq');

  if (format === 'mcq' && mcq) {
    return (
      <PlacementMcqRunner
        sectionId="technical"
        questions={mcq.questions}
        answers={mcq.answers}
        onAnswerChange={onMcqAnswerChange}
      />
    );
  }

  if (format === 'coding' && coding) {
    return (
      <PlacementCodingSection
        problems={coding.problems}
        submissions={coding.submissions}
        sectionTitle="Technical coding"
        onSubmissionChange={onCodingSubmissionChange}
      />
    );
  }

  if (format === 'both' && mcq && coding) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-semibold',
              tab === 'mcq' ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white' : 'border-slate-200 bg-white text-slate-700',
            )}
            onClick={() => setTab('mcq')}
          >
            Department MCQs ({mcq.questions.length})
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-semibold',
              tab === 'coding' ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white' : 'border-slate-200 bg-white text-slate-700',
            )}
            onClick={() => setTab('coding')}
          >
            Coding ({coding.problems.length} problems)
          </button>
        </div>
        <div className={tab === 'mcq' ? '' : 'hidden'}>
          <PlacementMcqRunner
            sectionId="technical"
            questions={mcq.questions}
            answers={mcq.answers}
            onAnswerChange={onMcqAnswerChange}
          />
        </div>
        <div className={tab === 'coding' ? '' : 'hidden'}>
          <PlacementCodingSection
            problems={coding.problems}
            submissions={coding.submissions}
            sectionTitle="Technical coding"
            onSubmissionChange={onCodingSubmissionChange}
          />
        </div>
      </div>
    );
  }

  return <Card className="p-6 text-center text-slate-600">Technical section is not configured for this attempt.</Card>;
}
