'use client';

type Props = {
  stars: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
};

const sizes = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
};

export function DsaStarRating({ stars, max = 3, size = 'md', animate = false }: Props) {
  return (
    <div className={`flex gap-0.5 justify-center ${sizes[size]}`} aria-label={`${stars} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < stars;
        return (
          <span
            key={i}
            className={`inline-block leading-none ${
              filled ? 'dsa-star-animate text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]' : 'text-white/25'
            }`}
            style={animate && filled ? { animationDelay: `${i * 120}ms` } : undefined}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
