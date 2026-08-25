import type { ReactNode } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/src/components/BottomNav';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-graphite">
      <main className="flex-1 px-4 pb-24 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
