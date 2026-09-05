'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getClientUser } from '@/lib/client-auth';
import { adaptDsaDashboardToArena, type ApiDashboard } from '@/components/dsa/arena/arena-data';
import type { ArenaDashboardModel, ArenaMissionType, ArenaZone } from '@/components/dsa/arena/arena-types';
import { ArenaSidebar } from '@/components/dsa/arena/arena-sidebar';
import { ArenaHeader } from '@/components/dsa/arena/arena-header';
import { AdventureMap } from '@/components/dsa/arena/adventure-map';
import { ArenaRightPanel } from '@/components/dsa/arena/arena-right-panel';
import { MissionSection } from '@/components/dsa/arena/mission-section';

type Toast = { message: string; tone: 'info' | 'lock' } | null;

export function DsaArena() {
  const router = useRouter();
  const [model, setModel] = useState<ArenaDashboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'all' | ArenaMissionType>('all');
  const [toast, setToast] = useState<Toast>(null);
  const [focusZoneId, setFocusZoneId] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login/student');
        return;
      }

      try {
        const [dashRes, hubRes] = await Promise.all([
          fetch('/api/student/dsa/dashboard', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/student/hub', { credentials: 'include', cache: 'no-store' }),
        ]);

        const dashJson = (await dashRes.json()) as ApiDashboard & { error?: string };
        if (!dashRes.ok) {
          setError(
            dashJson.error ??
              (dashRes.status === 403
                ? 'DSA is not assigned to your roll number.'
                : 'Could not load DSA Arena'),
          );
          return;
        }

        let student: { name?: string; rollNumber?: string } | null = null;
        if (hubRes.ok) {
          const hubJson = (await hubRes.json()) as {
            student?: { name?: string; rollNumber?: string };
          };
          student = hubJson.student ?? null;
        }

        const adapted = adaptDsaDashboardToArena({
          dashboard: dashJson,
          student,
        });
        setModel(adapted);
        setFocusZoneId(adapted.currentZoneId);
      } catch {
        setError('Arena servers are offline. Try again in a moment.');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string, tone: 'info' | 'lock' = 'info') => {
    setToast({ message, tone });
  }, []);

  const onSelectZone = useCallback(
    (zone: ArenaZone) => {
      setFocusZoneId(zone.id);

      if (zone.status === 'locked' || (zone.status === 'boss' && zone.lockReason)) {
        showToast(zone.lockReason ?? `Complete the previous zone to unlock ${zone.title}.`, 'lock');
        return;
      }

      if (zone.id === 'basics') {
        showToast('Basics cleared. Your journey continues in the current zone.', 'info');
        return;
      }

      if (zone.entryHref) {
        showToast(`Entering ${zone.title}…`, 'info');
        window.setTimeout(() => router.push(zone.entryHref!), 350);
        return;
      }

      if (zone.weekId) {
        showToast(`${zone.title} zone selected. Scroll to missions below.`, 'info');
        document.getElementById('arena-missions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      showToast(zone.lockReason ?? `${zone.title} unlocks in a future season.`, 'lock');
    },
    [router, showToast],
  );

  if (loading) {
    return (
      <div className="arena-shell flex min-h-[100dvh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-pulse rounded-full border-2 border-cyan-400/40 border-t-cyan-300" />
          <p className="mt-4 text-sm text-slate-400">Loading your adventure map…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="arena-shell flex min-h-[100dvh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0a1424]/90 p-6 text-center backdrop-blur-md">
          <p className="text-lg font-semibold text-white">Arena locked</p>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button
            type="button"
            className="mt-5 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-5 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
          <Link href="/home" className="mt-3 block text-sm text-slate-400 hover:text-cyan-300">
            Back to foyer
          </Link>
        </div>
      </div>
    );
  }

  if (!model) return null;

  const displayZoneId = focusZoneId ?? model.currentZoneId;
  const displayTopic =
    model.zones.find((z) => z.id === displayZoneId)?.title ?? model.currentTopicName;

  return (
    <div className="arena-shell min-h-[100dvh] text-slate-100">
      <ArenaSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-[190px]">
        <ArenaHeader
          studentName={model.studentName}
          level={model.level}
          onMenu={() => setSidebarOpen(true)}
        />

        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <main className="min-w-0 space-y-6">
            <AdventureMap
              zones={model.zones}
              currentZoneId={model.currentZoneId}
              currentTopicName={displayTopic}
              onSelectZone={onSelectZone}
            />

            <div id="arena-missions">
              <MissionSection
                missions={model.missions}
                tab={tab}
                onTabChange={setTab}
                weekTitle={model.currentWeekTitle}
                topicName={model.currentTopicName}
                daysCompleted={model.daysCompleted}
                daysTotal={model.daysTotal}
              />
            </div>
          </main>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <ArenaRightPanel model={model} />
          </div>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[60] max-w-sm -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm shadow-2xl backdrop-blur-md transition-opacity duration-200 ${
            toast.tone === 'lock'
              ? 'border-amber-500/40 bg-[#1a1208]/95 text-amber-100'
              : 'border-cyan-500/40 bg-[#0a1628]/95 text-cyan-50'
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
