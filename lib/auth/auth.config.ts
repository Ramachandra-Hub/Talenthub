import type { NextAuthConfig } from 'next-auth';
import { buildAuthProviders } from '@/lib/auth/providers';

export const authConfig = {
  providers: buildAuthProviders(),
  pages: {
    signIn: '/auth/role',
    error: '/auth/role',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 12, // 12 hours — exam day
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? 'student';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as 'admin' | 'student') ?? 'student';
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
