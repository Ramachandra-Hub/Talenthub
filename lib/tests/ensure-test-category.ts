import { randomUUID } from 'crypto';
import type { DbServiceClient } from '@/lib/db/get-db-service';

export type EnsureTestCategoryInput = {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
};

/** RDS test_categories.id is UUID NOT NULL without a DB default — always supply id on insert. */
export async function ensureTestCategory(
  admin: DbServiceClient,
  input: EnsureTestCategoryInput,
): Promise<string> {
  const { data: existing } = await admin
    .from('test_categories')
    .select('id')
    .eq('slug', input.slug)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data: created, error } = await admin
    .from('test_categories')
    .insert({
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .select('id')
    .single();

  if (!error && created?.id) return String(created.id);

  if (error && /duplicate|unique/i.test(error.message)) {
    const { data: again } = await admin
      .from('test_categories')
      .select('id')
      .eq('slug', input.slug)
      .maybeSingle();
    if (again?.id) return String(again.id);
  }

  throw new Error(error?.message ?? `Could not create test category "${input.slug}"`);
}
