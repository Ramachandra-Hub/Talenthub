'use client';

import { useState, type ReactNode } from 'react';
import { PortalSidebar } from '@/components/student/portal/portal-sidebar';
import { PortalHeader } from '@/components/student/portal/portal-header';
import type { PortalGamification } from '@/components/student/portal/portal-nav';

type Props = {
  title: string;
  subtitle?: string;
  studentName: string;
  gamification: PortalGamification;
  children: ReactNode;
  rightPanel?: ReactNode;
  showSearch?: boolean;
};

export function PortalShell({
  title,
  subtitle,
  studentName,
  gamification,
  children,
  rightPanel,
  showSearch = true,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="ex-portal">
      <div className="ex-portal-mist" aria-hidden />
      <div className="relative z-[1]">
        <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="lg:pl-[196px]">
          <PortalHeader
            title={title}
            subtitle={subtitle}
            studentName={studentName}
            level={gamification.level}
            onMenu={() => setSidebarOpen(true)}
            showSearch={showSearch}
          />
          <div
            className={
              rightPanel
                ? 'mx-auto grid max-w-[1680px] gap-5 px-3 py-4 sm:gap-6 sm:px-5 xl:grid-cols-[minmax(0,1fr)_292px] xl:px-6'
                : 'mx-auto max-w-[1680px] px-3 py-4 sm:px-5 xl:px-6'
            }
          >
            <main className="min-w-0">{children}</main>
            {rightPanel ? (
              <aside className="xl:sticky xl:top-3 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
                {rightPanel}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
