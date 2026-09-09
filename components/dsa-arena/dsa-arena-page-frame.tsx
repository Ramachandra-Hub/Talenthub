'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PortalShell } from '@/components/student/portal/portal-shell';
import { derivePortalGamification } from '@/components/student/portal/portal-gamification';
import { getClientUser } from '@/lib/client-auth';
import type { ArenaProgressionSnapshot } from '@/lib/dsa/arena-progression';

type Props = {
  title: string;
  subtitle?: string;
  children: (ctx: {
    studentName: string;
    progression: ArenaProgressionSnapshot | null;
  }) => ReactNode;
};

export function DsaArenaPageFrame({ title, subtitle, children }: Props) {
  const router = useRouter();
  const [studentName, setStudentName] = useState('Cadet');
  const [roll, setRoll] = useState('');
  const [progression, setProgression] = useState<ArenaProgressionSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }
      try {
        const [hubRes, progRes] = await Promise.all([
          fetch('/api/student/hub', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/student/dsa/journey/progression', {
            credentials: 'include',
            cache: 'no-store',
          }),
        ]);
        if (hubRes.ok) {
          const hub = (await hubRes.json()) as {
            student?: { name?: string; rollNumber?: string };
          };
          if (hub.student?.name) setStudentName(hub.student.name);
          if (hub.student?.rollNumber) setRoll(hub.student.rollNumber);
        }
        if (progRes.ok) {
          setProgression((await progRes.json()) as ArenaProgressionSnapshot);
        }
      } catch {
        /* progression optional if offline — missions stay unmapped/safe */
      } finally {
        setReady(true);
      }
    };
    void boot();
  }, [router]);

  if (!ready) {
    return (
      <div className="ex-portal dsa-journey flex min-h-[100dvh] items-center justify-center text-sm text-slate-400">
        Loading DSA Arena…
      </div>
    );
  }

  const gamification = derivePortalGamification({ rollNumber: roll });

  return (
    <div className="dsa-journey">
      <PortalShell
        title={title}
        subtitle={subtitle}
        studentName={studentName}
        gamification={gamification}
        showSearch={false}
      >
        {children({ studentName, progression })}
      </PortalShell>
    </div>
  );
}
