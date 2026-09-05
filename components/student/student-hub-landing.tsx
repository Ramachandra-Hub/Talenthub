'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getClientUser } from '@/lib/client-auth';
import { COLLEGE } from '@/lib/college-brand';

type HubPayload = {
  student: { name: string; rollNumber: string; branch: string | null; year: string | null };
  paths: {
    exams: { title: string; subtitle: string; href: string; available: boolean };
    dsa: {
      title: string;
      subtitle: string;
      href: string;
      available: boolean;
      unavailableReason: string | null;
    };
  };
  error?: string;
};

export function StudentHubLanding() {
  const router = useRouter();
  const [data, setData] = useState<HubPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);

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
        const res = await fetch('/api/student/hub', { credentials: 'include', cache: 'no-store' });
        const json = (await res.json()) as HubPayload;
        if (!res.ok) {
          setError(json.error ?? 'Could not open your portal');
          return;
        }
        setData(json);
        requestAnimationFrame(() => setEntered(true));
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
      <div className="hub-shell flex min-h-[100dvh] items-center justify-center">
        <p className="hub-display text-sm tracking-[0.35em] uppercase text-[#c9b896]/90">
          Opening portal
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hub-shell flex min-h-[100dvh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="hub-display text-2xl text-[#f3efe6]">Unable to continue</p>
          <p className="mt-3 text-sm text-[#c9b896]/90">{error}</p>
          <button
            type="button"
            className="mt-8 border border-[#c9b896]/40 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#f3efe6] hover:bg-white/5"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { student, paths } = data;
  const firstName = student.name.split(/\s+/)[0] || 'Student';

  return (
    <div className="hub-shell relative min-h-[100dvh] overflow-hidden text-[#f3efe6]">
      <div className="pointer-events-none absolute inset-0 hub-grain" aria-hidden />
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#1a4a6e]/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#8b6914]/10 blur-3xl" aria-hidden />

      <div
        className={`relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10 transition-all duration-700 ${
          entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-[#c9b896]">
              {COLLEGE.rce} · {COLLEGE.departmentTitle}
            </p>
            <h1 className="hub-display mt-3 text-4xl leading-[0.95] sm:text-5xl lg:text-[3.4rem] text-[#f7f3ea]">
              {COLLEGE.shortName}
            </h1>
          </div>
          <div className="text-right text-xs text-[#c9b896]/85">
            <p className="font-medium text-[#f3efe6]/95">{student.name}</p>
            <p className="mt-1 tabular-nums tracking-wide">{student.rollNumber || '—'}</p>
            {(student.branch || student.year) && (
              <p className="mt-1 max-w-[14rem] text-[11px] leading-snug opacity-80">
                {[student.branch, student.year].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10 lg:py-14">
          <p className="hub-display text-[11px] uppercase tracking-[0.38em] text-[#c9b896]/70">
            Welcome back
          </p>
          <h2 className="hub-display mt-3 max-w-xl text-3xl leading-tight text-[#f7f3ea] sm:text-4xl">
            {firstName}, choose where you continue today.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#d4cbb8]/80">
            One quiet foyer. Two clear doors. Examinations when your slot is live — DSA practice only
            when Training &amp; Placement has assigned your roll.
          </p>

          <div className="mt-12 grid gap-5 lg:grid-cols-12 lg:gap-7">
            {/* Exams — primary, taller, left-dominant */}
            <Link
              href={paths.exams.href}
              className="group relative lg:col-span-7 overflow-hidden border border-[#c9b896]/25 bg-[#0d1f33]/55 p-7 sm:p-9 transition-colors hover:border-[#c9b896]/55 hover:bg-[#122842]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9b896]"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-[#c9b896] opacity-70 transition-all group-hover:opacity-100" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#c9b896]">
                Pathway 01
              </p>
              <h3 className="hub-display mt-4 text-3xl text-[#f7f3ea] sm:text-4xl">{paths.exams.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#d4cbb8]/75">
                {paths.exams.subtitle}
              </p>
              <span className="mt-10 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#c9b896] transition-transform group-hover:translate-x-1">
                Enter hall
                <span aria-hidden>→</span>
              </span>
            </Link>

            {/* DSA — secondary; visible always; gated when unassigned */}
            {paths.dsa.available ? (
              <Link
                href={paths.dsa.href}
                className="group relative lg:col-span-5 overflow-hidden border border-white/12 bg-[#08141f]/40 p-7 sm:p-8 transition-colors hover:border-[#c9b896]/40 hover:bg-[#0c1c2c]/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9b896]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#c9b896]/80">
                  Pathway 02
                </p>
                <h3 className="hub-display mt-4 text-2xl text-[#f7f3ea] sm:text-3xl">{paths.dsa.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#d4cbb8]/70">{paths.dsa.subtitle}</p>
                <span className="mt-10 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#c9b896] transition-transform group-hover:translate-x-1">
                  Open track
                  <span aria-hidden>→</span>
                </span>
              </Link>
            ) : (
              <div
                className="relative lg:col-span-5 overflow-hidden border border-white/10 bg-[#08141f]/35 p-7 sm:p-8 opacity-[0.72]"
                aria-disabled="true"
              >
                <div className="pointer-events-none absolute inset-0 hub-unavailable-veil" aria-hidden />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#c9b896]/55">
                      Pathway 02
                    </p>
                    <span className="shrink-0 border border-[#c9b896]/35 bg-[#1a1208]/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#e8d9b0]">
                      Unavailable
                    </span>
                  </div>
                  <h3 className="hub-display mt-4 text-2xl text-[#f7f3ea]/85 sm:text-3xl">
                    {paths.dsa.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#d4cbb8]/55">{paths.dsa.subtitle}</p>
                  <p className="mt-8 text-[11px] leading-relaxed text-[#c9b896]/65">
                    {paths.dsa.unavailableReason}
                  </p>
                  <span className="mt-6 inline-flex cursor-not-allowed items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/25">
                    Locked for this roll
                  </span>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.28em] text-[#c9b896]/45">
          Internal assessment · Not for public distribution
        </footer>
      </div>
    </div>
  );
}
