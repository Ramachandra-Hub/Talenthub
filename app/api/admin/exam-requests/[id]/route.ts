import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { deleteFacultyExamRequest } from '@/lib/delete-faculty-exam';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const result = await deleteFacultyExamRequest(admin, id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const warning =
    result.errors.length > 0
      ? ` Deleted with warnings: ${result.errors.slice(0, 3).join('; ')}`
      : '';

  return NextResponse.json({
    ok: true,
    message: `Exam "${result.title ?? 'Untitled'}" deleted.${warning}`,
    ...result,
  });
}
