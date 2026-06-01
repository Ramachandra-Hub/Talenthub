import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { getLiveRmsetSchedule } from '@/lib/rmset/access';
import type { StudentRmsetPaper } from '@/lib/rmset/types';

export async function GET() {
  const auth = await requireAuth(['student']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ paper: null, is_live: false });
  }

  const { data: profile } = await admin
    .from('users')
    .select('branch, academic_year')
    .eq('id', auth.ctx.resolved.id)
    .maybeSingle();

  const department = profile?.branch ?? auth.ctx.resolved.department ?? null;
  const year = profile?.academic_year ?? auth.ctx.resolved.academicYear ?? null;

  if (!department || !year) {
    return NextResponse.json({
      paper: null,
      is_live: false,
      message: 'Complete your profile (department and year) to access RMSET.',
    });
  }

  const schedule = await getLiveRmsetSchedule(admin, department, year);

  const { data: paperRow, error: paperErr } = await admin
    .from('rmset_papers')
    .select('*')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paperErr?.message?.includes('rmset_papers')) {
    return NextResponse.json({
      paper: null,
      is_live: false,
      message: 'RMSET is not configured yet. Ask admin to run migration 027 in AWS RDS.',
    });
  }

  if (!paperRow?.test_id) {
    return NextResponse.json({
      paper: null,
      is_live: Boolean(schedule),
      message: schedule
        ? 'RMSET is scheduled but no paper has been published yet.'
        : 'RMSET is not live for your batch right now.',
    });
  }

  const topicIds = (paperRow.topic_ids ?? []) as string[];
  const { data: tags } = topicIds.length
    ? await admin.from('question_tags').select('id, name, slug').in('id', topicIds)
    : { data: [] };

  const totalQuestions = topicIds.length * (paperRow.questions_per_topic as number);

  const paper: StudentRmsetPaper = {
    paper_id: paperRow.id as string,
    test_id: paperRow.test_id as string,
    title: paperRow.title as string,
    description:
      (paperRow.description as string | null)?.trim() ||
      'Topic-selected MCQ eligibility test configured by your examination cell.',
    duration_minutes: paperRow.duration_minutes as number,
    questions_per_topic: paperRow.questions_per_topic as number,
    total_questions: totalQuestions,
    topics: (tags ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
    })),
    is_live: Boolean(schedule),
    notice: schedule?.notice ?? null,
    starts_at: schedule?.starts_at ?? null,
    ends_at: schedule?.ends_at ?? null,
  };

  return NextResponse.json({ paper, is_live: paper.is_live });
}
