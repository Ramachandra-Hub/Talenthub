'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock } from 'lucide-react';
import { getClientUser } from '@/lib/client-auth';
import { PortalShell } from '@/components/student/portal/portal-shell';
import { PortalHudCard, PortalQuestCard, PortalQuickLinks } from '@/components/student/portal/portal-hud';
import {
  derivePortalGamification,
  greetingForNow,
} from '@/components/student/portal/portal-gamification';

type HubPayload = {
  student: { name: string; rollNumber: string; branch: string | null; year: string | null };
  paths: {
    exams: { available: boolean; href: string };
    dsa: { available: boolean; href: string; unavailableReason: string | null };
  };
};

type DsaDash = {
  currentWeek?: {
    title: string;
    topicName: string;
    progressPercent: number;
    daysCompleted: number;
    daysTotal: number;
    days: Array<{ status: string; id: string }>;
  };
  weeks?: Array<{
    status: string;
    daysCompleted: number;
    days: Array<{ status: string; stars?: number }>;
  }>;
};

type PortalExam = {
  id: string;
  title: string;
  status?: string;
  startsAt?: string | null;
};

export function StudentCommandCenter() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [dsa, setDsa] = useState<DsaDash | null>(null);
  const [exams, setExams] = useState<PortalExam[]>([]);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const meRes = await fetch('/api/admin/me', { credentials: 'include' });
        if (meRes.ok) {
          const me = (await meRes.json()) as { isAdmin?: boolean };
          if (me.isAdmin) {
            router.replace('/admin/dashboard');
            return;
          }
        }

        const [hubRes, dsaRes, portalRes] = await Promise.all([
          fetch('/api/student/hub', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/student/dsa/dashboard', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/student/portal', { credentials: 'include', cache: 'no-store' }),
        ]);

        const hubJson = (await hubRes.json()) as HubPayload & { error?: string };
        if (!hubRes.ok) {
          setError(hubJson.error ?? 'Could not open your portal');
          return;
        }
        setHub(hubJson);

        if (dsaRes.ok) {
          setDsa((await dsaRes.json()) as DsaDash);
        }

        if (portalRes.ok) {
          const portalJson = (await portalRes.json()) as {
            upcoming?: PortalExam[];
            live?: PortalExam[];
            exams?: PortalExam[];
          };
          const list = [
            ...(portalJson.live ?? []),
            ...(portalJson.upcoming ?? []),
            ...(portalJson.exams ?? []),
          ].slice(0, 3);
          setExams(list);
        }
      } catch {
        setError('Connection interrupted. Try again.');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [router]);

  if (loading) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center">
        <p className="text-sm tracking-[0.28em] uppercase text-cyan-300/80">Opening command center</p>
      </div>
    );
  }

  if (error || !hub) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center px-4">
        <div className="ex-panel max-w-md rounded-lg p-6 text-center">
          <p className="text-lg font-semibold text-white">Unable to continue</p>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button type="button" className="ex-btn-primary mt-4" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const weeks = dsa?.weeks ?? [];
  const completedDays = weeks.reduce(
    (s, w) => s + w.days.filter((d) => d.status === 'completed').length,
    0,
  );
  const completedWeeks = weeks.filter((w) => w.status === 'completed').length;
  const stars = weeks.reduce(
    (s, w) => s + w.days.reduce((a, d) => a + (d.stars ?? 0), 0),
    0,
  );
  const gamification = derivePortalGamification({
    rollNumber: hub.student.rollNumber,
    completedDays,
    completedWeeks,
    stars,
  });

  const week = dsa?.currentWeek;
  const openDay = week?.days.find((d) => d.status === 'available' || d.status === 'in_progress');
  const firstName = hub.student.name.split(/\s+/)[0] || 'Student';
  const greeting = greetingForNow();

  const achievements = [
    {
      id: 'first',
      title: 'First Step',
      description: 'Completed your first mission',
      unlocked: completedDays > 0,
      tone: 'emerald',
    },
    {
      id: 'streak',
      title: 'Streak Master',
      description: '7 day coding streak',
      unlocked: gamification.streak >= 7,
      tone: 'orange',
    },
    {
      id: 'zone',
      title: 'Zone Cleared',
      description: 'Finished a DSA week',
      unlocked: completedWeeks > 0,
      tone: 'cyan',
    },
  ];

  return (
    <PortalShell
      title="COMMAND CENTER"
      subtitle="Your next move starts here"
      studentName={hub.student.name}
      gamification={gamification}
      rightPanel={
        <div className="space-y-3.5">
          <PortalHudCard gamification={gamification} studentName={hub.student.name} />
          <PortalQuestCard
            title={
              week
                ? `Complete 2 ${week.topicName.toLowerCase()} missions`
                : 'Complete 2 coding missions'
            }
            progress={Math.min(2, week?.daysCompleted ?? 0)}
            total={2}
            xp={100}
            coins={20}
          />
          <div className="ex-panel rounded-lg p-3.5">
            <p className="font-[family-name:var(--font-hub-display),Georgia,serif] text-[13px] italic leading-relaxed text-slate-200">
              Discipline today.
              <br />
              Dream job tomorrow.
            </p>
          </div>
          <PortalQuickLinks />
        </div>
      }
    >
      <div className="space-y-5">
        <section className="ex-panel relative overflow-hidden rounded-xl p-5 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.12),transparent_55%)]" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/85">
              ELEVATE-X
            </p>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
              {greeting}, {firstName}
            </h2>
            <p className="mt-1.5 max-w-xl text-[14px] text-slate-400">
              Ready to level up today? Pick a path — adventure through DSA or prove yourself in exams.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="ex-panel relative overflow-hidden rounded-xl p-5">
            <div
              className="pointer-events-none absolute inset-0 opacity-40 bg-cover bg-center"
              style={{ backgroundImage: "url('/elevatex/arena-map-bg.svg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#07111d] via-[#07111d]/92 to-[#07111d]/55" />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
                Continue your journey
              </p>
              {hub.paths.dsa.available && week ? (
                <>
                  <h3 className="mt-2 text-xl font-bold text-white">{week.topicName}</h3>
                  <p className="mt-1 text-[13px] text-slate-400">{week.title}</p>
                  <div className="mt-3 flex items-center justify-between text-[12px] text-slate-300">
                    <span>{week.progressPercent}% complete</span>
                    <span>
                      {week.daysCompleted}/{week.daysTotal} days
                    </span>
                  </div>
                  <div className="ex-progress mt-2">
                    <span style={{ width: `${week.progressPercent}%` }} />
                  </div>
                  <Link
                    href={openDay ? `/dsa/day/${openDay.id}` : '/dsa'}
                    className="ex-btn-primary mt-4"
                  >
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="mt-2 text-xl font-bold text-white">DSA Arena</h3>
                  <p className="mt-1 text-[13px] text-slate-400">
                    {hub.paths.dsa.unavailableReason ??
                      'DSA Arena unlocks when the track is assigned to your roll.'}
                  </p>
                  {hub.paths.dsa.available ? (
                    <Link href="/dsa-arena" className="ex-btn-primary mt-4">
                      Enter Arena <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                      <Lock className="h-3.5 w-3.5" /> Locked for your roll
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="ex-panel rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Upcoming exams
            </p>
            {exams.length ? (
              <ul className="mt-3 space-y-2.5">
                {exams.map((exam) => (
                  <li
                    key={exam.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">{exam.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {exam.status === 'live' || exam.status === 'LIVE' ? 'Live now' : 'Scheduled'}
                      </p>
                    </div>
                    <Link href="/exams" className="ex-btn-ghost shrink-0 px-2.5 py-1.5 text-[11px]">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-slate-500">
                No upcoming exams right now. Check Exam Center for mock practice.
              </p>
            )}
            <Link href="/exams" className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-cyan-300">
              Open Exam Center <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>

        <section className="ex-panel rounded-xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Recent achievements
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">Hall highlights</h3>
            </div>
            <Link href="/achievements" className="text-[12px] font-semibold text-cyan-300">
              View all →
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {achievements.map((a) => (
              <div
                key={a.id}
                className={`rounded-md border px-3 py-3 ${
                  a.unlocked
                    ? a.tone === 'emerald'
                      ? 'border-emerald-400/25 bg-emerald-500/10'
                      : a.tone === 'orange'
                        ? 'border-orange-400/25 bg-orange-500/10'
                        : 'border-cyan-400/25 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.02] opacity-45'
                }`}
              >
                <p className="text-[13px] font-semibold text-white">{a.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">{a.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ex-panel rounded-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Recommended for you
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { href: '/dsa-arena', title: 'DSA Arena', desc: 'Continue your gamified coding journey' },
              { href: '/exams', title: 'Mock Assessment', desc: 'Sharpen exam timing & accuracy' },
              { href: '/learning', title: 'Learning Hub', desc: 'Structured modules beyond DSA' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-md border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30"
              >
                <p className="text-[13px] font-semibold text-white group-hover:text-cyan-100">
                  {item.title}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
