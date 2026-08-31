'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getClientUser } from '@/lib/client-auth';
import { COLLEGE } from '@/lib/college-brand';

type DayRow = {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
  lockReason: string | null;
};

type WeekRow = {
  id: string;
  weekNumber: number;
  title: string;
  topicName: string;
  status: string;
  attemptNumber: number;
  daysCompleted: number;
  daysTotal: number;
  progressPercent: number;
  qualificationStatus: string;
  failedAttempts: number;
  currentDay: number | null;
  lockReason?: string;
  days: DayRow[];
};

type Dashboard = {
  program: { title: string; daysPerWeek: number };
  level: { title: string };
  currentWeek: WeekRow;
  weeks: WeekRow[];
};

function toneFor(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'completed' || status === 'qualified') return 'success';
  if (status === 'in_progress' || status === 'available') return 'warning';
  if (status === 'failed' || status === 'locked') return status === 'failed' ? 'danger' : 'neutral';
  return 'neutral';
}

export function DsaDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const res = await fetch('/api/student/dsa/dashboard', { credentials: 'include' });
        const json = (await res.json()) as Dashboard & { error?: string };
        if (!res.ok) {
          setError(json.error ?? 'Could not load DSA portal');
          return;
        }
        setData(json);
      } catch {
        setError('Network error. Try again.');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card className="p-6">
          <p className="font-semibold text-[#0c2340]">Could not open DSA practice</p>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card className="p-6">
          <p className="text-sm text-slate-600">No DSA program is available yet.</p>
        </Card>
      </div>
    );
  }

  const current = data.currentWeek;
  if (!current) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card className="p-6">
          <p className="text-sm text-slate-600">No DSA weeks are configured yet.</p>
        </Card>
      </div>
    );
  }
  const openDay = current.days.find((d) => d.status === 'in_progress' || d.status === 'available');

  return (
    <div className="app-page">
      <header className="app-page-header text-white relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-4 py-9">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/95">
            {COLLEGE.rce} · DSA Practice
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {data.level.title} · {data.program.title}
          </h1>
          <p className="mt-3 text-white/90 max-w-2xl text-sm leading-relaxed">
            Complete each day to unlock the next. Pass the weekly assessment for assignment attendance
            qualification. Practice after you pass does not change your official result.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
        <div className="flex flex-wrap gap-2 justify-between">
          <Link href="/exams" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
            ← Examinations
          </Link>
          <Link href="/dsa/history" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
            Progress history →
          </Link>
        </div>

        <Card className="p-6 lux-surface rounded-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Current focus</p>
          <h2 className="mt-2 text-xl font-bold text-[#0c2340]">{current.title}</h2>
          <p className="text-sm text-slate-600 mt-1">
            Topic: {current.topicName}
            {current.currentDay ? ` · Day ${current.currentDay}` : ''} · Attempt {current.attemptNumber}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={toneFor(current.status)}>{current.status.replace('_', ' ')}</Badge>
            <Badge tone={toneFor(current.qualificationStatus)}>
              Qualification: {current.qualificationStatus.replace('_', ' ')}
            </Badge>
            {current.failedAttempts > 0 ? (
              <Badge tone="danger">{current.failedAttempts} failed attempt(s) on record</Badge>
            ) : null}
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-[#1e3a5f]"
              style={{ width: `${current.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Weekly progress {current.progressPercent}% ({current.daysCompleted}/{current.daysTotal} days)
          </p>
          {openDay ? (
            <Button className="mt-4" asChild>
              <Link href={`/dsa/day/${openDay.id}`}>Continue Day {openDay.dayNumber}</Link>
            </Button>
          ) : current.status === 'in_progress' && current.daysCompleted >= current.daysTotal ? (
            <Button className="mt-4" asChild>
              <Link href={`/dsa/week/${current.id}/assessment`}>Take weekly assessment</Link>
            </Button>
          ) : null}
        </Card>

        {data.weeks.map((week) => (
          <Card key={week.id} className="p-6 rounded-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#0c2340]">{week.title}</h3>
                <p className="text-sm text-slate-600">{week.topicName}</p>
              </div>
              <Badge tone={toneFor(week.status)}>{week.status}</Badge>
            </div>
            {week.lockReason ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                🔒 {week.lockReason}
              </p>
            ) : null}
            <ol className="mt-4 grid gap-2 sm:grid-cols-5">
              {week.days.map((day) => (
                <li key={day.id}>
                  {day.status === 'locked' ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                      <p className="font-semibold text-slate-500">{day.title}</p>
                      <p className="text-xs text-slate-500 mt-1">🔒 Locked</p>
                    </div>
                  ) : (
                    <Link
                      href={`/dsa/day/${day.id}${week.status === 'completed' ? '?kind=official' : ''}`}
                      className="block rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm hover:border-[#1e3a5f]/40"
                    >
                      <p className="font-semibold text-[#0c2340]">{day.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{day.status.replace('_', ' ')}</p>
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            {week.status === 'completed' ? (
              <Button
                variant="outline"
                className="mt-4"
                onClick={async () => {
                  const res = await fetch(`/api/student/dsa/weeks/${week.id}/practice`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const json = (await res.json()) as { error?: string; dayId?: string };
                  if (!res.ok) {
                    alert(json.error ?? 'Practice is not available');
                    return;
                  }
                  if (json.dayId) router.push(`/dsa/day/${json.dayId}?kind=practice`);
                }}
              >
                Practice this week
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
