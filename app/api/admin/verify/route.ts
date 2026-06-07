import { NextResponse } from 'next/server';
import { getSafeSession } from '@/lib/auth/safe-session';
import { resolveAppUserById, ensureAdminUser } from '@/lib/roles-prisma';
import { classifyDatabaseError } from '@/lib/db/rds-connectivity';

export async function POST() {
  const session = await getSafeSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let resolved = await resolveAppUserById(user.id);
    if (!resolved && user.role === 'admin') {
      await ensureAdminUser(user.id);
      resolved = await resolveAppUserById(user.id);
    }
    if (!resolved || resolved.role !== 'admin') {
      return NextResponse.json(
        {
          isAdmin: false,
          email: user.email,
          error:
            'This account does not have admin access. Contact the examination cell if you need access.',
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ isAdmin: true, email: user.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { remediation } = classifyDatabaseError(message);
    return NextResponse.json(
      {
        isAdmin: false,
        error: 'Database error while verifying admin role.',
        hint: remediation[0] ?? message,
      },
      { status: 503 },
    );
  }
}
