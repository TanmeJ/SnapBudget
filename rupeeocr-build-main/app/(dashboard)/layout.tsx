'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { TopHeader, BottomNav } from '@/components/navigation';
import { getStoredSession } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-on-surface-variant text-sm">Checking your session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <TopHeader />
      {children}
      <BottomNav />
    </div>
  );
}
