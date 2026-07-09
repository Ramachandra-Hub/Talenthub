'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ElevateXLiveInfo } from '@/components/elevatex/elevatex-live-info';
import { ProctorConsentGate } from '@/components/proctor/proctor-consent-gate';
import { createProctorSessionId } from '@/lib/exam-v2/proctoring';
import { getElevateXTestId } from '@/lib/placement/elevatex-attempt';
import { COLLEGE } from '@/lib/college-brand';
import {
  PLACEMENT_EXAM_NAME,
  PLACEMENT_EXAM_TAGLINE,
  PLACEMENT_TOTAL_MARKS,
  PLACEMENT_TOTAL_SEC,
  defaultTechnicalFormatForDepartment,
  describeTechnicalSection,
  getActivePlacementSections,
  technicalSectionSummary,
} from '@/lib/placement/config';
import type { PlacementSectionId, PlacementTechnicalFormat } from '@/lib/placement/types';
import { formatScorePercentLabel } from '@/lib/format-score';
import {
  buildElevateXCandidateFromStudent,
  studentElevateXProfileFromAuth,
  type StudentElevateXProfile,
} from '@/lib/placement/student-candidate';
import { getClientUser } from '@/lib/client-auth';
import { fetchElevateXAttemptStatus } from '@/lib/placement/elevatex-attempt';
import {
  buildPlacementSession,
  clearPlacementDrafts,
  getPlacementCompletedAttemptId,
  saveCandidateDraft,
  savePlacementProctorSessionId,
  saveSession,
} from '@/lib/placement/session';

