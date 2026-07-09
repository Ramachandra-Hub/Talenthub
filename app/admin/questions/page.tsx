'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { fetchAdminCategories } from '@/lib/fetch-admin-categories';
import type { CategoryOption } from '@/lib/ai-generator-config';
import { cn } from '@/lib/utils';
import type {
  QuestionBankOverview,
  QuestionBankRow,
  QuestionBankSectionKey,
} from '@/lib/admin/question-bank-catalog';
import { downloadQuestionBankPdf } from '@/lib/admin/export-question-bank-pdf';
import { downloadQuestionBankWord } from '@/lib/admin/export-question-bank-word';
import {
  downloadAllTopicBanksZip,
  downloadSingleTopicExport,
  type BulkExportFormat,
} from '@/lib/admin/bulk-export-question-bank';
import {
  fetchFullQuestionBankExport,
  fetchTopicQuestionBankExport,
} from '@/lib/admin/fetch-question-bank-export';
import { CodingProblemsUploadPanel } from '@/components/admin/coding-problems-upload-panel';
import { parseStoredCodingProblem } from '@/lib/coding/coding-bank-persist';

type TopicPayload = {
  topic: { id: string; slug: string; name: string };
  total: number;
  questions: QuestionBankRow[];
};

export default function QuestionsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<QuestionBankOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<QuestionBankSectionKey | ''>('');
  const [selectedTopicSlug, setSelectedTopicSlug] = useState('');
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicPayload, setTopicPayload] = useState<TopicPayload | null>(null);
  const [topicOffset, setTopicOffset] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [rdsEnvMissing, setDbEnvMissing] = useState(false);

  const [showManage, setShowManage] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryWarning, setCategoryWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState<'topic' | 'full' | null>(null);
  const [pdfTopicSelect, setPdfTopicSelect] = useState('');
  const [seedingBank, setSeedingBank] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    question_text: '',
    category_id: '',
    difficulty: 'medium',
    type: 'MCQ',
    options: '',
    correct_answer: '',
    explanation: '',
  });

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    const res = await fetchWithAuth('/api/admin/question-bank', { cache: 'no-store' });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        throw new Error('Session expired. Sign in again at Admin Login.');
      }
      if (res.status === 504) {
        throw new Error(
          'Question bank timed out (server busy). Refresh the page — if it persists, open one topic at a time instead of full export.',
        );
      }
      throw new Error(json.error ?? 'Could not load question bank');
    }
    const data = (await res.json()) as QuestionBankOverview;
    setOverview(data);
    if (data.sections.length > 0) {
      setSelectedSection((prev) => prev || data.sections[0]!.key);
      setSelectedTopicSlug((prev) => prev || data.sections[0]!.topics[0]?.slug || '');
    }
  }, []);

  const loadTopic = useCallback(
    async (slug: string, offset: number) => {
      if (!slug) return;
      setTopicLoading(true);
      try {
        const q = new URLSearchParams({
          topicSlug: slug,
          offset: String(offset),
          limit: '50',
        });
        const res = await fetchWithAuth(`/api/admin/question-bank?${q.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? 'Could not load topic questions');
        }
        setTopicPayload((await res.json()) as TopicPayload);
        setTopicOffset(offset);
      } catch (err) {
        setTopicPayload(null);
        alert(err instanceof Error ? err.message : 'Load failed');
      } finally {
        setTopicLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const init = async () => {
      try {
        const { categories: categoryList, warning } = await fetchAdminCategories();
        setCategories(categoryList);
        if (warning) setCategoryWarning(warning);
        await loadOverview();
      } catch (err) {
        setOverviewError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedTopicSlug) void loadTopic(selectedTopicSlug, 0);
  }, [selectedTopicSlug, loadTopic]);

  const allTopicsFlat = useMemo(() => {
    if (!overview) return [];
    return overview.sections.flatMap((section) =>
      section.topics.map((topic) => ({
        ...topic,
        sectionName: section.name,
      })),
    );
  }, [overview]);

  useEffect(() => {
    if (selectedTopicSlug) setPdfTopicSelect(selectedTopicSlug);
  }, [selectedTopicSlug]);

  const isCodingTopic =
    selectedTopicSlug === 'coding-problems' ||
    selectedTopicSlug === 'coding-c' ||
    selectedTopicSlug === 'coding-python' ||
    selectedTopicSlug.startsWith('coding-');
  const activeSection = overview?.sections.find((s) => s.key === selectedSection);
  const filteredTopics =
    activeSection?.topics.filter((t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()),
    ) ?? [];

  const filteredQuestions =
    topicPayload?.questions.filter((q) =>
      q.question_text.toLowerCase().includes(searchTerm.toLowerCase()),
    ) ?? [];

  const selectTopic = (sectionKey: QuestionBankSectionKey, slug: string) => {
    setSelectedSection(sectionKey);
    setSelectedTopicSlug(slug);
  };

  const downloadTopicCsv = () => {
    if (!selectedTopicSlug) return;
    window.open(
      `/api/admin/question-bank?topicSlug=${encodeURIComponent(selectedTopicSlug)}&export=csv`,
      '_blank',
    );
  };

  const downloadFullBankCsv = () => {
    window.open('/api/admin/question-bank?export=csv&all=1', '_blank');
  };

  const downloadTopicPdfForSlug = async (slug: string, topicName?: string) => {
    if (!slug) return;
    setPdfDownloading('topic');
    try {
      const rows = await fetchTopicQuestionBankExport(slug);
      const label =
        topicName ??
        allTopicsFlat.find((t) => t.slug === slug)?.name ??
        topicPayload?.topic?.name ??
        slug;
      downloadQuestionBankPdf({
        title: `Question bank — ${label}`,
        subtitle: `${rows.length} MCQs with options, answers, and explanations (IST export)`,
        rows,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfDownloading(null);
    }
  };

  const downloadTopicPdf = async () => {
    const slug = pdfTopicSelect || selectedTopicSlug;
    if (!slug) return;
    await downloadTopicPdfForSlug(slug);
  };

  const downloadTopicDoc = async (slug: string, topicName?: string) => {
    if (!slug) return;
    setPdfDownloading('topic');
    try {
      await downloadSingleTopicExport(
        slug,
        topicName ??
          allTopicsFlat.find((t) => t.slug === slug)?.name ??
          topicPayload?.topic?.name ??
          slug,
        'doc',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Word download failed');
    } finally {
      setPdfDownloading(null);
    }
  };

  const downloadTopicFile = async (
    slug: string,
    topicName: string,
    format: BulkExportFormat,
    event?: React.MouseEvent,
  ) => {
    event?.stopPropagation();
    if (!slug) return;
    setPdfDownloading('topic');
    try {
      await downloadSingleTopicExport(slug, topicName, format);
    } catch (err) {
      alert(err instanceof Error ? err.message : `${format.toUpperCase()} download failed`);
    } finally {
      setPdfDownloading(null);
    }
  };

  const seedSyllabusQuestionBank = async () => {
    if (
      !window.confirm(
        'Load ~150 unique MCQs per syllabus topic into the bank? This replaces previous curated-bank-v2 questions and may take a few minutes.',
      )
    ) {
      return;
    }
    setSeedingBank(true);
    setSeedMessage(null);
    try {
      const res = await fetchWithAuth('/api/exam-builder/seed-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionsPerTopic: 150, replaceExisting: true }),
      });
      const json = (await res.json()) as {
        message?: string;
        questionsInserted?: number;
        error?: string;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? 'Could not seed question bank');
      setSeedMessage(
        `${json.message ?? `Inserted ${json.questionsInserted ?? 0} questions.`} ${(json.warnings ?? []).join(' ')}`.trim(),
      );
      await loadOverview();
      if (selectedTopicSlug) await loadTopic(selectedTopicSlug, 0);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeedingBank(false);
    }
  };

  const downloadFullBankPdf = async () => {
    setPdfDownloading('full');
    try {
      const rows = await fetchFullQuestionBankExport();
      downloadQuestionBankPdf({
        title: 'Question bank — full export',
        subtitle: `${rows.length} MCQs across all sections and topics`,
        rows,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfDownloading(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',').map((h) => h.trim());
      const newQuestions: Record<string, unknown>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const questionObj: Record<string, string> = {};
        headers.forEach((header, index) => {
          questionObj[header] = values[index] ?? '';
        });
        if (questionObj.question_text && questionObj.correct_answer) {
          newQuestions.push({
            question_text: questionObj.question_text,
            category_id: questionObj.category_id || categories[0]?.id,
            difficulty: questionObj.difficulty || 'medium',
            type: questionObj.type || 'MCQ',
            options: questionObj.options ? JSON.parse(questionObj.options) : null,
            correct_answer: questionObj.correct_answer,
            explanation: questionObj.explanation || null,
            tags: questionObj.tags ? JSON.parse(questionObj.tags) : null,
          });
        }
      }
      if (newQuestions.length > 0) {
        const res = await fetchWithAuth('/api/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: newQuestions }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? 'Import failed');
        }
        alert(`${newQuestions.length} questions imported`);
        await loadOverview();
        if (selectedTopicSlug) await loadTopic(selectedTopicSlug, topicOffset);
      }
    } catch {
      alert('Error importing questions');
    } finally {
      setUploading(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Could not add question');
      }
      setShowAddForm(false);
      await loadOverview();
      if (selectedTopicSlug) await loadTopic(selectedTopicSlug, 0);
      alert('Question added');
    } catch {
      alert('Error adding question');
    }
  };

  const fixCLanguageTopicLinks = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillTagLinks: true, tagSlug: 'technical-c-language' }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; count?: number };
      if (!res.ok) throw new Error(json.error ?? 'Could not repair C Language topic links');
      await loadOverview();
      if (selectedTopicSlug) await loadTopic(selectedTopicSlug, topicOffset);
      alert(`C Language topic links repaired for ${json.count ?? 0} question(s).`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Topic-link repair failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-600 animate-pulse">Loading question bank…</p>
      </div>
    );
  }

  if (rdsEnvMissing) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] px-4">
        <p className="text-gray-600 text-center max-w-lg">{'Configure AUTH_SECRET and DATABASE_URL'}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#0c2340]">Question bank</h2>
          <p className="text-sm text-gray-600 mt-1">
            Syllabus-wise MCQ bank plus <strong>C / Python coding problems</strong> — download per topic
            as PDF, Word (.doc), or CSV. Paste coding problems under Add / import.
          </p>
          {overview ? (
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-semibold text-[#1e3a5f]">{overview.total_questions}</span>{' '}
              questions · <span className="font-semibold">{overview.total_topics}</span> topics ·{' '}
              <span className="font-semibold">{overview.sections.length}</span> sections
            </p>
          ) : null}
          {overviewError ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
              {overviewError}
            </p>
          ) : null}
          {categoryWarning ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              {categoryWarning}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href="/admin/exam-builder">Exam builder</Link>
          </Button>
          <Button variant="outline" onClick={() => setShowManage((v) => !v)}>
            {showManage ? 'Hide MCQ add/import' : 'Add MCQ / import CSV'}
          </Button>
          <Button variant="outline" onClick={() => void fixCLanguageTopicLinks()}>
            Fix C-language topic links
          </Button>
          <Button
            className="bg-[#0c2340] hover:bg-[#16304f]"
            onClick={downloadFullBankCsv}
            disabled={!overview?.total_questions}
          >
            Full bank (CSV)
          </Button>
          <Button
            variant="outline"
            onClick={() => void downloadFullBankPdf()}
            disabled={!overview?.total_questions || pdfDownloading !== null}
          >
            {pdfDownloading === 'full' ? 'Preparing PDF…' : 'Full bank (PDF)'}
          </Button>
          <Button
            variant="outline"
            disabled={!selectedTopicSlug}
            onClick={downloadTopicCsv}
          >
            Topic (CSV)
          </Button>
          <Button
            variant="outline"
            disabled={!selectedTopicSlug || pdfDownloading !== null}
            onClick={() => void downloadTopicPdf()}
          >
            {pdfDownloading === 'topic' ? 'Preparing PDF…' : 'Topic (PDF)'}
          </Button>
        </div>
      </div>

      <Card className="p-4 mb-6 border-violet-200/80 bg-violet-50/40">
        <CodingProblemsUploadPanel
          compact
          title="Coding problems (C / Python)"
          onSaved={() => {
            void loadOverview();
            if (selectedTopicSlug) void loadTopic(selectedTopicSlug, 0);
          }}
        />
      </Card>

      <Card className="p-4 mb-6 border-[#0c2340]/15 bg-slate-50/60">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
              Topic-wise documents
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              One file per topic with all questions, options, correct answers, and explanations. Or
              download every topic in a single ZIP (PDF, Word, or CSV).
            </p>
            <label className="block mt-3 text-xs font-medium text-gray-700" htmlFor="pdf-topic-select">
              Topic
            </label>
            <select
              id="pdf-topic-select"
              value={pdfTopicSelect}
              onChange={(e) => {
                const slug = e.target.value;
                setPdfTopicSelect(slug);
                const hit = allTopicsFlat.find((t) => t.slug === slug);
                if (hit) {
                  const section = overview?.sections.find((s) =>
                    s.topics.some((t) => t.slug === slug),
                  );
                  if (section) selectTopic(section.key, slug);
                }
              }}
              className="mt-1 w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a topic…</option>
              {overview?.sections.map((section) => (
                <optgroup key={section.key} label={section.name}>
                  {section.topics.map((topic) => (
                    <option key={topic.slug} value={topic.slug}>
                      {topic.name} ({topic.question_count} questions)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              className="bg-[#0c2340] hover:bg-[#16304f]"
              disabled={!pdfTopicSelect || pdfDownloading !== null}
              onClick={() => void downloadTopicPdf()}
            >
              {pdfDownloading === 'topic' ? 'Preparing PDF…' : 'Download topic PDF'}
            </Button>
            <Button
              variant="outline"
              disabled={seedingBank || !overview}
              onClick={() => void seedSyllabusQuestionBank()}
            >
              {seedingBank ? 'Seeding bank…' : 'Load 150 MCQs / topic'}
            </Button>
          </div>
        </div>
        {seedMessage ? (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">
            {seedMessage}
          </p>
        ) : null}
      </Card>

      {showManage ? (
        <Card className="p-4 mb-6 border-blue-100 bg-blue-50/40 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel MCQ' : 'Add MCQ'}
            </Button>
            <label>
              <Button size="sm" variant="outline" className="cursor-pointer" asChild>
                <span>Import MCQ CSV</span>
              </Button>
              <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} className="hidden" />
            </label>
          </div>

          {showAddForm ? (
            <form onSubmit={handleAddQuestion} className="space-y-3 text-sm">
              <textarea
                value={formData.question_text}
                onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                placeholder="Question text"
                required
                className="w-full border rounded-lg p-2 min-h-20"
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="border rounded-lg p-2"
                >
                  <option value="">Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={formData.options}
                  onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                  placeholder="Options A|B|C|D"
                />
              </div>
              <Input
                value={formData.correct_answer}
                onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                placeholder="Correct answer (A/B/C/D)"
                required
              />
              <Button type="submit" size="sm">
                Save to bank
                {selectedTopicSlug && selectedTopicSlug !== 'uncategorized'
                  ? ` (tag: ${selectedTopicSlug})`
                  : ''}
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-[280px_1fr] gap-4 min-h-[480px]">
        <Card className="p-3 overflow-hidden flex flex-col max-h-[min(70vh,720px)]">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 px-2 mb-2">
            Sections & topics
          </p>
          <Input
            placeholder="Filter topics…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mb-2 text-sm"
          />
          <div className="overflow-y-auto flex-1 space-y-3 pr-1">
            {overview?.sections.map((section) => (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSection(section.key);
                    if (section.topics[0]) setSelectedTopicSlug(section.topics[0].slug);
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-lg text-sm font-semibold',
                    selectedSection === section.key
                      ? 'bg-[#0c2340] text-white'
                      : 'text-[#0c2340] hover:bg-gray-100',
                  )}
                >
                  {section.name}
                  <span className="ml-1 opacity-80">({section.question_count})</span>
                </button>
                {selectedSection === section.key ? (
                  <ul className="mt-1 space-y-0.5 pl-1">
                    {filteredTopics.map((topic) => (
                      <li key={topic.slug} className="group">
                        <div
                          className={cn(
                            'flex items-center gap-1 rounded',
                            selectedTopicSlug === topic.slug
                              ? 'bg-blue-100'
                              : 'hover:bg-gray-50',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => selectTopic(section.key, topic.slug)}
                            className={cn(
                              'flex-1 min-w-0 text-left px-2 py-1.5 text-xs sm:text-sm truncate',
                              selectedTopicSlug === topic.slug
                                ? 'text-blue-900 font-medium'
                                : 'text-gray-700',
                            )}
                          >
                            {topic.name}
                            <Badge tone="neutral" className="ml-1 text-[10px]">
                              {topic.question_count}
                            </Badge>
                          </button>
                          {topic.question_count > 0 ? (
                            <span className="flex shrink-0 gap-0.5 pr-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                              <button
                                type="button"
                                title="Download PDF"
                                disabled={pdfDownloading !== null}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                                onClick={(e) =>
                                  void downloadTopicFile(topic.slug, topic.name, 'pdf', e)
                                }
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                title="Download Word"
                                disabled={pdfDownloading !== null}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100"
                                onClick={(e) =>
                                  void downloadTopicFile(topic.slug, topic.name, 'doc', e)
                                }
                              >
                                DOC
                              </button>
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 flex flex-col min-h-[400px]">
          {topicLoading ? (
            <p className="text-sm text-gray-500 animate-pulse">Loading questions…</p>
          ) : !topicPayload?.topic ? (
            <p className="text-sm text-gray-500">Select a topic to view questions.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b pb-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#0c2340]">{topicPayload.topic.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">{topicPayload.topic.slug}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-gray-600">
                    Showing {topicOffset + 1}–{topicOffset + filteredQuestions.length} of{' '}
                    {topicPayload.total}
                  </p>
                  {topicPayload.total > 0 ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pdfDownloading !== null}
                        onClick={() => void downloadTopicPdfForSlug(topicPayload.topic.slug, topicPayload.topic.name)}
                      >
                        PDF ({topicPayload.total})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pdfDownloading !== null}
                        onClick={() => void downloadTopicDoc(topicPayload.topic.slug, topicPayload.topic.name)}
                      >
                        Word
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pdfDownloading !== null}
                        onClick={() =>
                          void downloadTopicFile(topicPayload.topic.slug, topicPayload.topic.name, 'csv')
                        }
                      >
                        CSV
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {filteredQuestions.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  {isCodingTopic
                    ? 'No coding problems yet. Use Add / import above to paste problems like “add two arrays”.'
                    : 'No questions in this topic. Upload MCQs in Exam builder or use Add / import.'}
                </p>
              ) : (
                <ul className="space-y-3 overflow-y-auto flex-1 pr-1">
                  {filteredQuestions.map((q, idx) => {
                    const storedCoding = parseStoredCodingProblem(q.explanation);
                    if (q.type === 'CODING' || storedCoding) {
                      const problem = storedCoding?.problem;
                      return (
                        <li
                          key={q.id}
                          className="rounded-lg border border-violet-200 p-3 hover:border-violet-300 bg-violet-50/30"
                        >
                          <p className="text-xs text-violet-700 mb-1 font-semibold uppercase tracking-wide">
                            #{topicOffset + idx + 1} · Coding · {storedCoding?.defaultLanguage?.toUpperCase() ?? 'C/Python'}
                          </p>
                          <p className="text-sm text-gray-900 font-semibold">
                            {problem?.title ?? 'Coding problem'}
                          </p>
                          <p className="text-sm text-gray-700 mt-1">{problem?.statement ?? q.question_text}</p>
                          {problem ? (
                            <div className="grid sm:grid-cols-2 gap-2 mt-2 text-xs">
                              <div>
                                <p className="font-semibold text-gray-600">Sample input</p>
                                <pre className="bg-white border rounded p-2 mt-1 whitespace-pre-wrap font-mono">
                                  {problem.sampleInput}
                                </pre>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-600">Expected output</p>
                                <pre className="bg-white border rounded p-2 mt-1 whitespace-pre-wrap font-mono">
                                  {problem.sampleOutput}
                                </pre>
                              </div>
                            </div>
                          ) : null}
                          {problem?.testCases?.length ? (
                            <p className="text-xs text-gray-500 mt-2">
                              {problem.testCases.length} test case(s) for grading
                            </p>
                          ) : null}
                        </li>
                      );
                    }

                    const letters = ['A', 'B', 'C', 'D'] as const;
                    const fromColumns = letters
                      .map((L) => {
                        const text =
                          L === 'A'
                            ? q.option_a
                            : L === 'B'
                              ? q.option_b
                              : L === 'C'
                                ? q.option_c
                                : q.option_d;
                        return text ? `${L}: ${text}` : null;
                      })
                      .filter(Boolean) as string[];
                    const fromArray =
                      fromColumns.length === 0 && q.options?.length
                        ? q.options.map((text, i) => `${letters[i] ?? i + 1}: ${text}`)
                        : [];
                    const opts = fromColumns.length > 0 ? fromColumns : fromArray;
                    return (
                      <li
                        key={q.id}
                        className="rounded-lg border border-gray-200 p-3 hover:border-blue-200 bg-white"
                      >
                        <p className="text-xs text-gray-400 mb-1">
                          #{topicOffset + idx + 1} · {q.difficulty} · {q.type}
                        </p>
                        <p className="text-sm text-gray-900 font-medium">{q.question_text}</p>
                        {opts.length > 0 ? (
                          <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                            {opts.map((line) => (
                              <li
                                key={line}
                                className={cn(
                                  line?.startsWith(`${q.correct_answer}:`) &&
                                    'font-semibold text-green-800',
                                )}
                              >
                                {line}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="text-xs text-gray-500 mt-2">
                          Answer: <span className="font-semibold text-green-800">{q.correct_answer}</span>
                        </p>
                        {q.explanation ? (
                          <p className="text-xs text-gray-600 mt-1 border-t pt-2">
                            <span className="font-semibold">Explanation:</span> {q.explanation}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {topicPayload.total > 50 ? (
                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={topicOffset <= 0}
                    onClick={() => void loadTopic(selectedTopicSlug, Math.max(0, topicOffset - 50))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={topicOffset + 50 >= topicPayload.total}
                    onClick={() => void loadTopic(selectedTopicSlug, topicOffset + 50)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        ElevateX uses a separate in-app question engine (technical, aptitude, psychometric, etc.) — not
        listed here. Department exams and RMSET draw from this bank by topic tags.
      </p>
    </div>
  );
}
