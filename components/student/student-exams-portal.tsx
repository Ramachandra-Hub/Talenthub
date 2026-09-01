'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ElevateXLiveInfo } from '@/components/elevatex/elevatex-live-info';
import { isElevateXModule } from '@/lib/elevatex';
import type { PortalExamItem, StudentPortalPayload } from '@/lib/student-portal';
import type { StudentSlotExamPortalNotice } from '@/lib/exam-schedule-slots';
import { buildStudentExamPresentation } from '@/lib/student-exam-presentation';
import { getClientUser } from '@/lib/client-auth';
import { COLLEGE } from '@/lib/college-brand';
import { formatCollegeDateTime } from '@/lib/college-timezone';

type PortalResponse = StudentPortalPayload & { studentName?: string | null };

export function StudentExamsPortal() {
  const router = useRouter();
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPortal = async () => {
    try {
      const res = await fetch('/api/student/portal', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        setData((await res.json()) as PortalResponse);
      }
    } catch {
      /* server unreachable — keep last good data if any */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
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
      } catch {
        setLoading(false);
      }
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
      <header className="app-page-header text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(34,211,238,0.18),transparent)] pointer-events-none" />
        <div className="relative mx-auto max-w-4xl px-4 py-9 sm:py-12">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/95">
            {COLLEGE.rce} · {COLLEGE.departmentTitle}
          </span>
          <h1 className="mt-3 text-3xl sm:text-[2.5rem] font-bold tracking-tight text-white font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            Your examinations
          </h1>
          <p className="app-subtitle mt-4 text-white/90 max-w-2xl text-[15px] leading-relaxed border-l-2 border-cyan-300/50 pl-4">
            Review your assigned paper, slot window, and instructions below. When your schedule opens,
            use <span className="font-semibold text-white">Start examination</span> to begin in one
            continuous session.
          </p>

          {!loading && (data?.studentName || data?.department || data?.year) ? (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {data.studentName ? (
                <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                  {data.studentName}
                </span>
              ) : null}
              {data.department ? (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-sm text-white/90">
                  {data.department}
                </span>
              ) : null}
              {data.year ? (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-sm text-white/90">
                  {data.year}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-12">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-7">
            {data?.message ? (
              <Card className="p-5 sm:p-6 border-amber-200/80 bg-gradient-to-br from-amber-50/95 via-white to-white lux-surface rounded-2xl">
                <p className="text-sm font-semibold text-amber-950">Profile incomplete</p>
                <p className="text-sm text-amber-900/90 mt-2 leading-relaxed">{data.message}</p>
                <p className="text-xs text-amber-900/75 mt-3 leading-relaxed">
                  Contact your department faculty or the examination cell if your branch or year does
                  not match college records.
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

            <FeaturedExamCard exam={featured} department={data?.department} />

            {liveExams.length > 1 ? (
              <Card className="p-5 sm:p-6 lux-surface rounded-2xl border-slate-200/80">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">
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
              <Card className="p-5 sm:p-6 lux-surface rounded-2xl border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 to-white">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">
                  Scheduled next
                </p>
                <ul className="space-y-2">
                  {upcomingExams.map((exam) => (
                    <li key={exam.id}>
                      <div className="rounded-xl border border-indigo-200/80 bg-white/80 px-4 py-3 text-sm shadow-sm">
                        <p className="font-semibold text-[#0c2340]">
                          {exam.icon} {exam.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          Opens {formatCollegeDateTime(exam.starts_at)}
                          {exam.slot_number ? ` · Slot ${exam.slot_number}` : ''}
                          {exam.description ? ` · ${exam.description}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="p-5 sm:p-6 lux-surface rounded-2xl border-cyan-200/80 bg-gradient-to-br from-cyan-50/70 to-white">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                DSA practice
              </p>
              <h2 className="mt-2 text-lg font-bold text-[#0c2340]">DSA Adventure — Road to Success</h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Candy-crush your way through Level 1: 5 MCQs + 3 coding bosses per day (Java or Python).
                Earn stars, unlock days, then beat the weekly boss for assignment attendance!
              </p>
              <Button className="mt-4 bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600" asChild>
                <Link href="/dsa">Start adventure →</Link>
              </Button>
            </Card>
            <Card className="p-5 sm:p-6 lux-surface rounded-2xl border-slate-200/80">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Portal status
              </p>
              <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                This page refreshes automatically every 15 seconds. You do not need to reload —
                your examination will appear here when the examination cell publishes your slot.
              </p>
            </Card>
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
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        <span className="truncate font-medium">
          {exam.icon} {exam.title}
        </span>
        <span className="text-xs shrink-0 text-slate-500">
          Opens {formatCollegeDateTime(exam.starts_at)}
        </span>
      </div>
    );
  }
  return (
    <Link
      href={exam.href}
      className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-[#0c2340] hover:bg-emerald-100/60 transition-colors"
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
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-1">
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

function FeaturedExamCard({
  exam,
  department,
}: {
  exam: PortalExamItem | null;
  department?: string | null;
}) {
  if (!exam) {
    return (
      <Card className="p-10 sm:p-14 text-center lux-surface rounded-2xl border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80">
        <div className="mx-auto max-w-md">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl mb-5">
            📋
          </span>
          <p className="text-xl sm:text-2xl font-semibold text-slate-800 font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            No examination assigned yet
          </p>
          <p className="text-sm text-slate-600 mt-4 leading-relaxed">
            When the examination cell publishes your slot and opens the paper, full details —
            including paper structure, schedule, and instructions — will appear here automatically.
          </p>
          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            Stay signed in. This portal checks for updates every 15 seconds.
          </p>
        </div>
      </Card>
    );
  }

  const isLive = exam.kind === 'live';
  const canStart = isLive && exam.window_open !== false;
  const presentation = buildStudentExamPresentation(exam, department);

  return (
    <Card
      className={`lux-surface rounded-2xl overflow-hidden border shadow-xl ${
        isLive
          ? 'border-emerald-400/80 shadow-emerald-900/10 ring-1 ring-emerald-500/20'
          : 'border-indigo-300/80 shadow-indigo-900/5 ring-1 ring-indigo-400/15'
      }`}
    >
      <div
        className={`px-6 sm:px-10 py-6 sm:py-7 border-b ${
          isLive
            ? 'bg-gradient-to-r from-emerald-700 to-teal-700 border-emerald-600/30'
            : 'bg-gradient-to-r from-indigo-700 to-slate-800 border-indigo-600/30'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                {isLive ? (canStart ? 'Live now' : 'Published — awaiting slot') : 'Upcoming'}
              </span>
              {presentation.isElevateX ? (
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                  ElevateX
                </span>
              ) : null}
            </div>
            <h2 className="text-2xl sm:text-[1.85rem] font-bold text-white leading-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
              {exam.title}
            </h2>
            {exam.slot_number ? (
              <p className="text-sm font-medium text-white/90 mt-2.5">
                Assigned slot · Slot {exam.slot_number}
                {exam.slot_window_label ? ` · ${exam.slot_window_label}` : ''}
              </p>
            ) : null}
          </div>
          <span className="text-4xl opacity-90" aria-hidden>
            {exam.icon}
          </span>
        </div>
      </div>

      <div className="p-6 sm:p-10 space-y-8 bg-gradient-to-b from-white via-white to-slate-50/40">
        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#1e3a5f] mb-3">
            Overview
          </h3>
          <p className="text-[15px] text-slate-700 leading-relaxed">{presentation.overview}</p>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#1e3a5f] mb-4">
            Paper structure
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {presentation.paperSections.map((section) => (
              <div
                key={`${section.title}-${section.detail}`}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-900/[0.03]"
              >
                <div className="flex gap-3">
                  <span className="text-xl shrink-0" aria-hidden>
                    {section.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#0c2340]">{section.title}</p>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{section.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {exam.badge ? (
            <p className="text-xs text-slate-500 mt-3 font-medium">Total window: {exam.badge}</p>
          ) : null}
        </section>

        {presentation.isElevateX || isElevateXModule(exam.module_key) ? (
          <ElevateXLiveInfo showExamInstructions className="rounded-2xl" />
        ) : null}

        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#1e3a5f] mb-4">
            Schedule
          </h3>
          <ul className="rounded-xl border border-slate-200/90 divide-y divide-slate-100 overflow-hidden bg-white">
            {presentation.scheduleLines.map((line) => (
              <li key={line} className="px-4 py-3 text-sm text-slate-700 flex gap-2">
                <span className="text-slate-400 shrink-0">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {exam.notice ? (
          <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900/80 mb-2">
              Faculty instructions
            </h3>
            <p className="text-sm text-amber-950/90 leading-relaxed">{exam.notice}</p>
          </section>
        ) : null}

        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#1e3a5f] mb-4">
            Before you begin
          </h3>
          <ul className="space-y-2.5">
            {presentation.guidelines.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1e3a5f]/60" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="pt-2 border-t border-slate-200/80">
          {canStart ? (
            <Link href={exam.href}>
              <Button
                size="lg"
                className="w-full sm:w-auto min-w-[220px] h-12 text-base bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white shadow-lg shadow-emerald-900/20 font-semibold px-10 rounded-xl"
              >
                Start examination →
              </Button>
            </Link>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-5 py-4">
              <p className="text-sm font-semibold text-[#0c2340]">
                {isLive ? 'Waiting for your slot window' : 'Not yet open'}
              </p>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                {isLive
                  ? `Your examination opens at ${formatCollegeDateTime(exam.starts_at)}. This page updates automatically — return here when the window begins.`
                  : `Scheduled to open ${formatCollegeDateTime(exam.starts_at)}. Review the paper structure above so you are prepared.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
