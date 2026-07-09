import {
  ELEVATEX_CHALLENGE_TITLE,
  ELEVATEX_EXAM_INSTRUCTIONS,
  ELEVATEX_REGISTRATION,
  ELEVATEX_SHORT_OBJECTIVE,
  ELEVATEX_TEST_COMPONENTS,
} from '@/lib/elevatex';

type Props = {
  compact?: boolean;
  /** Show examination instructions list (instructions page). */
  showExamInstructions?: boolean;
  className?: string;
};

export function ElevateXLiveInfo({
  compact = false,
  showExamInstructions = false,
  className = '',
}: Props) {
  if (compact) {
    return (
      <div
        className={`rounded-lg border border-fuchsia-200/80 bg-fuchsia-50/60 p-3 text-sm text-slate-800 space-y-2 ${className}`}
      >
        <p className="leading-snug">{ELEVATEX_SHORT_OBJECTIVE}</p>
        <ul className="text-xs text-slate-600 space-y-0.5">
          <li>
            <span className="font-semibold text-slate-700">Eligibility:</span>{' '}
            {ELEVATEX_REGISTRATION.eligibility}
          </li>
          <li>
            <span className="font-semibold text-slate-700">Mode:</span> {ELEVATEX_REGISTRATION.mode}
            {' · '}
            <span className="font-semibold text-slate-700">Duration:</span>{' '}
            {ELEVATEX_REGISTRATION.duration}
          </li>
          <li>
            <span className="font-semibold text-slate-700">Pattern:</span>{' '}
            C Language — {ELEVATEX_TEST_COMPONENTS[0]?.questions ?? '20 MCQs + 3 coding questions'}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/90 to-white p-5 space-y-4 ${className}`}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-800">
          {ELEVATEX_CHALLENGE_TITLE}
        </p>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">{ELEVATEX_SHORT_OBJECTIVE}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <InfoRow label="Eligibility" value={ELEVATEX_REGISTRATION.eligibility} />
        <InfoRow label="Time slots" value={ELEVATEX_REGISTRATION.timeSlots} />
        <InfoRow label="Mode" value={ELEVATEX_REGISTRATION.mode} />
        <InfoRow label="Duration" value={ELEVATEX_REGISTRATION.duration} />
        <InfoRow label="Result" value={ELEVATEX_REGISTRATION.passingNote} className="sm:col-span-2" />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Test pattern</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-semibold text-slate-600 w-10">#</th>
                <th className="px-3 py-2 font-semibold text-slate-600">Component</th>
                <th className="px-3 py-2 font-semibold text-slate-600">Questions</th>
                <th className="px-3 py-2 font-semibold text-slate-600 hidden md:table-cell">Focus</th>
              </tr>
            </thead>
            <tbody>
              {ELEVATEX_TEST_COMPONENTS.map((row, i) => (
                <tr key={row.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-500 align-top">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 align-top">{row.name}</td>
                  <td className="px-3 py-2 text-slate-700 align-top whitespace-nowrap">{row.questions}</td>
                  <td className="px-3 py-2 text-slate-600 hidden md:table-cell align-top">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2 md:hidden">
          <span className="font-semibold text-slate-600">Focus:</span>{' '}
          {ELEVATEX_TEST_COMPONENTS[0]?.description}
        </p>
      </div>

      {showExamInstructions ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Examination instructions
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2">
            {ELEVATEX_EXAM_INSTRUCTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-white/80 border border-slate-100 px-3 py-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5">{value}</p>
    </div>
  );
}
