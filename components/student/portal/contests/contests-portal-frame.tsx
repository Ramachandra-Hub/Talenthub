'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PortalShell } from '@/components/student/portal/portal-shell';
import { PortalHudCard, PortalQuickLinks } from '@/components/student/portal/portal-hud';
import { derivePortalGamification } from '@/components/student/portal/portal-gamification';
import { getClientUser } from '@/lib/client-auth';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

/** Shared portal chrome for contest brief / result (same as Contests / Exam Center). */
export function ContestsPortalFrame({
  title = 'CONTESTS',
  subtitle = 'Coding contest',
  children,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState('Student');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const hubRes = await fetch('/api/student/hub', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (hubRes.ok) {
          const hub = (await hubRes.json()) as { student?: { name?: string } };
          if (hub.student?.name) setName(hub.student.name);
        }
      } finally {
        setReady(true);
      }
    };
    void boot();
  }, [router]);

  const g = derivePortalGamification({ rollNumber: name, completedDays: 2 });

  if (!ready) {
    return (
      <div className="ex-portal flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading Contests…
      </div>
    );
  }

  return (
    <PortalShell
      title={title}
      subtitle={subtitle}
      studentName={name}
      gamification={g}
      rightPanel={
        <div className="space-y-3.5">
          <PortalHudCard gamification={g} studentName={name} />
          <PortalQuickLinks />
        </div>
      }
    >
      {children}
    </PortalShell>
  );
}
