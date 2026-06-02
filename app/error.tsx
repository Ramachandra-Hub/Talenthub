'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error]', error.digest ?? error.message, error);
  }, [error]);

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#0c2340]">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-600">
          The page could not be loaded. Try again, or sign in from the portal home.
        </p>
        {process.env.NODE_ENV === 'development' && error.message ? (
          <p className="mt-4 text-left text-xs font-mono text-red-800 bg-red-50 border border-red-100 rounded-lg p-3 break-words">
            {error.message}
          </p>
        ) : null}
        {error.digest ? (
          <p className="mt-2 text-xs text-slate-500">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/auth/role">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
