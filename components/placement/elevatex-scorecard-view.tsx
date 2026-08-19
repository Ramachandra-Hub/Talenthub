'use client';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import { cn } from '@/lib/utils';
import { findDepartment } from '@/lib/placement/config';
import type { PlacementScorecard } from '@/lib/placement/types';
import { CodingDeepAnalysisView } from '@/components/placement/coding-deep-analysis-view';

function formatHms(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const READINESS_COLORS: Record<PlacementScorecard['placementReadiness'], string> = {
  Excellent: 'bg-emerald-500',
  Strong: 'bg-emerald-400',
  Developing: 'bg-amber-500',
  'Needs work': 'bg-red-500',
};

type ElevateXScorecardViewProps = {
  scorecard: PlacementScorecard;
  compact?: boolean;
  className?: string;
};

export function ElevateXScorecardView({ scorecard, compact, className }: ElevateXScorecardViewProps) {
  const dept = findDepartment(scorecard.candidate.departmentId);
  const readinessClass = READINESS_COLORS[scorecard.placementReadiness];
  const isExamReport = scorecard.reportKind === 'exam';

  return (
    <div className={cn('space-y-6', className)}>
      <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6 sm:p-8')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {scorecard.candidate.collegeName ?? 'Campus Assessment'}
            </p>
            <h2
              className={cn(
                'font-bold mt-1 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent',
                compact ? 'text-xl' : 'text-3xl',
              )}
            >
              {scorecard.candidate.examName?.trim() || 'Exam Scorecard'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {scorecard.candidate.fullName} ·{' '}
              <span className="font-mono">{scorecard.candidate.hallTicket}</span>
              {scorecard.candidate.email ? (
                <>
                  {' '}
                  · <span>{scorecard.candidate.email}</span>
                </>
              ) : null}{' '}
              · {dept?.name ?? 'Custom department'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Completed {new Date(scorecard.completedAt).toLocaleString()} ·{' '}
              {formatHms(scorecard.totalElapsedSec)} on test
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall</p>
            <p className={cn('font-bold text-[#0c2340] mt-1 tabular-nums', compact ? 'text-3xl' : 'text-5xl')}>
              {formatScorePercentLabel(scorecard.percentage)}
            </p>
            <p className="text-sm text-slate-600 mt-1 tabular-nums">
              {scorecard.earnedMarks} / {scorecard.totalMarks} marks
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-6">
          <RatingTile
            label={isExamReport ? 'Overall result' : 'Placement readiness'}
            value={isExamReport ? formatScorePercentLabel(scorecard.percentage) : scorecard.placementReadiness}
            badgeClass={readinessClass}
            subtitle={
              isExamReport
                ? scorecard.sections.map((s) => s.name).join(' · ') || 'Selected exam subjects'
                : `${formatScorePercentLabel(scorecard.percentage)} composite`
            }
          />
          <RatingTile
            label={isExamReport ? 'Subject average' : 'Technical rating'}
            value={formatScorePercentLabel(scorecard.technicalRating)}
            badgeClass="bg-[#1e3a5f]"
          />
          {isExamReport ? (
            <RatingTile
              label="Subjects"
              value={scorecard.sections.map((s) => s.name).join(', ') || String(scorecard.sections.length)}
              badgeClass="bg-indigo-600"
              subtitle="Only subjects selected for this exam"
            />
          ) : (
            <RatingTile
              label="Communication rating"
              value={formatScorePercentLabel(scorecard.communicationRating)}
              badgeClass="bg-emerald-600"
            />
          )}
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            {isExamReport ? 'Overall score' : 'Employability score'}
          </p>
          <div className="flex items-center gap-3">
            <Progress value={scorecard.employabilityScore} className="h-2 flex-1" />
            <span className="text-2xl font-bold text-[#0c2340] tabular-nums">
              {formatScorePercent(scorecard.employabilityScore)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {isExamReport
              ? 'This report covers only the subjects selected when the exam was built and conducted.'
              : '50% Technical · 25% Communication · 25% Cognitive (Aptitude + Logic + IQ)'}
          </p>
        </div>
      </Card>

      <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6')}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {isExamReport ? 'Subject-wise performance' : 'Section-wise performance'}
            </h3>
        <div className="space-y-3">
          {scorecard.sections.map((s) => (
            <div key={s.sectionId} className="rounded-lg border border-slate-200 p-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="text-sm text-slate-600 tabular-nums">
                  {formatScorePercent(s.earned)} / {s.marks} marks · {formatScorePercentLabel(s.percent)}
                </p>
              </div>
              <Progress value={s.percent} className="h-1.5 mt-2" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs text-slate-600">
                {s.total != null ? (
                  <>
                    <Stat label="Correct" value={s.correct ?? 0} />
                    <Stat label="Wrong" value={s.wrong ?? 0} />
                    <Stat label="Skipped" value={s.skipped ?? 0} />
                    <Stat label="Total" value={s.total} />
                  </>
                ) : (
                  <>
                    <Stat label="Fluency" value={formatScorePercentLabel(s.fluency ?? 0)} />
                    <Stat label="Clarity" value={formatScorePercentLabel(s.clarity ?? 0)} />
                    <Stat label="Grammar" value={formatScorePercentLabel(s.grammar ?? 0)} />
                    <Stat label="Section %" value={formatScorePercentLabel(s.percent)} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {scorecard.codingAnalysis ? (
        <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6')}>
          <CodingDeepAnalysisView analysis={scorecard.codingAnalysis} compact={compact} />
        </Card>
      ) : null}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6')}>
          <h3 className="text-base font-bold text-emerald-700 mb-3">Strengths</h3>
          {scorecard.strengths.length === 0 ? (
            <p className="text-sm text-slate-500">
              Keep building — practice more sections to surface strengths.
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-slate-700">
              {scorecard.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-emerald-600">●</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6')}>
          <h3 className="text-base font-bold text-amber-700 mb-3">Areas to improve</h3>
          {scorecard.weaknesses.length === 0 ? (
            <p className="text-sm text-slate-500">No weak sections in this attempt — great work!</p>
          ) : (
            <ul className="space-y-2 text-sm text-slate-700">
              {scorecard.weaknesses.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600">●</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className={cn('shadow-md border-slate-200', compact ? 'p-4' : 'p-6')}>
        <h3 className="text-base font-bold text-slate-900 mb-3">AI recommendations</h3>
        {scorecard.recommendations.length === 0 ? (
          <p className="text-sm text-slate-500">Solid run — repeat the assessment next month to track progress.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            {scorecard.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RatingTile({
  label,
  value,
  badgeClass,
  subtitle,
}: {
  label: string;
  value: string;
  badgeClass: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex items-center gap-2 mt-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', badgeClass)} />
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
      {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}
