import type { NextRequest } from 'next/server';

/** Forward admin cookies and setup secret for internal setup route calls. */
export function forwardSetupHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const secret = request.headers.get('x-setup-secret')?.trim();
  if (secret) {
    headers.set('x-setup-secret', secret);
  }
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return headers;
}
