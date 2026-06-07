'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLLEGE } from '@/lib/college-brand';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';
import { useAdminGate } from '@/lib/use-admin-gate';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { signOutClient } from '@/lib/client-auth';
import { cn } from '@/lib/utils';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { allowed, loading } = useAdminGate();
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = useCallback(() => {
    const drawer = document.getElementById('admin-nav-drawer');
    if (drawer?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    setNavOpen(false);
  }, []);

  const signOut = async () => {
    await signOutClient();
    router.push('/auth/role');
  };

  useEffect(() => {
    closeNav();
  }, [pathname, closeNav]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  if (loading) {
    return <LoadingScreen message="Loading admin panel…" className="min-h-screen app-portal-shell" />;
  }

  if (!allowed) {
    return (
      <LoadingScreen
        message="Redirecting…"
        className="min-h-screen app-portal-shell"
      />
    );
  }

  const isOverviewActive = pathname === '/admin' || pathname === '/admin/dashboard';

  return (
    <div className="app-portal-shell">
      <header className="app-portal-header relative">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 border border-white/30 bg-white/15 !text-white hover:bg-white/25"
              aria-expanded={navOpen}
              aria-controls="admin-nav-drawer"
              aria-label={navOpen ? 'Close admin menu' : 'Open admin menu'}
              onClick={() => (navOpen ? closeNav() : setNavOpen(true))}
            >
              {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/90 font-bold truncate">
                {COLLEGE.rce} · Administration
              </p>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif] truncate">
                {COLLEGE.shortName}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href="/auth/role" className="hidden sm:inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-white/30 bg-white/10 !text-white hover:bg-white/20 hover:!text-white backdrop-blur h-8 text-xs"
                >
                  Portal
                </Button>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex border border-white/30 bg-white/10 !text-white hover:bg-white/20 h-8 text-xs"
                onClick={signOut}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-[1px]"
          aria-label="Close menu"
          onClick={closeNav}
        />
      ) : null}

      <aside
        id="admin-nav-drawer"
        className={cn(
          'fixed top-0 left-0 z-[100] h-full w-[min(100vw-2.5rem,320px)] bg-[#0c2340] text-white shadow-2xl transition-transform duration-200 ease-out flex flex-col',
          navOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
        aria-hidden={!navOpen}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-bold tracking-tight">Admin menu</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/10"
            aria-label="Close menu"
            onClick={closeNav}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active =
              item.href === '/admin/dashboard'
                ? isOverviewActive
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.description}
                tabIndex={navOpen ? 0 : -1}
                className={cn(
                  'block rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-white text-[#0c2340] shadow-sm'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white',
                )}
                onClick={closeNav}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3 flex flex-col gap-2 sm:hidden">
          <Link href="/auth/role" tabIndex={navOpen ? 0 : -1} onClick={closeNav}>
            <Button variant="outline" className="w-full border-white/30 bg-transparent text-white">
              Portal home
            </Button>
          </Link>
          <Button type="button" variant="outline" className="w-full border-white/30 text-white" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="app-portal-main">{children}</main>
    </div>
  );
}
