'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import { Badge } from '@/components/ui/badge';
import { McqUploadFormatGuide } from '@/components/exam-builder/mcq-upload-format-guide';

const SAMPLE_CSV = `question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
"What is 15% of 200?","15","20","30","45","C","15% of 200 = 30"
"Which data structure is LIFO?","Queue","Stack","Array","Graph","B","Stack is last-in-first-out"`;

type BankStatus = {
  ok?: boolean;
  tableMissing?: boolean;
  questionsTotal?: number;
  curatedBankCount?: number;
  tagCount?: number;
  hint?: string | null;
  sqlEditorUrl?: string | null;
  postgresConfigured?: boolean;
};

type QuestionBankUploadPanelProps = {
  tagIds: string[];
  syllabusRequired?: boolean;
  className?: string;
  /** Call after seed/upload so syllabus counts refresh. */
  onBankUpdated?: () => void;
};

export function QuestionBankUploadPanel({
  tagIds,
  syllabusRequired = true,
  className = '',
  onBankUpdated,
}: QuestionBankUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [copyingSql, setCopyingSql] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [bankStatus, setBankStatus] = useState<BankStatus | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/exam-builder/bank-status');
    if (res.ok) {
      setBankStatus((await res.json()) as BankStatus);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const authHeaders = async (): Promise<Record<string, string>> => ({
    'Content-Type': 'application/json',
  });

  const copyBootstrapSql = async () => {
    setError(null);
    setInfo(null);
    setCopyingSql(true);
    try {
      const res = await fetch('/api/exam-builder/bootstrap-sql', {
        headers: await authHeaders(),
      });
      const json = (await res.json()) as { sql?: string; sqlEditorUrl?: string; error?: string };
      if (!res.ok || !json.sql) throw new Error(json.error ?? 'Could not load bootstrap SQL');
      await navigator.clipboard.writeText(json.sql);
      setInfo(
        `Bootstrap SQL copied (${json.sql.length.toLocaleString()} chars). Open AWS RDS SQL editor, paste, Run, wait 30s, then Load topic bank.${
          json.sqlEditorUrl ? '' : ''
        }`,
      );
      if (json.sqlEditorUrl) {
        window.open(json.sqlEditorUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed');
    } finally {
      setCopyingSql(false);
    }
  };

  const setupSchema = async () => {
    setError(null);
    setInfo(null);
    setSettingUp(true);
    try {
      const res = await fetch('/api/exam-builder/ensure-schema', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        hint?: string;
        sqlEditorUrl?: string;
      };
      if (!res.ok) {
        const short =
          json.error === 'Database connection not configured'
            ? 'Database password not in .env.local — use Copy bootstrap SQL instead (button below).'
            : [json.error, json.hint].filter(Boolean).join(' ');
        throw new Error(short || 'Could not set up question bank tables');
      }
      setInfo(json.message ?? 'Tables ready.');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSettingUp(false);
    }
  };

  const seedTopicBank = async () => {
    setError(null);
    setInfo(null);
    setSeeding(true);
    try {
      const res = await fetch('/api/exam-builder/seed-bank', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ questionsPerTopic: 150, replaceExisting: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        questionsInserted?: number;
        error?: string;
        hint?: string;
        sqlEditorUrl?: string;
        warnings?: string[];
      };
      if (!res.ok) {
        const parts = [json.error, json.hint].filter(Boolean).join(' ');
        throw new Error(parts || 'Could not load topic bank');
      }
      setInfo(
        `${json.message ?? `Loaded ${json.questionsInserted ?? 0} MCQs.`} ${(json.warnings ?? []).join(' ')}`.trim(),
      );
      await loadStatus();
      onBankUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const canUpload = !syllabusRequired || tagIds.length > 0;
  const busy = uploading || seeding || settingUp || copyingSql;

  const runUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tagIds', JSON.stringify(tagIds));

      const res = await fetch('/api/exam-builder/bank-upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = (await res.json()) as {
        inserted?: number;
        warnings?: string[];
        error?: string;
        formatHint?: string;
        textPreview?: string;
        charsExtracted?: number;
      };
      if (!res.ok) {
        const parts = [
          json.error,
          json.warnings?.join(' '),
          json.charsExtracted != null ? `Read ${json.charsExtracted} chars.` : null,
        ].filter(Boolean);
        throw new Error(parts.join(' ') || 'Upload failed');
      }

      setInfo(`Saved ${json.inserted ?? 0} question(s). ${(json.warnings ?? []).join(' ')}`.trim());
      await loadStatus();
      onBankUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-5 space-y-4 lux-surface ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[#0c2340]">Question bank</h3>
          <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
            Step 1: <strong>Load topic question bank</strong> (placement-style MCQs per syllabus unit). Step 2: select
            topics → <strong>Draw from bank</strong> to build your test.
          </p>
        </div>
        <Badge tone="brand">Topic-wise</Badge>
      </div>

      {bankStatus ? (
        <p className="text-[11px] text-slate-600 rounded-lg bg-slate-100/80 px-3 py-2">
          Bank status:{' '}
          <strong>{bankStatus.questionsTotal ?? 0}</strong> total MCQs ·{' '}
          <strong>{bankStatus.curatedBankCount ?? 0}</strong> curated ·{' '}
          <strong>{bankStatus.tagCount ?? 0}</strong> syllabus tags
          {bankStatus.tableMissing ? (
            <span className="block text-amber-900 mt-1">
              Tables not set up — click <strong>Copy bootstrap SQL</strong>, paste in{' '}
              {bankStatus.sqlEditorUrl ? (
                <a
                  href={bankStatus.sqlEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  AWS RDS SQL editor
                </a>
              ) : (
                'AWS RDS SQL editor'
              )}
              , Run, wait 30s, then <strong>Load topic question bank</strong>.
              {bankStatus.postgresConfigured ? (
                <> Or use <strong>Setup question bank tables</strong> (password configured).</>
              ) : null}
            </span>
          ) : null}
          {bankStatus.hint && !bankStatus.tableMissing ? (
            <span className="block text-slate-500 mt-1">{bankStatus.hint}</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        {bankStatus?.tableMissing ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void copyBootstrapSql()}
              className="border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
            >
              {copyingSql ? 'Copying…' : 'Copy bootstrap SQL'}
            </Button>
            {bankStatus.postgresConfigured ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void setupSchema()}
                className="border-slate-300"
              >
                {settingUp ? 'Setting up…' : 'Setup question bank tables'}
              </Button>
            ) : null}
          </>
        ) : null}

        <Button
          type="button"
          disabled={busy}
          onClick={() => void seedTopicBank()}
          className="bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white"
        >
          {seeding ? 'Loading bank…' : 'Load topic question bank'}
        </Button>

        <div
          className={`relative inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent/10 ${
            busy || !canUpload ? 'pointer-events-none cursor-not-allowed opacity-50' : ''
          }`}
        >
          <input
            type="file"
            aria-label="Upload questions file"
            accept=".csv,.pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv"
            disabled={busy || !canUpload}
            onChange={(ev) => void runUpload(ev)}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span className="pointer-events-none select-none" aria-hidden="true">
            {uploading ? 'Uploading…' : 'Upload CSV / PDF / Word'}
          </span>
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={() => setShowSample((s) => !s)}>
          {showSample ? 'Hide' : 'Show'} CSV sample
        </Button>
      </div>

      {!canUpload ? (
        <StatusAlert variant="info" className="border-amber-200 bg-amber-50 text-amber-950">
          For file upload, select syllabus topics first. Or use <strong>Load topic question bank</strong> above (loads all
          syllabus units at once).
        </StatusAlert>
      ) : null}

      <McqUploadFormatGuide />

      {showSample ? (
        <pre className="text-[11px] leading-relaxed rounded-lg bg-slate-900 text-slate-100 p-3 overflow-x-auto max-h-40 overflow-y-auto">
          {SAMPLE_CSV}
        </pre>
      ) : null}

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {info ? <StatusAlert variant="info">{info}</StatusAlert> : null}
    </div>
  );
}
