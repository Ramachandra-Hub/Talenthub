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
  PLACEMENT_DEPARTMENTS,
  PLACEMENT_EXAM_NAME,
  PLACEMENT_EXAM_TAGLINE,
  PLACEMENT_SECTIONS,
  PLACEMENT_TOTAL_MARKS,
  PLACEMENT_TOTAL_SEC,
  defaultTechnicalFormatForDepartment,
  describeTechnicalSection,
  technicalSectionSummary,
} from '@/lib/placement/config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';
import { cn } from '@/lib/utils';
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
  loadActivePlacementSession,
  loadSessionByHallTicket,
  getPlacementCompletedAttemptId,
  saveCandidateDraft,
  savePlacementProctorSessionId,
  saveSession,
  syncSessionTimer,
} from '@/lib/placement/session';

export default function PlacementAssessmentStartPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentElevateXProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [starting, setStarting] = useState(false);
  const [priorAttempt, setPriorAttempt] = useState<{
    attemptId: string;
    score?: number;
    completedAt?: string | null;
  } | null>(null);
  const [showProctorGate, setShowProctorGate] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState('cse');
  const [technicalFormat, setTechnicalFormat] = useState<PlacementTechnicalFormat>('coding');

  const totalMinutes = Math.round(PLACEMENT_TOTAL_SEC / 60);
  const selectedDept =
    PLACEMENT_DEPARTMENTS.find((d) => d.id === departmentId) ?? PLACEMENT_DEPARTMENTS[4]!;

  const loadStudent = useCallback(async () => {
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
      setDepartmentId(studentProfile.departmentId);
      setTechnicalFormat(defaultTechnicalFormatForDepartment(studentProfile.departmentId));

      const localCompletedId = getPlacementCompletedAttemptId(studentProfile.hallTicket);
      const status = await fetchElevateXAttemptStatus(studentProfile.hallTicket);
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
        setResumeAvailable(false);
        clearPlacementDrafts(studentProfile.hallTicket);
      } else {
        const existing = loadActivePlacementSession(studentProfile.hallTicket);
        setResumeAvailable(Boolean(existing && !existing.submitted));
      }
    } catch (err) {
      console.error('[placement/assessment] loadStudent', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadStudent();
  }, [loadStudent]);

  const handleStart = () => {
    if (!profile || starting || priorAttempt) return;

    const existing = loadActivePlacementSession(profile.hallTicket);
    if (existing && !existing.submitted) {
      const resume = window.confirm(
        'A saved ElevateX session was found on this device.\n\nPress OK to resume where you left off.\nPress Cancel to choose another option.',
      );
      if (resume) {
        saveCandidateDraft(existing.candidate);
        saveSession(existing);
        router.push('/placement/take');
        return;
      }
      const startFresh = window.confirm(
        'Start a new attempt? Your saved progress on this device will be deleted.',
      );
      if (!startFresh) return;
      clearPlacementDrafts(profile.hallTicket);
    }

    setShowProctorGate(true);
  };

  const beginExamAfterProctor = () => {
    if (!profile) return;
    setStarting(true);
    const proctorId = createProctorSessionId(getElevateXTestId(), authUserId ?? undefined);
    savePlacementProctorSessionId(proctorId);

    const existing = loadActivePlacementSession(profile.hallTicket);
    if (existing && !existing.submitted) {
      saveCandidateDraft(existing.candidate);
      saveSession(syncSessionTimer(existing));
      router.push('/placement/take');
      return;
    }

    const candidate = buildElevateXCandidateFromStudent(profile, {
      departmentId,
      technicalFormat,
    });
    const session = buildPlacementSession(candidate);
    saveCandidateDraft(candidate);
    saveSession(session);
    router.push('/placement/take');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading your ElevateX session…</p>
      </div>
    );
  }

  if (!profile) {
    return null;
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
                {PLACEMENT_EXAM_TAGLINE} · {PLACEMENT_SECTIONS.length} sections · {PLACEMENT_TOTAL_MARKS}{' '}
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-6 text-sm">
            <p className="font-semibold text-slate-900">{profile.fullName}</p>
            <p className="text-slate-600 mt-1">
              Roll: <span className="font-mono font-medium text-slate-800">{profile.hallTicket}</span>
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Branch / department
              </label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-slate-300 px-3 text-sm"
                value={departmentId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDepartmentId(id);
                  setTechnicalFormat(defaultTechnicalFormatForDepartment(id));
                }}
                disabled={Boolean(priorAttempt) || starting}
              >
                {PLACEMENT_DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Technical section format
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'mcq' as const, label: 'MCQs only (20)' },
                    { id: 'coding' as const, label: 'Coding only (3)' },
                    { id: 'both' as const, label: 'Both (20 MCQ + 3 coding)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={Boolean(priorAttempt) || starting}
                    onClick={() => setTechnicalFormat(opt.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                      technicalFormat === opt.id
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                {describeTechnicalSection(technicalFormat, selectedDept.name)}
              </p>
            </div>
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
            <li>Do not refresh or leave the tab during the exam.</li>
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
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={starting}
                onClick={handleStart}
                className="bg-[#1e3a5f] hover:bg-[#16304f]"
              >
                {starting ? 'Starting…' : 'Start ElevateX exam'}
              </Button>
              {resumeAvailable ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const existing = loadActivePlacementSession(profile.hallTicket);
                    if (existing && !existing.submitted) {
                      saveCandidateDraft(existing.candidate);
                      saveSession(existing);
                      router.push('/placement/take');
                    }
                  }}
                >
                  Resume saved session
                </Button>
              ) : null}
              <Button variant="ghost" asChild>
                <Link href="/exams">Back to examinations</Link>
              </Button>
            </div>
          )}
        </Card>

        <Card className="md:col-span-2 p-6 sm:p-8 shadow-sm border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Section breakdown</h2>
          <ul className="space-y-3 text-sm">
            {PLACEMENT_SECTIONS.map((s) => (
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
            All MCQ sections use unique questions per student (no repeated stems in your paper). Technical
            format: {technicalSectionSummary(technicalFormat)} for {selectedDept.name}.
          </p>
        </Card>
      </div>
    </div>
  );
}
