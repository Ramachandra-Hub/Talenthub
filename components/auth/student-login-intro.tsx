import { COLLEGE } from '@/lib/college-brand';

const ACCESS_POINTS = [
  {
    icon: '🎓',
    title: 'Secure student access',
    detail:
      'Sign in with your official roll number and examination-cell password. Your session is tied to your academic profile.',
  },
  {
    icon: '📅',
    title: 'Slot-based examinations',
    detail:
      'Live papers appear when your department opens your assigned slot. The portal refreshes automatically — no manual reload needed.',
  },
  {
    icon: '📝',
    title: 'Structured assessments',
    detail:
      'View paper structure, duration, and instructions on the examinations page before you start. ElevateX and faculty exams are both supported.',
  },
  {
    icon: '🔒',
    title: 'Examination integrity',
    detail:
      'Attempts are recorded against your roll number. Complete each paper in one sitting within your scheduled window.',
  },
] as const;

export function StudentLoginIntro({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-2xl border border-[#1e3a5f]/15 bg-white/70 backdrop-blur-sm px-5 py-4 shadow-sm shadow-[#1e3a5f]/5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1e3a5f]/80">
          {COLLEGE.rce} · Student portal
        </p>
        <p className="mt-2 text-sm text-slate-700 leading-relaxed">
          Access live examinations, view your assigned slot, and begin faculty-approved papers when
          your window opens.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1e4a7a]">
          {COLLEGE.rce} · {COLLEGE.departmentTitle}
        </p>
        <h1 className="mt-3 text-2xl sm:text-[1.85rem] font-bold text-[#0c2340] leading-tight font-[family-name:var(--font-display),ui-serif,Georgia,serif]">
          Student examination portal
        </h1>
        <p className="mt-4 text-[15px] text-slate-700 leading-relaxed max-w-md">
          {COLLEGE.portalSubtitle}. Use the credentials issued by the examination cell to view
          scheduled papers, review instructions, and start your assessment when your slot is live.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          What you can do here
        </p>
        <ul className="space-y-3">
          {ACCESS_POINTS.map((item) => (
            <li
              key={item.title}
              className="flex gap-3.5 rounded-xl border border-slate-200/90 bg-white/80 p-4 shadow-sm shadow-slate-900/[0.03]"
            >
              <span className="text-xl shrink-0 mt-0.5" aria-hidden>
                {item.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#0c2340]">{item.title}</p>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white px-4 py-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900/80">Before you sign in</p>
        <p className="text-sm text-amber-950/90 mt-1.5 leading-relaxed">
          Enter your roll number exactly as on your ID card, select the correct department and year,
          and use the password shared by the T&amp;P / examination cell — not your personal email
          password.
        </p>
      </div>
    </div>
  );
}
