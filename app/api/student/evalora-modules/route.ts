import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  partitionEvaloraModulesForStudent,
  type EvaloraModuleScheduleRow,
} from '@/lib/evalora/module-schedule';

export async function GET() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ live: [], upcoming: [], department: null, year: null });
  }

  const { data: profile } = await admin
    .from('users')
    .select('branch, academic_year')
    .eq('id', auth.ctx.resolved.id)
    .maybeSingle();

  const prof = profile as { branch?: string; academic_year?: string } | null;
  const department = prof?.branch ?? auth.ctx.resolved.department ?? null;
  const year = prof?.academic_year ?? auth.ctx.resolved.academicYear ?? null;

  if (!department || !year) {
    return NextResponse.json({
      live: [],
      upcoming: [],
      department,
      year,
      message: 'Complete your profile (department and year) to see ElevateX and scheduled assessments.',
    });
  }

  const { data: rows, error } = await admin
    .from('evalora_module_schedules')
    .select('*')
    .neq('status', 'ended')
    .order('starts_at', { ascending: true });

  if (error) {
    return NextResponse.json({ live: [], upcoming: [], department, year });
  }

  const { live, upcoming } = partitionEvaloraModulesForStudent(
    (rows ?? []) as EvaloraModuleScheduleRow[],
    department,
    year,
  );

  return NextResponse.json({ live, upcoming, department, year });
}
