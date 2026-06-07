import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { guardPublicApi } from '@/lib/public-api-guard';
import { isStrictProduction } from '@/lib/production';

export async function GET(request: Request) {
  const denied = guardPublicApi(request, 'blog');
  if (denied) return denied;

  try {
    const db = getDbService();
    const { data, error } = await db
      .from('blog_posts')
      .select('slug, title, published_at, excerpt')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(isStrictProduction() ? 20 : 50);

    if (error) {
      return NextResponse.json({ error: 'Could not load posts' }, { status: 500 });
    }

    return NextResponse.json({ posts: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Could not load posts' }, { status: 500 });
  }
}
