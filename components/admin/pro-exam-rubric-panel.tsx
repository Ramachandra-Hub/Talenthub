'use client';

import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusAlert } from '@/components/ui/status-alert';
import { QuestionBankUploadPanel } from '@/components/exam-builder/question-bank-upload-panel';
import { subtopicsForSubject } from '@/lib/exams/subject-subtopics';
import { syllabusTopicSlugForSubject } from '@/lib/exams/subject-syllabus-map';
import {
  defaultRubricForSubject,
  rubricTotalQuestions,
  type RubricTopicRow,
  type SubjectRubricConfig,
} from '@/lib/exams/pro-exam-rubric';
import type { AssessmentFormat } from '@/lib/exams/programming-subjects';

type SubjectRow = {
  id: string;
  subject_name: string;
  slug: string;
  assessment_format?: AssessmentFormat;
};

type ProExamRubricPanelProps = {
  selectedSubjects: SubjectRow[];
  rubrics: Record<string, SubjectRubricConfig>;
  onRubricsChange: (next: Record<string, SubjectRubricConfig>) => void;
  questionsPerSubject: number;
  codingProblemsPerSubject: number;
};

function emptyTopicRow(slug: string, name: string): RubricTopicRow {
  return { topicSlug: slug, topicName: name, mcqCount: 0, codingCount: 0 };
}

