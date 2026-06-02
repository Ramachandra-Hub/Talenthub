import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';
import { ensureAuthUrlEnv } from '@/lib/auth/auth-url';

ensureAuthUrlEnv();

/**
 * JWT session decode for proxy/middleware only — never import Prisma here.
 * Sign-in uses `auth` from `@/auth` (Node.js + credentials + RDS).
 */
export const { auth: edgeAuth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
});
