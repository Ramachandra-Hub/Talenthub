import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Branded header strip for login forms */
  title?: string;
  description?: string;
};

export function AuthCard({ children, className, title, description }: Props) {
  return (
    <div
      className={cn(
        'lux-hero-card overflow-hidden rounded-2xl border border-slate-200/90 flex flex-col gap-0',
        className,
      )}
    >
      {title ? (
        <div className="app-brand-bar auth-card-header relative px-6 py-5 sm:px-8 sm:py-6">
          <h2 className="text-lg font-semibold text-white tracking-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-white/85">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="bg-white px-6 py-6 sm:px-8 sm:py-7 text-slate-950">{children}</div>
    </div>
  );
}
