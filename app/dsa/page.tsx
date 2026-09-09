import { redirect } from 'next/navigation';

/** Canonical DSA Arena entry is /dsa-arena (Adventure Map). */
export default function DsaPage() {
  redirect('/dsa-arena');
}
