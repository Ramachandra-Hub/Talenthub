'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Question } from '@/lib/types';
import { useTest } from './test-context';
import { Button } from '@/components/ui/button';

interface QuestionNavigationProps {
  questions: Question[];
  currentIndex: number;
  answers: Record<string, unknown>;
  /** First unlocked index is 0; indices &gt;= this require sign-in. */
  unlockedCount: number;
  loginHref: string;
  /** Horizontal strip below proctor bar, or grid in sidebar. */
  layout?: 'grid' | 'horizontal';
}

export default function QuestionNavigation({
  questions,
  currentIndex,
  answers,
  unlockedCount,
  loginHref,
  layout = 'grid',
}: QuestionNavigationProps) {
  const { setCurrentQuestionIndex } = useTest();
  const router = useRouter();

  const isHorizontal = layout === 'horizontal';

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2 sm:mb-3">Questions</p>
      <div
        className={
          isHorizontal
            ? 'flex flex-wrap gap-1.5 max-h-[7.5rem] overflow-y-auto pr-1'
            : 'grid grid-cols-5 gap-1.5 max-h-[min(42vh,360px)] overflow-y-auto pr-1'
        }
      >
        {questions.map((question, index) => {
          const locked = index >= unlockedCount;
          const record = answers[question.id] as { userAnswer?: unknown; isMarkedForReview?: boolean } | undefined;
          const answered = record?.userAnswer !== null && record?.userAnswer !== undefined;
          const isMarked = record?.isMarkedForReview;
          const isCurrent = index === currentIndex;

          // Full pill colours: brown = marked for review (takes priority), green = answered, neutral = not visited.
          let statusClass =
            'border-2 border-slate-400 bg-slate-100 text-slate-950 shadow-sm hover:bg-slate-200 hover:border-slate-500';
          if (!locked) {
            if (isMarked) {
              statusClass =
                'border-2 border-amber-950 bg-amber-900 text-amber-50 shadow-md hover:bg-amber-950 hover:border-amber-950';
            } else if (answered) {
              statusClass =
                'border-2 border-emerald-800 bg-emerald-600 text-white shadow-md hover:bg-emerald-700 hover:border-emerald-900';
            }
            if (isCurrent) {
              statusClass += ' z-[1] ring-[3px] ring-blue-600 ring-offset-2 ring-offset-white';
            }
          }

          return (
            <Button
              key={question.id}
              type="button"
              title={locked ? 'Sign in to unlock this question' : `Question ${index + 1}`}
              aria-label={locked ? `Question ${index + 1} locked — sign in to unlock` : `Question ${index + 1}`}
              onClick={() => {
                if (locked) {
                  router.push(loginHref);
                  return;
                }
                setCurrentQuestionIndex(index);
              }}
              variant="ghost"
              className={`h-9 min-w-[2.25rem] p-1 text-xs font-bold tabular-nums rounded-md ${
                locked
                  ? 'cursor-pointer border-2 border-slate-400 bg-slate-200 text-slate-700 hover:bg-slate-300 hover:text-slate-900'
                  : statusClass
              }`}
            >
              {locked ? <Lock className="mx-auto h-3.5 w-3.5 text-slate-700" aria-hidden /> : index + 1}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
