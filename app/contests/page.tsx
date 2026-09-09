import { redirect } from 'next/navigation';

/** Legacy portal path — coding contests live under DSA Arena. */
export default function ContestsRedirectPage() {
  redirect('/dsa-arena/contest');
}
