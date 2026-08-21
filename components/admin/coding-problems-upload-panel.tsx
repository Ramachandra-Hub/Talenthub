'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import { CODING_UPLOAD_FORMAT_HINT } from '@/lib/exam-builder/parse-coding-upload';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';

export type CodingProblemsLanguage = 'c' | 'python' | 'java';

type Props = {
  initialProblems?: ProgrammingProblem[];
  initialDefaultLanguage?: CodingProblemsLanguage;
  /** When set, also syncs uploaded problems into ElevateX exam config. */
  requestId?: string | null;
  onProblemsChange?: (problems: ProgrammingProblem[]) => void;
  onDefaultLanguageChange?: (lang: CodingProblemsLanguage) => void;
  onSaved?: () => void;
  /** Compact layout for Questions tab */
  compact?: boolean;
  title?: string;
};

export function CodingProblemsUploadPanel({
  initialProblems = [],
  initialDefaultLanguage = 'c',
  requestId = null,
  onProblemsChange,
  onDefaultLanguageChange,
  onSaved,
  compact = false,
  title = 'C / Python / Java coding problems',
}: Props) {
  const [problems, setProblems] = useState(initialProblems);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefaultLanguage);
  const [uploading, setUploading] = useState(false);
  const [loadingBank, setLoadingBank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onProblemsChangeRef = useRef(onProblemsChange);
  onProblemsChangeRef.current = onProblemsChange;

  const syncProblems = useCallback((next: ProgrammingProblem[], notifyParent = false) => {
    setProblems(next);
    if (notifyParent) onProblemsChangeRef.current?.(next);
  }, []);

  const loadBank = useCallback(async (search?: string) => {
    setLoadingBank(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (search?.trim()) q.set('search', search.trim());
      q.set('language', 'all');
      const res = await fetchWithAuth(`/api/admin/coding-bank?${q.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        error?: string;
        problems?: ProgrammingProblem[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Could not load coding bank');
      setProblems(json.problems ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coding bank');
    } finally {
      setLoadingBank(false);
    }
  }, []);

  useEffect(() => {
    if (initialProblems.length) {
      setProblems(initialProblems);
    } else {
      void loadBank();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncElevateXConfig = async (mergedProblems: ProgrammingProblem[]) => {
    if (!requestId) return;
    const res = await fetchWithAuth('/api/admin/elevatex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_exam_config',
        requestId,
        programmingProblems: mergedProblems,
        programmingDefaultLanguage: defaultLanguage,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Could not sync ElevateX config');
  };

  const uploadPayload = async (payload: FormData) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    try {
      payload.append('defaultLanguage', defaultLanguage);
      const res = await fetchWithAuth('/api/admin/coding-bank', {
        method: 'POST',
        body: payload,
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        problems?: ProgrammingProblem[];
        inserted?: ProgrammingProblem[];
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');

      const bankProblems = json.problems ?? problems;
      syncProblems(bankProblems, true);
      setWarnings(json.warnings ?? []);

      if (requestId) {
        await syncElevateXConfig(bankProblems);
      }

      setSuccess(
        json.message ??
          `Added ${json.inserted?.length ?? 0} problem(s). Bank has ${bankProblems.length}.`,
      );
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
    onDefaultLanguageChange?.(defaultLanguage);
    if (!requestId) {
      setSuccess('Default language saved for new uploads.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await syncElevateXConfig(problems);
      setSuccess('Default language saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setUploading(false);
    }
  };

  const useBankInExam = async () => {
    if (!requestId) {
      setSuccess('Problems are in the bank. Publish ElevateX to include them in the exam.');
      syncProblems(problems, true);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await syncElevateXConfig(problems);
      setSuccess(`Linked ${problems.length} coding problem(s) to this ElevateX exam.`);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link to exam');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-slate-200 bg-white p-3 space-y-3'
          : 'rounded-xl border border-violet-200/70 bg-violet-50/30 p-4 space-y-4'
      }
    >
      <div>
        <h4 className={`font-semibold text-[#0c2340] ${compact ? 'text-sm' : ''}`}>{title}</h4>
        <p className="text-sm text-slate-600 mt-1">
          Paste short descriptions like <em>add two arrays</em> — test cases are created automatically.
          Problems are saved to the <strong>Questions</strong> bank and can be used in ElevateX.
        </p>
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}
      {warnings.length ? <StatusAlert variant="info">{warnings.join(' ')}</StatusAlert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Default language:</span>
        {(['c', 'python', 'java'] as const).map((lang) => (
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
            {lang === 'c' ? 'C' : lang === 'python' ? 'Python' : 'Java'}
          </button>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => void saveLanguage()}>
          Save default
        </Button>
        {requestId ? (
          <Button type="button" size="sm" disabled={uploading || !problems.length} onClick={() => void useBankInExam()}>
            Use bank in ElevateX ({problems.length})
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">Quick paste — one problem per line</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={compact ? 4 : 5}
            disabled={uploading}
            placeholder={'add two arrays\nsum of two numbers\nreverse a string'}
            className="w-full rounded border border-slate-200 p-2 text-sm font-mono"
            spellCheck={false}
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={uploading || !pasteText.trim()}
            onClick={() => void onPasteUpload()}
          >
            {uploading ? 'Generating…' : 'Add problems from paste'}
          </Button>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">Or upload file (.txt, .json, .csv, .pdf, .docx)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt,.pdf,.docx,text/plain,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={uploading}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <p className="text-[11px] text-slate-500 whitespace-pre-wrap">{CODING_UPLOAD_FORMAT_HINT}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={bankSearch}
          onChange={(e) => setBankSearch(e.target.value)}
          placeholder="Search bank…"
          className="text-sm border border-slate-200 rounded px-2 py-1 min-w-[160px]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loadingBank}
          onClick={() => void loadBank(bankSearch)}
        >
          {loadingBank ? 'Loading…' : 'Refresh bank'}
        </Button>
        <p className="text-sm text-slate-700">
          <strong>{problems.length}</strong> in bank
          {problems.length > 0 ? (
            <span className="text-slate-500">
              {' '}
              — {problems.slice(0, 3).map((p) => p.title).join(', ')}
              {problems.length > 3 ? '…' : ''}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
