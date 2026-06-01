import {
  DEFAULT_CATEGORY_OPTIONS,
  type CategoryOption,
} from '@/lib/ai-generator-config';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

export async function fetchAdminCategories(): Promise<{
  categories: CategoryOption[];
  warning?: string;
}> {
  try {
    const res = await fetchWithAuth('/api/admin/categories', { cache: 'no-store' });
    const json = (await res.json()) as {
      categories?: CategoryOption[];
      warning?: string;
      error?: string;
    };
    if (res.ok && json.categories?.length) {
      return { categories: json.categories, warning: json.warning };
    }
    return {
      categories: DEFAULT_CATEGORY_OPTIONS,
      warning:
        json.error ??
        json.warning ??
        'Using built-in categories. Run prisma db push or scripts/01-initial-schema.sql on RDS.',
    };
  } catch {
    return {
      categories: DEFAULT_CATEGORY_OPTIONS,
      warning: 'Could not load categories from server. Using built-in list.',
    };
  }
}
