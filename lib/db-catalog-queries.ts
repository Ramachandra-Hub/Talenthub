import type { DbServiceClient } from '@/lib/db/get-db-service';

export type TestCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  order: number;
};

export async function fetchTestCategories(
  db: DbServiceClient,
): Promise<{ categories: TestCategoryRow[]; error: string | null }> {
  const { data, error } = await db
    .from('test_categories')
    .select('id, name, slug, description, icon, order')
    .order('order', { ascending: true });

  if (error) {
    return { categories: [], error: error.message };
  }

  const categories = (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: row.description != null ? String(row.description) : null,
    icon: row.icon != null ? String(row.icon) : null,
    order: Number(row.order ?? 0),
  }));

  return { categories, error: null };
}
