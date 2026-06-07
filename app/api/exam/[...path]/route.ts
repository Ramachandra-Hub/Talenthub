import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isExamProxyPathAllowed } from '@/lib/exam-gateway-allowlist';
import { isStrictProduction } from '@/lib/production';

const gatewayBase = () => (process.env.EXAM_GATEWAY_URL || '').replace(/\/$/, '');

function mergeUserIdIntoJsonBody(bodyText: string, userId: string): string {
  try {
    const parsed = JSON.parse(bodyText || '{}') as Record<string, unknown>;
    parsed.userId = userId;
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({ userId });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const gatewayUrl = gatewayBase();
  const internalToken = process.env.EXAM_INTERNAL_API_TOKEN?.trim();

  if (!gatewayUrl || !internalToken) {
    if (isStrictProduction()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Exam gateway is not configured. Set EXAM_GATEWAY_URL and EXAM_INTERNAL_API_TOKEN.' },
      { status: 503 },
    );
  }

  const { path } = await ctx.params;
  const suffix = path.join('/');
  if (!isExamProxyPathAllowed(suffix)) {
    return NextResponse.json({ error: 'Path not allowed on exam proxy' }, { status: 403 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUrl = `${gatewayUrl}/exam/${suffix}`;
  const contentType = request.headers.get('content-type') || 'application/json';
  let bodyText = await request.text();
  if (contentType.includes('application/json')) {
    bodyText = mergeUserIdIntoJsonBody(bodyText, userId);
  }

  const upstream = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-internal-token': internalToken,
    },
    body: bodyText,
    signal: AbortSignal.timeout(25_000),
  });

  const outCt = upstream.headers.get('content-type') || 'application/json';
  const outBody = await upstream.text();
  return new NextResponse(outBody, { status: upstream.status, headers: { 'Content-Type': outCt } });
}
