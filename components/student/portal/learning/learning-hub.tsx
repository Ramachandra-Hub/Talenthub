'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PortalPageFrame } from '@/components/student/portal/portal-page-frame';

const COURSES = [
  { id: 'python', title: 'Python', progress: 42, next: 'Functions & modules', hours: '8h left' },
  { id: 'sql', title: 'SQL', progress: 28, next: 'Joins & aggregation', hours: '6h left' },
  { id: 'dsa', title: 'Data Structures', progress: 55, next: 'Arrays deep dive', hours: '12h left' },
  { id: 'aptitude', title: 'Aptitude', progress: 15, next: 'Percentages', hours: '10h left' },
  { id: 'ml', title: 'Machine Learning', progress: 8, next: 'Intro to ML', hours: '20h left' },
  { id: 'dl', title: 'Deep Learning', progress: 0, next: 'Neural foundations', hours: '24h left' },
];

export function LearningHubView() {
  return (
    <PortalPageFrame
      title="LEARNING HUB"
      subtitle="Structured modules. Clear next steps."
    >
      <div className="space-y-5">
        <section className="ex-panel rounded-xl p-5">
          <p className="text-[13px] text-slate-400">
            Learning Hub is your curriculum bookshelf — separate from the DSA Arena journey.
            Progress here unlocks recommended practice in Exam Center and Arena.
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COURSES.map((c) => (
            <article key={c.id} className="ex-panel rounded-xl p-4">
              <h3 className="text-[15px] font-semibold text-white">{c.title}</h3>
              <p className="mt-1 text-[12px] text-slate-400">Next: {c.next}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>{c.progress}%</span>
                <span>{c.hours}</span>
              </div>
              <div className="ex-progress mt-2">
                <span style={{ width: `${c.progress}%` }} />
              </div>
              <Link href={c.id === 'dsa' ? '/dsa-arena' : '/learning'} className="ex-btn-primary mt-4">
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </PortalPageFrame>
  );
}