export default function PlacementAssessmentStartPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentElevateXProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [priorAttempt, setPriorAttempt] = useState<{
    attemptId: string;
    score?: number;
    completedAt?: string | null;
  } | null>(null);
  const [showProctorGate, setShowProctorGate] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [technicalFormat, setTechnicalFormat] = useState<PlacementTechnicalFormat>('mcq');
  const [enabledSections, setEnabledSections] = useState<PlacementSectionId[]>([]);
  const [examTotalMarks, setExamTotalMarks] = useState(PLACEMENT_TOTAL_MARKS);
  const [examDurationSec, setExamDurationSec] = useState(PLACEMENT_TOTAL_SEC);
  const [programmingDefaultLanguage, setProgrammingDefaultLanguage] = useState<'c' | 'python'>('c');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examWindowOpen, setExamWindowOpen] = useState<boolean | null>(null);

  const totalMinutes = Math.round(
    (examDurationSec > 0 ? examDurationSec : PLACEMENT_TOTAL_SEC) / 60,
  );
  const displaySections = getActivePlacementSections(
    enabledSections.length ? enabledSections : undefined,
  );

  const loadStudent = useCallback(async () => {
    setLoadError(null);
    try {
      const clientUser = await getClientUser();
      if (!clientUser?.id) {
        router.replace('/auth/login/student?redirect=/placement/assessment');
        return;
      }
      setAuthUserId(clientUser.id);

      let branch: string | null = null;
      let full_name: string | null = null;
      let college: string | null = null;

      const profileRes = await fetch('/api/student/profile', { credentials: 'include' });
      if (profileRes.ok) {
        const json = (await profileRes.json()) as {
          profile?: { full_name?: string | null; branch?: string | null; college?: string | null };
        };
        branch = json.profile?.branch ?? null;
        full_name = json.profile?.full_name ?? null;
        college = json.profile?.college ?? null;
      }

      const studentProfile = studentElevateXProfileFromAuth(
        clientUser.email ?? '',
        (clientUser.user_metadata ?? {}) as Record<string, unknown>,
        { full_name, branch, college },
      );
      setProfile(studentProfile);

      const localCompletedId = getPlacementCompletedAttemptId(studentProfile.hallTicket);
      const status = await fetchElevateXAttemptStatus(studentProfile.hallTicket);
      setExamWindowOpen(status.examWindowOpen ?? false);
      if (status.statusError) {
        setLoadError(
          'Could not verify your ElevateX status. Check your internet connection and try again.',
        );
        return;
      }
      const fmt =
        status.technicalFormat ??
        defaultTechnicalFormatForDepartment(studentProfile.departmentId);
      setTechnicalFormat(fmt);
      if (status.enabledSections?.length) setEnabledSections(status.enabledSections);
      if (status.examTotalMarks) setExamTotalMarks(status.examTotalMarks);
      if (status.examDurationSec) setExamDurationSec(status.examDurationSec);
      if (status.programmingDefaultLanguage) {
        setProgrammingDefaultLanguage(status.programmingDefaultLanguage);
      }
      const completedAttemptId =
        status.completed && status.attemptId
          ? status.attemptId
          : localCompletedId;

      if (completedAttemptId) {
        setPriorAttempt({
          attemptId: completedAttemptId,
          score: status.score,
          completedAt: status.completedAt,
        });
        clearPlacementDrafts(studentProfile.hallTicket);
      } else {
        clearPlacementDrafts(studentProfile.hallTicket);
      }
    } catch (err) {
      console.error('[placement/assessment] loadStudent', err);
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load your ElevateX session. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadStudent();
  }, [loadStudent]);

  const continueToExam = async () => {
    if (!profile) return;
    clearPlacementDrafts(profile.hallTicket);
    const status = await fetchElevateXAttemptStatus(profile.hallTicket);
    const fmt =
      status.technicalFormat ??
      technicalFormat ??
      defaultTechnicalFormatForDepartment(profile.departmentId);
    const candidate = buildElevateXCandidateFromStudent(profile, {
      technicalFormat: fmt,
      enabledSections: status.enabledSections,
      examTotalMarks: status.examTotalMarks,
      examDurationSec: status.examDurationSec,
      programmingDefaultLanguage: status.programmingDefaultLanguage,
    });
    const session = buildPlacementSession(candidate, {
      enabledSections: status.enabledSections,
      examDurationSec: status.examDurationSec,
      programmingProblems: status.programmingProblems ?? [],
    });
    saveCandidateDraft(candidate);
    saveSession(session);
    router.push('/placement/take');
  };

  const requireProctorThen = () => {
    setShowProctorGate(true);
  };

  const beginExamAfterProctor = () => {
    if (!profile) return;
    setStarting(true);
    const proctorId = createProctorSessionId(getElevateXTestId(), authUserId ?? undefined);
    savePlacementProctorSessionId(proctorId);
    setShowProctorGate(false);
    void continueToExam();
  };

  const handleStart = () => {
    if (!profile || starting || priorAttempt) return;

    if (examWindowOpen === false) {
      setLoadError(
        'ElevateX is not live right now. Check your dashboard for the official start time.',
      );
      return;
    }

    clearPlacementDrafts(profile.hallTicket);
    requireProctorThen();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading your ElevateX session…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <p className="text-slate-700 text-center max-w-md">
          {loadError ?? 'Could not load your profile. Please sign in again.'}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void loadStudent()}>
            Retry
          </Button>
          <Button asChild>
            <Link href="/exams">Back to examinations</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="relative overflow-hidden bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-600 text-white">
        <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-pink-400/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" aria-hidden />
        <div className="relative max-w-5xl mx-auto px-4 py-8">
          <Link href="/placement" className="text-sm text-white/80 hover:text-white mb-4 inline-block">
            ← Back to ElevateX hub
          </Link>
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center text-3xl shadow-lg shrink-0">
              🚀
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">
                {profile.collegeName ?? COLLEGE.shortName}
              </p>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-fuchsia-100 to-cyan-200 bg-clip-text text-transparent">
                {PLACEMENT_EXAM_NAME} · Instructions
              </h1>
              <p className="text-sm text-white/85 mt-1">
                {PLACEMENT_EXAM_TAGLINE} · {displaySections.length} sections · {examTotalMarks}{' '}
                marks · {totalMinutes} minutes
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-5 gap-8">
        <Card className="md:col-span-3 p-6 sm:p-8 shadow-sm border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Before you begin</h2>
          <p className="text-sm text-slate-600 mb-4">
            You are signed in — no need to re-enter your details. Read the instructions below, then start when
            you are ready.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-6 text-sm space-y-2">
            <p className="font-semibold text-slate-900">{profile.fullName}</p>
            <p className="text-slate-600">
              Roll: <span className="font-mono font-medium text-slate-800">{profile.hallTicket}</span>
            </p>
            <p className="text-slate-600">
              Branch: <span className="font-medium text-slate-800">{profile.departmentName}</span>
            </p>
            <p className="text-slate-600">
              Technical section (set by admin):{' '}
              <span className="font-medium text-slate-800">
                {technicalSectionSummary(technicalFormat)}
              </span>
            </p>
            <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t border-slate-200">
              {describeTechnicalSection(technicalFormat, profile.departmentName)}
            </p>
          </div>

          <ElevateXLiveInfo className="mb-6" />

          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2 mb-6">
            <li>
              <strong>One attempt only</strong> — each student may submit ElevateX exactly once while it is
              live.
            </li>
            <li>One {totalMinutes}-minute timer covers all six sections.</li>
            <li>You may switch sections freely until time runs out or you submit.</li>
            <li>Speaking section uses your microphone — allow access when prompted.</li>
            <li>
              <strong>Proctoring</strong> — camera and tab monitoring (same as RMSET); violations may
              auto-submit your paper.
            </li>
            <li>
              <strong>No resume</strong> — if you leave, refresh, or close the tab, you cannot continue
              this attempt. Finish in one sitting or submit before exiting.
            </li>
            <li>
              On the last section, tap <strong>Mark as done</strong>, then confirm <strong>Submit test</strong>{' '}
              in the popup.
            </li>
          </ul>

          {showProctorGate ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6">
              <p className="text-sm font-semibold text-slate-900 mb-3">Enable proctoring to continue</p>
              <ProctorConsentGate
                onReady={beginExamAfterProctor}
                onCancel={() => {
                  setShowProctorGate(false);
                  setStarting(false);
                }}
              />
            </div>
          ) : null}

          {priorAttempt ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mb-6 text-sm text-emerald-950">
              <p className="font-semibold">You have already submitted ElevateX</p>
              <p className="mt-1 text-emerald-900/90">
                Roll <span className="font-mono font-medium">{profile.hallTicket}</span> has already
                been used for this examination. Each student may attempt ElevateX only once — you
                cannot start the exam again.
              </p>
              {priorAttempt.score != null ? (
                <p className="mt-2 font-medium">Your score: {formatScorePercentLabel(priorAttempt.score)}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 mt-4">
                <Button asChild className="bg-emerald-800 hover:bg-emerald-900">
                  <Link href={`/placement/result/${priorAttempt.attemptId}`}>View your result</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/exams">Back to examinations</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {examWindowOpen === false ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-950">
                  <p className="font-semibold">ElevateX is not live right now</p>
                  <p className="mt-1">
                    The official examination window has not started or has ended. Check your dashboard
                    for the scheduled start time from the examination cell.
                  </p>
                </div>
              ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={starting || examWindowOpen === false}
                onClick={handleStart}
                className="bg-[#1e3a5f] hover:bg-[#16304f]"
              >
                {starting ? 'Starting…' : 'Start ElevateX exam'}
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/exams">Back to examinations</Link>
              </Button>
            </div>
            </>
          )}
        </Card>

        <Card className="md:col-span-2 p-6 sm:p-8 shadow-sm border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Section breakdown</h2>
          <ul className="space-y-3 text-sm">
            {displaySections.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md bg-white border border-slate-200 p-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden>
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.marks} marks
                      {s.id === 'technical'
                        ? ` · ${technicalSectionSummary(technicalFormat)}`
                        : s.questionCount
                          ? ` · ${s.questionCount} Q`
                          : ''}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-4">
            All sections use unique questions per student. Your technical format is configured by the
            examination cell for your branch — you cannot change it here.
          </p>
        </Card>
      </div>
    </div>
  );
}
