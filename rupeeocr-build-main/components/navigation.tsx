'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { getStoredSession } from '@/lib/auth';

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { href: '/', icon: 'home', label: 'Home' },
  { href: '/upload', icon: 'add_circle', label: 'Scan' },
  { href: '/receipts', icon: 'description', label: 'Receipts' },
  { href: '/analytics', icon: 'insights', label: 'Analytics' },
  { href: '/profile', icon: 'person', label: 'Profile' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-header border-t border-outline-variant/10 safe-area-bottom">
      <div className="max-w-md mx-auto flex items-center justify-between px-6 py-3">
        {navItems.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 group cursor-pointer transition-all"
            >
              <span
                className={`material-symbols-outlined text-2xl ${
                  isActive ? 'text-primary' : 'text-outline group-hover:text-primary'
                }`}
                style={{
                  fontVariationSettings: isActive
                    ? "'FILL' 1, 'wght' 400"
                    : "'FILL' 0, 'wght' 400",
                }}
              >
                {item.icon}
              </span>
              <span
                className={`text-[10px] font-label ${
                  isActive
                    ? 'font-bold text-primary'
                    : 'font-medium text-outline group-hover:text-primary'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TopHeader({ title, showBack = false }: { title?: string; showBack?: boolean }) {
  const [initial, setInitial] = useState('S');

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user.email) {
      setInitial(session.user.email.charAt(0).toUpperCase());
    }
  }, []);

  return (
    <header className="glass-header sticky top-0 z-40 flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        {showBack ? (
          <Link
            href="/"
            className="p-1.5 -ml-1.5 hover:bg-surface-container rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface">arrow_back</span>
          </Link>
        ) : (
          <span
            className="material-symbols-outlined text-primary text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            receipt_long
          </span>
        )}
        <h1 className="font-headline font-bold text-xl tracking-tight text-on-surface">
          {title || 'SmartReceipt AI'}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
        </button>
        <div className="w-10 h-10 rounded-full bg-primary-fixed overflow-hidden border-2 border-surface-container-lowest">
          <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-headline font-bold text-sm">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
