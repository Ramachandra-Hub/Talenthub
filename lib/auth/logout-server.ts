import { signOut } from '@/auth';
import { auth } from '@/auth';
import { resolveAppUserById } from '@/lib/roles-prisma';
import { releaseStudentSessionPrisma } from '@/lib/student-session-lock-prisma';

/** Clear session lock (students) and NextAuth cookies. Works for any signed-in role. */
export async function performAppLogout(): Promise<{ signedOut: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { signedOut: false };
  }

  const resolved = await resolveAppUserById(userId);
  if (resolved?.role === 'student') {
    try {
      await releaseStudentSessionPrisma(userId);
    } catch (err) {
      console.warn('[logout] releaseStudentSessionPrisma', err);
    }
  }

  await signOut({ redirect: false });
  return { signedOut: true };
}
