'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Dumbbell, TrendingUp, Award, ClipboardList } from 'lucide-react';

const TABS = [
  { href: '/today', label: 'Today', Icon: CalendarDays },
  { href: '/lift', label: 'Lift', Icon: Dumbbell },
  { href: '/trends', label: 'Trends', Icon: TrendingUp },
  { href: '/verdict', label: 'Verdict', Icon: Award },
  { href: '/plan', label: 'Plan', Icon: ClipboardList },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-between px-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href} className="flex-1">
              <Link href={href} className="flex flex-col items-center gap-1 py-2">
                <Icon size={20} color={active ? '#e0603a' : '#5b6470'} />
                <span
                  className={`font-body text-[11px] ${active ? 'font-medium text-rustSoft' : 'text-steel'}`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