export function ProExamRubricPanel({
  selectedSubjects,
  rubrics,
  onRubricsChange,
  questionsPerSubject,
  codingProblemsPerSubject,
}: ProExamRubricPanelProps) {
  const allTopicSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const subject of selectedSubjects) {
      const rubric =
        rubrics[subject.id] ??
        defaultRubricForSubject({
          slug: subject.slug,
          subjectName: subject.subject_name,
          questionsPerSubject,
          codingCount:
            subject.assessment_format === 'coding' || subject.assessment_format === 'both'
              ? codingProblemsPerSubject
              : 0,
        });
      for (const row of rubric.topics) slugs.add(row.topicSlug);
    }
    return [...slugs];
  }, [selectedSubjects, rubrics, questionsPerSubject, codingProblemsPerSubject]);

  const updateSubjectRubric = useCallback(
    (subjectId: string, patch: Partial<SubjectRubricConfig>) => {
      onRubricsChange({
        ...rubrics,
        [subjectId]: {
          ...(rubrics[subjectId] ?? { topics: [], shuffleQuestions: true, logicOnlyCoding: true }),
          ...patch,
        },
      });
    },
    [onRubricsChange, rubrics],
  );

  const updateTopicRow = useCallback(
    (subjectId: string, index: number, patch: Partial<RubricTopicRow>) => {
      const current =
        rubrics[subjectId] ??
        defaultRubricForSubject({
          slug: selectedSubjects.find((s) => s.id === subjectId)?.slug ?? '',
          subjectName: selectedSubjects.find((s) => s.id === subjectId)?.subject_name ?? '',
          questionsPerSubject,
          codingCount: 0,
        });
      const topics = current.topics.map((row, i) => (i === index ? { ...row, ...patch } : row));
      updateSubjectRubric(subjectId, { topics });
    },
    [rubrics, selectedSubjects, questionsPerSubject, updateSubjectRubric],
  );

  const addTopicRow = useCallback(
    (subject: SubjectRow) => {
      const subtopics = subtopicsForSubject({
        slug: subject.slug,
        subjectName: subject.subject_name,
      });
      const defaultSlug =
        subtopics[0]?.slug ??
        syllabusTopicSlugForSubject({ slug: subject.slug, subjectName: subject.subject_name });
      const defaultName = subtopics[0]?.name ?? defaultSlug;
      const current =
        rubrics[subject.id] ??
        defaultRubricForSubject({
          slug: subject.slug,
          subjectName: subject.subject_name,
          questionsPerSubject,
          codingCount:
            subject.assessment_format === 'coding' || subject.assessment_format === 'both'
              ? codingProblemsPerSubject
              : 0,
        });
      updateSubjectRubric(subject.id, {
        topics: [...current.topics, emptyTopicRow(defaultSlug, defaultName)],
      });
    },
    [rubrics, questionsPerSubject, codingProblemsPerSubject, updateSubjectRubric],
  );

  const removeTopicRow = useCallback(
    (subjectId: string, index: number) => {
      const current = rubrics[subjectId];
      if (!current) return;
      updateSubjectRubric(subjectId, {
        topics: current.topics.filter((_, i) => i !== index),
      });
    },
    [rubrics, updateSubjectRubric],
  );

  if (!selectedSubjects.length) {
    return (
      <StatusAlert variant="info">
        Select subjects above to configure the strict rubric matrix (sub-topics, MCQ counts, coding
        snippets).
      </StatusAlert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-900">Strict rubric matrix</h3>
        <p className="text-sm text-slate-600 mt-1">
          Define exact question counts per sub-topic. On publish, questions are drawn from the bank,
          shuffled per subject, and tagged for per-subject progress on the student exam page.
        </p>
      </div>

      {selectedSubjects.map((subject) => {
        const subtopics = subtopicsForSubject({
          slug: subject.slug,
          subjectName: subject.subject_name,
        });
        const rubric =
          rubrics[subject.id] ??
          defaultRubricForSubject({
            slug: subject.slug,
            subjectName: subject.subject_name,
            questionsPerSubject,
            codingCount:
              subject.assessment_format === 'coding' || subject.assessment_format === 'both'
                ? codingProblemsPerSubject
                : 0,
          });
        const allowsCoding =
          subject.assessment_format === 'coding' || subject.assessment_format === 'both';
        const total = rubricTotalQuestions(rubric);

        return (
          <div key={subject.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{subject.subject_name}</p>
                <p className="text-xs text-slate-500">
                  {subtopics.length
                    ? `${subtopics.length} technical sub-topics available (e.g. single-algorithm exams)`
                    : 'Uses default syllabus topic for this subject'}
                </p>
              </div>
              <Badge tone="neutral">{total} questions planned</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Sub-topic / unit</th>
                    <th className="py-2 px-2 w-24">MCQs</th>
                    {allowsCoding ? <th className="py-2 px-2 w-28">Coding</th> : null}
                    <th className="py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {rubric.topics.map((row, index) => (
                    <tr key={`${row.topicSlug}-${index}`} className="border-t border-slate-200">
                      <td className="py-2 pr-3">
                        {subtopics.length ? (
                          <select
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-sm"
                            value={row.topicSlug}
                            onChange={(e) => {
                              const picked = subtopics.find((u) => u.slug === e.target.value);
                              updateTopicRow(subject.id, index, {
                                topicSlug: e.target.value,
                                topicName: picked?.name,
                              });
                            }}
                          >
                            {subtopics.map((unit) => (
                              <option key={unit.slug} value={unit.slug}>
                                {unit.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-700">{row.topicSlug}</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={row.mcqCount}
                          onChange={(e) =>
                            updateTopicRow(subject.id, index, {
                              mcqCount: Math.min(30, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                          className="h-9"
                        />
                      </td>
                      {allowsCoding ? (
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={row.codingCount ?? 0}
                            onChange={(e) =>
                              updateTopicRow(subject.id, index, {
                                codingCount: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className="h-9"
                          />
                        </td>
                      ) : null}
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeTopicRow(subject.id, index)}
                          disabled={rubric.topics.length <= 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              {subtopics.length ? (
                <Button type="button" size="sm" variant="outline" onClick={() => addTopicRow(subject)}>
                  Add sub-topic row
                </Button>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rubric.shuffleQuestions !== false}
                  onChange={(e) =>
                    updateSubjectRubric(subject.id, { shuffleQuestions: e.target.checked })
                  }
                />
                Shuffle before student sees
              </label>
              {allowsCoding ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={rubric.logicOnlyCoding === true}
                    onChange={(e) =>
                      updateSubjectRubric(subject.id, { logicOnlyCoding: e.target.checked })
                    }
                  />
                  Logic-only coding (sample I/O check)
                </label>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-slate-200 p-4 bg-white">
        <h4 className="font-semibold text-slate-900 mb-2">Upload questions to bank</h4>
        <p className="text-sm text-slate-600 mb-3">
          Upload CSV MCQs tagged to the rubric sub-topics below. Publish draws from this bank using
          the matrix above.
        </p>
        <QuestionBankUploadPanel tagIds={allTopicSlugs} syllabusRequired={allTopicSlugs.length > 0} />
      </div>
    </div>
  );
}
