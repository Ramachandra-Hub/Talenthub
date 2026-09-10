'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOutClient } from '@/lib/client-auth';

/** Student-facing finish page — no scorecard (admin-only). */
export default function OpenCodingResultPage() {
  const params = useParams();
  const examId = String(params.examId ?? '');

  useEffect(() => {
    // Finalize if needed, clear lock cookie, then sign out so the student leaves the exam.
    const done = async () => {
      try {
        await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/result`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });
      } catch {
        /* already finalized or network — still show thank-you */
      }
      try {
        await fetch(`/api/student/open-coding/${encodeURIComponent(examId)}/result`, {
          credentials: 'include',
          cache: 'no-store',
        });
      } catch {
        /* cookie clear via GET */
      }
      void signOutClient();
    };
    void done();
  }, [examId]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1e3a5f]">
          Exam submitted
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#0c2340]">Thank you.</h1>
        <p className="mt-2 text-slate-700">
          Your coding exam has been submitted successfully. You can close this window now.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Scores and scorecards are available only to administrators — they are not shown to
          students.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => window.close()}>
            Close window
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/role">Exit to sign-in page</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
