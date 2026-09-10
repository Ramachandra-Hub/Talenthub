import type { DbServiceClient } from '@/lib/db/get-db-service';
import { deleteExamScheduleById, deleteFacultyExamRequest } from '@/lib/delete-faculty-exam';

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
    const { endOpenLinkExamByOverviewId } = await import('@/lib/admin/end-open-link-exam');
    const ended = await endOpenLinkExamByOverviewId(overviewId);
    if ('error' in ended) return { error: ended.error };
    return { ok: true, message: ended.message };
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
