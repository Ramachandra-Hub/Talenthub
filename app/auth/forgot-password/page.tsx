'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { COLLEGE } from '@/lib/college-brand';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/90 shadow-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-[#0c2340] mb-3">Password reset</h1>
        <p className="text-slate-600 mb-6 leading-relaxed">
          Student passwords are managed by the {COLLEGE.departmentTitle} examination cell.
          Contact your department faculty or training &amp; placement office to reset your password.
        </p>
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/auth/login/student">Back to student login</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/role">Sign in portal</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
