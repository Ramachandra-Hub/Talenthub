'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

type Crumb = { label: string; href?: string };

type Props = {
  items: Crumb[];
  className?: string;
};

export function MissionBreadcrumb({ items, className }: Props) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1.5 text-[11px]', className)}>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span className="text-slate-600">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="font-semibold text-cyan-300/90 hover:text-cyan-200">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-300">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
