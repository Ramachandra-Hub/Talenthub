import { redirect } from 'next/navigation';

/** Roadmap tab opens the same gamified Adventure Map as DSA Arena home. */
export default function DsaArenaRoadmapPage() {
  redirect('/dsa-arena');
}
