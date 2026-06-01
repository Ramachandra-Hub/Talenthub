'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ElevateXLiveInfo } from '@/components/elevatex/elevatex-live-info';
import { isElevateXModule } from '@/lib/elevatex';
import type { PortalExamItem, StudentPortalPayload } from '@/lib/student-portal';
import type { StudentSlotExamPortalNotice } from '@/lib/exam-schedule-slots';
import { getClientUser } from '@/lib/client-auth';
import { COLLEGE } from '@/lib/college-brand';
import { formatCollegeDateTime } from '@/lib/college-timezone';

type PortalResponse = StudentPortalPayload & { studentName?: string | null };

export function StudentExamsPortal() {
  const router = useRouter();
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPortal = async () => {
    const res = await fetch('/api/student/portal', { credentials: 'include', cache: 'no-store' });
    if (res.ok) {
      setData((await res.json()) as PortalResponse);
    }
    setLoading(false);
  };

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      const meRes = await fetch('/api/admin/me', { credentials: 'include' });
      if (meRes.ok) {
        const me = (await meRes.json()) as { isAdmin?: boolean };
        if (me.isAdmin) {
          router.replace('/admin/dashboard');
          return;
        }
      }
      await fetch('/api/student/sync-profile', { method: 'POST', credentials: 'include' }).catch(
        () => null,
      );
      await loadPortal();
    };
    void boot();
    const id = window.setInterval(() => void loadPortal(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const liveExams = data?.live ?? [];
  const upcomingExams = data?.upcoming ?? [];
  const slotNotices = data?.slot_notices ?? [];
  const featured = data?.featured ?? liveExams[0] ?? upcomingExams[0] ?? null;

  return (
    <div className="app-page">
      <header className="app-page-header text-white">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:py-11">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/95">
            {COLLEGE.rce} · Live examinations
          </span>
          <h1 className="mt-3 text-3xl sm:text-[2.35rem] font-bold tracking-tight text-white font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            Examinations
          </h1>
          <p className="app-subtitle mt-3 text-white/88 max-w-2xl border-l-2 border-cyan-300/40 pl-4">
            Exams assigned to your roll number and slot appear here when your department opens them.
            Use Start examination when your slot window is open.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <div className="space-y-6">
            {data?.message ? (
              <Card className="p-5 border-amber-200/80 bg-amber-50/90 lux-surface">
                <p className="text-sm text-amber-950">{data.message}</p>
                <p className="text-xs text-amber-900/80 mt-2">
                  Contact your department faculty if your department or year is incorrect.
                </p>
              </Card>
            ) : null}

            {slotNotices.length > 0 ? (
              <div className="space-y-3">
                {slotNotices.map((notice) => (
                  <SlotExamNoticeCard key={notice.faculty_exam_request_id} notice={notice} />
                ))}
              </div>
            ) : null}

            <FeaturedExamCard exam={featured} />

            {liveExams.length > 1 ? (
              <Card className="p-4 lux-surface rounded-xl border-slate-200/80">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Other live sessions
                </p>
                <ul className="space-y-2">
                  {liveExams.slice(1).map((exam) => (
                    <li key={exam.id}>
                      <ExamListLink exam={exam} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {upcomingExams.length > 0 && featured?.kind !== 'upcoming' ? (
              <Card className="p-4 lux-surface rounded-xl border-indigo-200/80">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Upcoming
                </p>
                <ul className="space-y-2">
                  {upcomingExams.map((exam) => (
                    <li key={exam.id}>
                      <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/40 px-3 py-2 text-sm">
                        <p className="font-semibold text-[#0c2340]">
                          {exam.icon} {exam.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          Opens {formatCollegeDateTime(exam.starts_at)}
                          {exam.slot_number ? ` · Slot ${exam.slot_number}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ExamListLink({ exam }: { exam: PortalExamItem }) {
  const canStart = exam.window_open !== false;
  if (!canStart) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span className="truncate">
          {exam.icon} {exam.title}
        </span>
        <span className="text-xs shrink-0">Opens {formatCollegeDateTime(exam.starts_at)}</span>
      </div>
    );
  }
  return (
    <Link
      href={exam.href}
      className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-sm font-semibold text-[#0c2340] hover:bg-emerald-100/60 transition-colors"
    >
      <span className="truncate">
        {exam.icon} {exam.title}
      </span>
      <span className="text-emerald-700 text-xs shrink-0">Start →</span>
    </Link>
  );
}

function SlotExamNoticeCard({ notice }: { notice: StudentSlotExamPortalNotice }) {
  const isWarning = notice.tone === 'warning';
  return (
    <Card
      className={`p-5 sm:p-6 lux-surface rounded-2xl border ${
        isWarning
          ? 'border-amber-300/90 bg-gradient-to-br from-amber-50/95 via-white to-white ring-1 ring-amber-200/60'
          : 'border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 via-white to-white ring-1 ring-indigo-200/50'
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
        {notice.exam_title}
      </p>
      <p
        className={`text-base sm:text-lg font-semibold leading-snug ${
          isWarning ? 'text-amber-950' : 'text-[#0c2340]'
        }`}
      >
        {notice.headline}
      </p>
      <p className="text-sm text-slate-700 mt-2 leading-relaxed">{notice.detail}</p>
    </Card>
  );
}

function FeaturedExamCard({ exam }: { exam: PortalExamItem | null }) {
  if (!exam) {
    return (
      <Card className="p-10 sm:p-12 text-center lux-surface rounded-2xl border-slate-200/80">
        <p className="text-xl font-semibold text-slate-800 font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
          No examination assigned right now
        </p>
        <p className="text-sm text-slate-600 mt-3 max-w-md mx-auto leading-relaxed">
          When your slot is opened by the examination cell, your exam will appear here. This page
          refreshes automatically every 15 seconds.
        </p>
      </Card>
    );
  }

  const isLive = exam.kind === 'live';
  const canStart = isLive && exam.window_open !== false;

  return (
    <Card
      className={`lux-surface rounded-2xl p-6 sm:p-10 border ring-2 shadow-xl ${
        isLive
          ? 'border-emerald-400/90 ring-emerald-500/25 shadow-emerald-900/10 bg-gradient-to-br from-emerald-50/90 via-white to-white'
          : 'border-indigo-300/90 ring-indigo-400/20 shadow-indigo-900/5 bg-gradient-to-br from-indigo-50/80 via-white to-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl" aria-hidden>
              {exam.icon}
            </span>
            <Badge tone={isLive ? 'success' : 'neutral'}>
              {isLive ? (canStart ? 'LIVE' : 'OPEN — WAITING FOR SLOT') : 'UPCOMING'}
            </Badge>
          </div>
          <h2 className="text-2xl sm:text-[1.75rem] font-bold text-[#0c2340] leading-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            {exam.title}
          </h2>
          {exam.slot_number ? (
            <p className="text-sm font-semibold text-emerald-800 mt-2">
              Your slot: Slot {exam.slot_number}
              {exam.slot_window_label ? ` · ${exam.slot_window_label}` : ''}
              {canStart ? ' · Live now' : isLive ? ' · Opens at scheduled time' : ''}
            </p>
          ) : null}
          {exam.badge ? <p className="text-sm text-slate-500 mt-1">{exam.badge}</p> : null}
        </div>
      </div>

      <p className="text-base text-slate-700 leading-relaxed mb-5">{exam.description}</p>

      {isElevateXModule(exam.module_key) ? <ElevateXLiveInfo compact className="mb-4" /> : null}

      {exam.notice ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/90 backdrop-blur-sm p-4 mb-6 shadow-inner shadow-slate-900/5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Instructions</p>
          <p className="text-sm text-slate-800">{exam.notice}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-slate-600 mb-6">
        <span>Starts {formatCollegeDateTime(exam.starts_at)}</span>
        {exam.ends_at ? <span>· Ends {formatCollegeDateTime(exam.ends_at)}</span> : null}
        {exam.duration_minutes ? <span>· {exam.duration_minutes} minutes</span> : null}
      </div>

      {canStart ? (
        <Link href={exam.href}>
          <Button
            size="lg"
            className="w-full sm:w-auto bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white shadow-lg shadow-emerald-900/20 font-semibold px-8"
          >
            Start examination →
          </Button>
        </Link>
      ) : (
        <p className="text-sm font-medium text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          {isLive
            ? `Your examination opens at ${formatCollegeDateTime(exam.starts_at)}. This page will update automatically.`
            : `Scheduled to open ${formatCollegeDateTime(exam.starts_at)}.`}
        </p>
      )}
    </Card>
  );
}
