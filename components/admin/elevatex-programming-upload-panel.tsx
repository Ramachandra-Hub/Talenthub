'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import { CODING_UPLOAD_FORMAT_HINT } from '@/lib/exam-builder/parse-coding-upload';
import type { ElevateXProgrammingLanguage } from '@/lib/placement/elevatex-exam-config';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';

type Props = {
  requestId: string | null;
  initialProblems: ProgrammingProblem[];
  initialDefaultLanguage: ElevateXProgrammingLanguage;
  onProblemsChange?: (problems: ProgrammingProblem[]) => void;
  onDefaultLanguageChange?: (lang: ElevateXProgrammingLanguage) => void;
  onSaved?: () => void;
};

export function ElevateXProgrammingUploadPanel({
  requestId,
  initialProblems,
  initialDefaultLanguage,
  onProblemsChange,
  onDefaultLanguageChange,
  onSaved,
}: Props) {
  const [problems, setProblems] = useState(initialProblems);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefaultLanguage);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncProblems = (next: ProgrammingProblem[]) => {
    setProblems(next);
    onProblemsChange?.(next);
  };

  const onFile = async (file: File | null) => {
    if (!file || !requestId) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('requestId', requestId);
      form.append('defaultLanguage', defaultLanguage);
      const res = await fetch('/api/admin/elevatex/coding-upload', {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        problems?: ProgrammingProblem[];
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const merged = json.problems ?? problems;
      syncProblems(merged);
      setWarnings(json.warnings ?? []);
      setSuccess(json.message ?? `Uploaded ${merged.length} programming problem(s).`);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveLanguage = async () => {
    if (!requestId) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_exam_config',
          requestId,
          programmingDefaultLanguage: defaultLanguage,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onDefaultLanguageChange?.(defaultLanguage);
      setSuccess(json.message ?? 'Default language saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200/70 bg-violet-50/30 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-[#0c2340]">Programming section — C / Python bulk upload</h4>
        <p className="text-sm text-slate-600 mt-1">
          Upload coding problems (JSON or CSV). Enable the <strong>Programming</strong> section above
          to include them in ElevateX. Students compile in C or Python in the browser.
        </p>
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}
      {warnings.length ? (
        <StatusAlert variant="info">{warnings.join(' ')}</StatusAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Default language:</span>
        {(['c', 'python'] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => {
              setDefaultLanguage(lang);
              onDefaultLanguageChange?.(lang);
            }}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              defaultLanguage === lang
                ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {lang === 'c' ? 'C' : 'Python'}
          </button>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={!requestId || uploading} onClick={() => void saveLanguage()}>
          Save default
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          disabled={!requestId || uploading}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-[11px] text-slate-500 whitespace-pre-wrap">{CODING_UPLOAD_FORMAT_HINT}</p>
      </div>

      <p className="text-sm text-slate-700">
        <strong>{problems.length}</strong> problem(s) in bank
        {problems.length > 0 ? (
          <span className="text-slate-500">
            {' '}
            — e.g. {problems.slice(0, 3).map((p) => p.title).join(', ')}
            {problems.length > 3 ? '…' : ''}
          </span>
        ) : null}
      </p>
    </div>
  );
}
