import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { checkIsAdmin } from '@/lib/admin-verify';
import { requireAuth } from '@/lib/server-auth';

export async function GET(request: Request) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const service = getDbService();
  if (!service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const isAdmin = await checkIsAdmin(service, auth.ctx.resolved.id, auth.ctx.resolved.email);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const slug = new URL(request.url).searchParams.get('slug')?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'slug query required' }, { status: 400 });
  }

  const { data, error } = await service
    .from('test_categories')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    const hint =
      error.message.includes('schema cache') || error.message.includes('test_categories')
        ? ' Run prisma db push or scripts/01-initial-schema.sql on RDS.'
        : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ error: `No category found for slug: ${slug}` }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, name: data.name, slug: data.slug });
}
