'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export default function CheckoutPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Checkout Removed</h1>
        <p className="text-gray-600 mb-8">
          Payment and subscription flows are disabled. All students can access practice features for free.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => router.push('/exams')} className="bg-blue-600 hover:bg-blue-700 text-white">
            Go to Examinations
          </Button>
          <Button onClick={() => router.push('/auth/role')} variant="outline">
            Sign in
          </Button>
        </div>
      </Card>
    </div>
  );
}
