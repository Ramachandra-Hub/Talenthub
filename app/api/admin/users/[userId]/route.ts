import { NextResponse } from 'next/server';
import { deleteStudentFromApplication } from '@/lib/admin/delete-student-admin';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { userId } = await context.params;
  const id = userId?.trim();
  if (!id) {
    return NextResponse.json({ error: 'User id required' }, { status: 400 });
  }

  const result = await deleteStudentFromApplication(id);
  if ('error' in result) {
    const status = result.error === 'Student not found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    message: `Deleted ${result.label} from the application.`,
    ...result,
  });
}
