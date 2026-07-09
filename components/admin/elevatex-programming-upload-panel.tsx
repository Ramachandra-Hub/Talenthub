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
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const syncProblems = (next: ProgrammingProblem[]) => {
    setProblems(next);
    onProblemsChange?.(next);
  };

  const uploadPayload = async (payload: FormData) => {
    if (!requestId) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    try {
      payload.append('requestId', requestId);
      payload.append('defaultLanguage', defaultLanguage);
      const res = await fetch('/api/admin/elevatex/coding-upload', {
        method: 'POST',
        body: payload,
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
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    await uploadPayload(form);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPasteUpload = async () => {
    if (!pasteText.trim()) return;
    const form = new FormData();
    form.append('pasteText', pasteText.trim());
    await uploadPayload(form);
    setPasteText('');
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
        <h4 className="font-semibold text-[#0c2340]">Programming section — C / Python coding exam</h4>
        <p className="text-sm text-slate-600 mt-1">
          This is a <strong>live coding exam</strong> (not MCQs). Paste short problem descriptions —
          e.g. <em>add two arrays</em> — and the system creates sample I/O and hidden test cases
          automatically. Enable the <strong>Programming</strong> section above. For C/Python language
          MCQs, use Aptitude or department technical MCQs separately.
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

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">Quick paste — one problem per line</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            disabled={!requestId || uploading}
            placeholder={'add two arrays\nsum of two numbers\nreverse a string'}
            className="w-full rounded border border-slate-200 p-2 text-sm font-mono"
            spellCheck={false}
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={!requestId || uploading || !pasteText.trim()}
            onClick={() => void onPasteUpload()}
          >
            {uploading ? 'Generating…' : 'Add problems from paste'}
          </Button>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">Or upload file (.txt, .json, .csv)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt,text/plain,application/json,text/csv"
            disabled={!requestId || uploading}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
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
