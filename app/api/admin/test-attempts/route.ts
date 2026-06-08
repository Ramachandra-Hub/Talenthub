import { NextResponse } from 'next/server';
import {
  loadAdminStudentsPrisma,
  loadAllAttemptsRollupPrisma,
} from '@/lib/admin/attempts-rollup-prisma';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const [students, rollup] = await Promise.all([
    loadAdminStudentsPrisma(),
    loadAllAttemptsRollupPrisma(),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const enriched = rollup.attempts.map((a) => {
    const student = studentById.get(a.user_id);
    return {
      id: a.id,
      user_id: a.user_id,
      test_id: a.test_id,
      score: a.score,
      status: a.status,
      created_at: a.created_at,
      completed_at: a.completed_at,
      testName: a.test_name,
      studentName: student?.full_name?.trim() || student?.email || 'Student',
      studentEmail: student?.email || '—',
      roll_number: student?.roll_number || '',
      source: a.source,
    };
  });

  const tests = Array.from(rollup.testsById.entries())
    .map(([id, name]) => ({
      id,
      name,
      attempt_count: enriched.filter(
        (a) => a.test_id && (a.test_id === id || String(a.test_id) === id),
      ).length,
    }))
    .sort((a, b) => b.attempt_count - a.attempt_count || a.name.localeCompare(b.name));

  return NextResponse.json({
    attempts: enriched,
    tests,
    warnings: [],
    total: enriched.length,
  });
}
