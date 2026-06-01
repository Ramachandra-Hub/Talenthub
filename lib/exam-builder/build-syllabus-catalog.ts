import type { DbServiceClient } from '@/lib/db/get-db-service';
import { syllabusUnitsForGroup, type SyllabusGroupKey } from '@/lib/exam-builder/syllabus';
import { looksLikeUuid } from '@/lib/exam-builder/id-utils';
import { prisma } from '@/lib/prisma';

export type SyllabusCatalogTopic = {
  id: string;
  slug: string;
  name: string;
  question_count: number;
};

async function countForSlug(
  admin: DbServiceClient,
  slug: string,
  tagId?: string,
): Promise<number> {
  if (tagId && looksLikeUuid(tagId)) {
    const { count, error } = await admin
      .from('question_tag_links')
      .select('*', { count: 'exact', head: true })
      .eq('tag_id', tagId);
    if (!error && count != null) return count;
  }

  const { count, error } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .contains('tags', [slug]);

  if (error) return 0;
  return count ?? 0;
}

/** Build syllabus picker options for a test type with live bank counts. */
export async function buildSyllabusCatalogForGroup(
  admin: DbServiceClient,
  group: SyllabusGroupKey,
): Promise<SyllabusCatalogTopic[]> {
  const units = syllabusUnitsForGroup(group);
  const { data: allTags } = await admin.from('question_tags').select('id, name, slug').order('name');
  const tagBySlug = new Map((allTags ?? []).map((t) => [t.slug as string, t]));

  const linkGroups = await prisma.questionTagLink.groupBy({
    by: ['tagId'],
    _count: { questionId: true },
  });
  const linkCountByTagId = new Map(
    linkGroups.map((g) => [g.tagId, g._count.questionId]),
  );

  return Promise.all(
    units.map(async (unit) => {
      const tag = tagBySlug.get(unit.slug);
      const tagId = tag?.id != null ? String(tag.id) : null;
      let count =
        tagId && looksLikeUuid(tagId) ? (linkCountByTagId.get(tagId) ?? 0) : 0;
      if (count === 0) {
        count = await countForSlug(admin, unit.slug, tagId ?? undefined);
      }
      return {
        id: tagId && looksLikeUuid(tagId) ? tagId : unit.slug,
        slug: unit.slug,
        name: (tag?.name as string) ?? unit.name,
        question_count: count,
      };
    }),
  );
}
