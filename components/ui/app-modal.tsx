'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Accessible label for the backdrop close control */
  ariaLabel?: string;
  zIndexClass?: string;
};

/** Viewport-safe modal shell — scrolls on small screens instead of clipping off-screen. */
export function AppModal({
  open,
  onClose,
  children,
  className,
  ariaLabel = 'Close dialog',
  zIndexClass = 'z-[100]',
}: AppModalProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 overflow-y-auto overscroll-contain',
        zIndexClass,
        className,
      )}
      role="presentation"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
        aria-label={ariaLabel}
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div
          className="relative z-[1] my-auto w-full"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type AppModalPanelProps = {
  children: ReactNode;
  className?: string;
  maxWidthClass?: string;
};

export function AppModalPanel({
  children,
  className,
  maxWidthClass = 'max-w-6xl',
}: AppModalPanelProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl',
        'max-h-[min(calc(100dvh-1.5rem),920px)]',
        maxWidthClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
