import { NextResponse, type NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { edgeAuth } from '@/lib/auth/auth-edge';
import {
  defaultRedirectForRole,
  isAdminRoute,
  isStudentExperienceRoute,
} from '@/lib/roles';
import { isSetupRoutesEnabled } from '@/lib/setup/is-setup-enabled';

const PROTECTED_PREFIXES = [
  '/exams',
  '/home',
  '/dashboard',
  '/placement',
  '/tests/rmset',
  '/tests/take',
  '/tests/programming',
  '/tests/result',
  '/tests/department',
  '/admin',
  '/profile',
  '/checkout',
  '/ai',
  '/tests/competitive-exam',
  '/practice',
  '/coding',
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function applyRoleRedirects(
  request: NextRequest,
  role: 'admin' | 'student',
): NextResponse | null {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/') {
    return NextResponse.redirect(new URL(defaultRedirectForRole(role), request.url));
  }

  if (role === 'admin' && isStudentExperienceRoute(pathname)) {
    return NextResponse.redirect(new URL(defaultRedirectForRole('admin'), request.url));
  }

  if (role === 'student') {
    if (isAdminRoute(pathname)) {
      return NextResponse.redirect(new URL('/exams', request.url));
    }
    if (
      pathname === '/dashboard' ||
      pathname.startsWith('/dashboard/') ||
      pathname === '/home' ||
      pathname === '/profile' ||
      pathname.startsWith('/ai/')
    ) {
      return NextResponse.redirect(new URL('/exams', request.url));
    }
    if (pathname === '/tests' || pathname === '/placement') {
      return NextResponse.redirect(new URL('/exams', request.url));
    }
  }

  return null;
}

async function proxyAws(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  let authSession: Session | null = null;
  try {
    authSession = await edgeAuth();
  } catch (err) {
    console.error('[proxy] session decode failed:', err);
    if (isProtectedPath(pathname)) {
      const loginUrl = new URL('/auth/role', request.url);
      loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request: { headers: request.headers } });
  }
  const role = (authSession?.user?.role as 'admin' | 'student' | undefined) ?? null;

  if (!authSession?.user && isProtectedPath(pathname)) {
    const loginUrl = new URL('/auth/role', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (role) {
    const redirect = applyRoleRedirects(request, role);
    if (redirect) return redirect;
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    (pathname.startsWith('/api/setup') ||
      pathname.startsWith('/api/manual-setup') ||
      pathname === '/api/admin/init-db') &&
    !isSetupRoutesEnabled()
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (process.env.NEXT_PUBLIC_SIGNUP_DISABLED === 'true' || process.env.VERCEL_ENV === 'production') {
    const signupPaths = ['/auth/signup', '/auth/signup/student'];
    if (signupPaths.includes(pathname) && process.env.NEXT_PUBLIC_SIGNUP_DISABLED !== 'false') {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/role';
      url.searchParams.set('notice', 'signup_closed');
      return NextResponse.redirect(url);
    }
  }

  if (
    pathname.startsWith('/faculty') ||
    pathname.startsWith('/auth/login/faculty') ||
    pathname.startsWith('/auth/signup/faculty')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/auth/') ? '/auth/role' : '/admin/exam-builder';
    url.searchParams.set('notice', 'faculty_portal_moved');
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin/approvals')) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/exam-builder';
    return NextResponse.redirect(url);
  }

  if (pathname === '/student' || pathname.startsWith('/student/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login/student';
    return NextResponse.redirect(url);
  }

  // APIs authenticate themselves. Running edgeAuth on every /api/* call
  // (including /api/student/me) stacks JWT work on the exam-day traffic
  // and shows up in the browser as connection timeouts.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  return proxyAws(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
