import { NextResponse } from 'next/server';
import { handlers } from '@/auth';

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function safeHandler(
  handler: (req: Request, ctx: RouteContext) => Promise<Response>,
  req: Request,
  ctx: RouteContext,
) {
  try {
    return await handler(req, ctx);
  } catch (err) {
    console.error('[nextauth]', err);
    return NextResponse.json(null, { status: 200 });
  }
}

type AuthHandler = (req: Request, ctx: RouteContext) => Promise<Response>;

export async function GET(req: Request, ctx: RouteContext) {
  return safeHandler(handlers.GET as unknown as AuthHandler, req, ctx);
}

export async function POST(req: Request, ctx: RouteContext) {
  return safeHandler(handlers.POST as unknown as AuthHandler, req, ctx);
}
