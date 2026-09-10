import type { DbServiceClient } from '@/lib/db/get-db-service';
import { deleteExamScheduleById, deleteFacultyExamRequest } from '@/lib/delete-faculty-exam';
import { prisma } from '@/lib/prisma';

export type ParsedOverviewItemId =
  | { type: 'schedule'; id: string }
  | { type: 'evalora'; id: string }
  | { type: 'faculty'; id: string }
  | { type: 'exam'; id: string };

export function parseOverviewItemId(overviewId: string): ParsedOverviewItemId | null {
  if (overviewId.startsWith('schedule:')) {
    return { type: 'schedule', id: overviewId.slice('schedule:'.length) };
  }
  if (overviewId.startsWith('evalora:')) {
    return { type: 'evalora', id: overviewId.slice('evalora:'.length) };
  }
  if (overviewId.startsWith('faculty:')) {
    return { type: 'faculty', id: overviewId.slice('faculty:'.length) };
  }
  if (overviewId.startsWith('exam:')) {
    return { type: 'exam', id: overviewId.slice('exam:'.length) };
  }
  return null;
}

export async function deleteAdminTestOverviewItem(
  admin: DbServiceClient,
  overviewId: string,
): Promise<{ ok: true; message: string } | { error: string }> {
  const parsed = parseOverviewItemId(overviewId);
  if (!parsed) return { error: 'Unknown test record' };

  if (parsed.type === 'schedule') {
    const result = await deleteExamScheduleById(admin, parsed.id);
    if ('error' in result) return { error: result.error };
    return { ok: true, message: 'Schedule window deleted.' };
  }

  if (parsed.type === 'evalora') {
    const { error } = await admin
      .from('evalora_module_schedules')
      .delete()
      .eq('id', parsed.id);
    if (error) return { error: error.message };
    return { ok: true, message: 'Module schedule deleted.' };
  }

  if (parsed.type === 'exam') {
    try {
      const existing = await prisma.exam.findUnique({
        where: { id: parsed.id },
        select: { id: true, title: true },
      });
      if (!existing) return { error: 'Published exam not found' };
      await prisma.exam.update({
        where: { id: parsed.id },
        data: {
          status: 'ended',
          openLinkEnabled: false,
          endTime: new Date(),
        },
      });
      return {
        ok: true,
        message: `Open-link exam "${existing.title}" ended and removed from Tests.`,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to end published exam' };
    }
  }

  const result = await deleteFacultyExamRequest(admin, parsed.id);
  if ('error' in result) return { error: result.error };
  const warning =
    result.errors.length > 0 ? ` (${result.errors.slice(0, 2).join('; ')})` : '';
  return {
    ok: true,
    message: `Exam "${result.title ?? 'Untitled'}" deleted.${warning}`,
  };
}
