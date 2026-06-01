import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  trend?: { value: string; tone?: 'positive' | 'negative' | 'neutral' };
  accent?: 'navy' | 'blue' | 'emerald' | 'cyan' | 'amber' | 'red' | 'indigo';
  className?: string;
  onClick?: () => void;
};

const accentGradient = {
  navy: 'from-[#2a5f8f] to-[#1e3a5f]',
  blue: 'from-blue-500 to-blue-700',
  emerald: 'from-emerald-500 to-emerald-700',
  cyan: 'from-cyan-500 to-cyan-700',
  amber: 'from-amber-400 to-amber-600',
  red: 'from-red-500 to-red-700',
  indigo: 'from-indigo-500 to-indigo-700',
} as const;

const accentSoft = {
  navy: 'bg-[#1e3a5f]/8 text-[#1e3a5f]',
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  cyan: 'bg-cyan-50 text-cyan-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  indigo: 'bg-indigo-50 text-indigo-700',
} as const;

const valueTone = {
  navy: 'text-[#0c2340]',
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  cyan: 'text-cyan-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  indigo: 'text-indigo-700',
} as const;

const trendTone = {
  positive: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  negative: 'text-red-700 bg-red-50 border-red-200',
  neutral: 'text-slate-700 bg-slate-50 border-slate-200',
} as const;

function StatCardBody({
  label,
  value,
  hint,
  icon,
  trend,
  accent,
  clickable,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  trend?: StatCardProps['trend'];
  accent: NonNullable<StatCardProps['accent']>;
  clickable: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1 bg-gradient-to-r',
          accentGradient[accent],
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {icon ? (
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg text-base',
              accentSoft[accent],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          'text-3xl font-bold tabular-nums tracking-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif]',
          valueTone[accent],
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {(hint || trend) && (
          <div className="flex items-center gap-2 flex-wrap">
            {trend ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  trendTone[trend.tone ?? 'neutral'],
                )}
              >
                {trend.value}
              </span>
            ) : null}
            {hint ? <p className="text-xs text-slate-500 leading-relaxed">{hint}</p> : null}
          </div>
        )}
        {clickable ? (
          <p className="text-[10px] font-semibold text-[#1e3a5f]/70">Click for full report →</p>
        ) : null}
      </div>
    </>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  accent = 'navy',
  className,
  onClick,
}: StatCardProps) {
  const clickable = Boolean(onClick);
  const cardClassName = cn(
    'app-stat-card text-left w-full',
    clickable &&
      'cursor-pointer transition-shadow hover:shadow-[var(--shadow-lux-lg)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f]/40',
    className,
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        className={cardClassName}
      >
        <StatCardBody
          label={label}
          value={value}
          hint={hint}
          icon={icon}
          trend={trend}
          accent={accent}
          clickable={clickable}
        />
      </button>
    );
  }

  return (
    <div className={cardClassName}>
      <StatCardBody
        label={label}
        value={value}
        hint={hint}
        icon={icon}
        trend={trend}
        accent={accent}
        clickable={clickable}
      />
    </div>
  );
}
