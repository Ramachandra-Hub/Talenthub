import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  EXAM_BUILDER_SLOTS,
  EXAM_BUILDER_TEST_TYPES,
} from '@/lib/exam-builder/test-catalog';
import { buildSyllabusCatalogForGroup } from '@/lib/exam-builder/build-syllabus-catalog';
import type { SyllabusGroupKey } from '@/lib/exam-builder/syllabus';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ testTypes: EXAM_BUILDER_TEST_TYPES, slots: EXAM_BUILDER_SLOTS, topics: [] });
  }

  const syllabusByTestType: Record<
    string,
    Awaited<ReturnType<typeof buildSyllabusCatalogForGroup>>
  > = {};

  for (const testType of EXAM_BUILDER_TEST_TYPES) {
    if (!testType.syllabusGroup) continue;
    syllabusByTestType[testType.id] = await buildSyllabusCatalogForGroup(
      admin,
      testType.syllabusGroup as SyllabusGroupKey,
    );
  }

  return NextResponse.json({
    testTypes: EXAM_BUILDER_TEST_TYPES,
    slots: EXAM_BUILDER_SLOTS,
    syllabusByTestType,
  });
}
