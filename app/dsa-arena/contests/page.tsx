import { redirect } from 'next/navigation';

/** Contests live under left-nav Contests (/contests), not DSA Arena. */
export default function DsaArenaContestsRedirect() {
  redirect('/contests');
}
