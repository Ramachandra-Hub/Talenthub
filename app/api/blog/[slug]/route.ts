import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { guardPublicApi } from '@/lib/public-api-guard';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const denied = guardPublicApi(request, 'blog-slug');
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const db = getDbService();
    const { data, error } = await db
      .from('blog_posts')
      .select('slug, title, published_at, excerpt, body')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Could not load post' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post: data });
  } catch {
    return NextResponse.json({ error: 'Could not load post' }, { status: 500 });
  }
}
