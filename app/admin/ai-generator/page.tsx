'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseMcqsFromAiText } from '@/lib/ai/parse-mcq-response';
import {
  categorySlugFromValue,
  DEFAULT_CATEGORY_OPTIONS,
  EXAM_CONTENT_TYPES,
  type CategoryOption,
  type ExamContentType,
  isResolvableCategoryValue,
  topicPlaceholder,
  TOPIC_SUGGESTIONS,
} from '@/lib/ai-generator-config';

const selectClassName =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20';

export default function AdminAiGeneratorPage() {
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORY_OPTIONS);
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_OPTIONS[0]?.id ?? '');
  const [examType, setExamType] = useState<ExamContentType>('mcq');
  const [topic, setTopic] = useState(topicPlaceholder('quantitative', 'mcq'));
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [raw, setRaw] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const selectedSlug = categorySlugFromValue(categoryId);

  const topicSuggestions = useMemo(() => TOPIC_SUGGESTIONS[selectedSlug] ?? [], [selectedSlug]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/categories', { credentials: 'include' });
        const json = (await res.json()) as {
          categories?: CategoryOption[];
          warning?: string;
          error?: string;
        };

        if (res.ok && json.categories?.length) {
          setCategories(json.categories);
          const first = json.categories[0];
          setCategoryId(first.id);
          setTopic(topicPlaceholder(first.slug, examType));
          if (json.warning) setLoadWarning(json.warning);
        } else if (!res.ok) {
          setLoadWarning(json.error ?? 'Using built-in categories. Run POST /api/setup/seed for database sync.');
        }
      } catch {
        setLoadWarning('Could not reach server. Using built-in category list.');
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onExamTypeChange = (value: ExamContentType) => {
    setExamType(value);
    if (value === 'programming') {
      const coding =
        categories.find((c) => c.slug === 'coding') ??
        DEFAULT_CATEGORY_OPTIONS.find((c) => c.slug === 'coding');
      if (coding) {
        setCategoryId(coding.id);
        setTopic(topicPlaceholder('coding', 'programming'));
        return;
      }
    }
    if (selectedCategory) {
      setTopic(topicPlaceholder(selectedCategory.slug, value));
    }
  };

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    setTopic(topicPlaceholder(cat?.slug ?? categorySlugFromValue(id), examType));
  };

  const resolveCategoryIdForImport = async (): Promise<string | null> => {
    if (isResolvableCategoryValue(categoryId)) return categoryId;
    const slug = categorySlugFromValue(categoryId);
    const res = await fetch(`/api/admin/categories/resolve?slug=${encodeURIComponent(slug)}`, {
      credentials: 'include',
    });
    const json = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !json.id) {
      setMessage(json.error ?? 'Run POST /api/setup/seed to create categories in AWS RDS before import.');
      return null;
    }
    return json.id;
  };

  const generate = async () => {
    if (!categoryId) {
      setMessage('Please select a category first.');
      return;
    }
    if (!topic.trim()) {
      setMessage('Please enter a topic for the exam.');
      return;
    }

    setGenerating(true);
    setMessage(null);
    setRaw('');

    const categoryName = selectedCategory?.name ?? 'General';
    const isProgramming = examType === 'programming';

    const prompt = isProgramming
      ? `Generate exactly ${count} programming exam problems for college placement.
Category: ${categoryName}
Topic: ${topic.trim()}
Difficulty: ${difficulty}
Each problem should be solvable in 15–30 minutes.
Return ONLY a JSON array. Each item:
{
  "question_text": "clear problem statement with constraints",
  "options": ["Sample input/output hint A","Hint B","Hint C","Hint D"],
  "correct_answer": "A",
  "explanation": "brief solution approach",
  "difficulty": "${difficulty}",
  "tags": ["programming", "${topic.trim()}"]
}`
      : `Generate exactly ${count} multiple-choice questions for campus placement.
Category: ${categoryName}
Topic: ${topic.trim()}
Difficulty: ${difficulty}
Return ONLY a JSON array. Each item:
{ "question_text": "...", "options": ["A text","B text","C text","D text"], "correct_answer": "A", "explanation": "...", "difficulty": "${difficulty}", "tags": ["${topic.trim()}"] }`;

    try {
      const res = await fetch('/api/v2/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ task: 'mcq_generate', prompt }),
      });
      const data = (await res.json()) as { result?: { text?: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setRaw(data.result?.text ?? '');
      setMessage(
        isProgramming
          ? 'Generated programming problems. Review below, then import to the question bank.'
          : 'Generated MCQs. Review below, then import to the question bank.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const importToBank = async () => {
    if (!categoryId || !raw.trim()) return;

    const resolvedId = await resolveCategoryIdForImport();
    if (!resolvedId) return;

    const parsed = parseMcqsFromAiText(raw, resolvedId);
    if (!parsed.length) {
      setMessage('Could not parse output. Use JSON array or Q1/A/B/C/D/Answer format.');
      return;
    }
    const rows = parsed.map((q) => ({
      category_id: q.category_id,
      difficulty: q.difficulty,
      question_text: q.question_text,
      type: q.type,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      tags: q.tags,
    }));
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: rows }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; count?: number };
    if (!res.ok) {
      setMessage(json.error ?? 'Import failed');
      return;
    }
    setMessage(
      `Imported ${json.count ?? rows.length} question(s) into "${selectedCategory?.name ?? 'category'}".`,
    );
  };

  if (loading) {
    return <p className="text-gray-600">Loading categories…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-900">AI generator</h2>
        <p className="text-sm text-gray-600 mt-1">
          Choose exam type, category, and topic — then generate MCQs or programming problems for import.
        </p>
      </div>

      {loadWarning ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadWarning}
        </p>
      ) : null}

      <Card className="p-6 space-y-5 bg-white border border-gray-200">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="exam-type" className="text-sm font-medium text-gray-700">
              Exam type
            </label>
            <select
              id="exam-type"
              className={selectClassName}
              value={examType}
              onChange={(e) => onExamTypeChange(e.target.value as ExamContentType)}
            >
              {EXAM_CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {EXAM_CONTENT_TYPES.find((t) => t.value === examType)?.description}
            </p>
          </div>

          <div>
            <label htmlFor="category" className="text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="category"
              className={selectClassName}
              value={categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="topic" className="text-sm font-medium text-gray-700">
            Topic for this exam
          </label>
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={topicPlaceholder(selectedSlug, examType)}
            className="mt-1 bg-white"
          />
          {topicSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {topicSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTopic(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="count" className="text-sm font-medium text-gray-700">
              Number of questions
            </label>
            <Input
              id="count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-1 bg-white"
            />
          </div>
          <div>
            <label htmlFor="difficulty" className="text-sm font-medium text-gray-700">
              Difficulty
            </label>
            <select
              id="difficulty"
              className={selectClassName}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => void generate()}
          disabled={generating || !categoryId}
          className="bg-[#1e3a5f] hover:bg-[#16304f] text-white"
        >
          {generating
            ? 'Generating…'
            : examType === 'programming'
              ? 'Generate programming problems'
              : 'Generate MCQs'}
        </Button>
        {message ? <p className="text-sm text-gray-700">{message}</p> : null}
      </Card>

      {raw ? (
        <Card className="p-6 space-y-4 bg-white border border-gray-200">
          <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={16} className="font-mono text-xs" />
          <Button type="button" onClick={() => void importToBank()} className="bg-emerald-600 hover:bg-emerald-700">
            Import to question bank
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
