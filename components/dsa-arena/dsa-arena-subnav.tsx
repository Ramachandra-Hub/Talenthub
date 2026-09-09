'use client';

import Link from 'next/link';

/** Journey topic/mission pages — return to the gamified Adventure Map. */
export function DsaArenaSubnav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="DSA Arena sections">
      <Link
        href="/dsa-arena"
        className="rounded-md bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 ring-1 ring-cyan-400/40"
      >
        ← Adventure Map
      </Link>
    </nav>
  );
}
