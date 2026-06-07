'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { RmsetPaperWithTopics, RmsetTopic } from '@/lib/rmset/types';
import {
  RMSET_DEFAULT_DURATION_MINUTES,
  RMSET_DEFAULT_QUESTIONS_PER_TOPIC,
} from '@/lib/rmset/types';

export default function AdminRmsetPage() {
  const [topics, setTopics] = useState<RmsetTopic[]>([]);
  const [papers, setPapers] = useState<RmsetPaperWithTopics[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [title, setTitle] = useState('RMSET — Eligibility Test');
  const [description, setDescription] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [questionsPerTopic, setQuestionsPerTopic] = useState(RMSET_DEFAULT_QUESTIONS_PER_TOPIC);
  const [durationMinutes, setDurationMinutes] = useState(RMSET_DEFAULT_DURATION_MINUTES);

  const load = async () => {
    const res = await fetchWithAuth('/api/admin/rmset');
    if (res.ok) {
      const json = (await res.json()) as {
        topics?: RmsetTopic[];
        papers?: RmsetPaperWithTopics[];
        warning?: string;
      };
      setTopics(json.topics ?? []);
      setPapers(json.papers ?? []);
      setLoadError(json.warning ?? null);
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(json.error ?? 'Could not load RMSET');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleTopic = (id: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const publish = async () => {
    if (!selectedTopicIds.length) {
      alert('Select at least one topic');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetchWithAuth('/api/admin/rmset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          topicIds: selectedTopicIds,
          questionsPerTopic,
          durationMinutes,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        hint?: string;
        totalQuestions?: number;
      };
      if (!res.ok) {
        alert([json.error, json.hint].filter(Boolean).join('\n\n') ?? 'Could not publish RMSET paper');
        return;
      }
      alert(`RMSET paper published with ${json.totalQuestions ?? 0} questions. Go live via ElevateX & modules.`);
      await load();
    } finally {
      setPublishing(false);
    }
  };

  const selectedTotal = selectedTopicIds.length * questionsPerTopic;

  if (loading) {
    return <p className="text-gray-600">Loading RMSET…</p>;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="RMSET"
        description="Select RMSET syllabus topics. Questions are drawn from the question bank for each topic (use Load topic bank if counts are zero)."
      />

      {loadError ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {loadError}
        </p>
      ) : null}

      <Card className="p-6 space-y-5">
        <h3 className="font-semibold text-[#0c2340]">Paper settings</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Questions per topic
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={questionsPerTopic}
              onChange={(e) => setQuestionsPerTopic(Number(e.target.value) || 10)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Duration (minutes)
            </label>
            <Input
              type="number"
              min={15}
              max={180}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <p className="text-sm text-slate-600">
              Total MCQs:{' '}
              <strong className="text-[#0c2340]">{selectedTotal}</strong> ({selectedTopicIds.length} topics)
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description (shown to students)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Mid-semester eligibility test for CSE 3rd year"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Allowed topics — select which subjects appear in this RMSET paper
          </p>
          {topics.length === 0 ? (
            <p className="text-sm text-slate-500">
              No RMSET syllabus topics configured. Run migrations 015/016 and load the topic question bank
              from the exam builder (faculty or admin).
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {topics.map((topic) => {
                const selected = selectedTopicIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => toggleTopic(topic.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      selected
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 ring-1 ring-[#1e3a5f]/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-[#0c2340]">{topic.name}</span>
                      {selected ? <Badge tone="success">Selected</Badge> : null}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{topic.question_count} questions in bank</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button disabled={publishing || !selectedTopicIds.length} onClick={() => void publish()}>
            Publish RMSET paper
          </Button>
          <Link href="/admin/evalora-modules">
            <Button variant="outline">Go live in modules hub →</Button>
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          After publishing, open{' '}
          <Link href="/admin/evalora-modules" className="underline">
            ElevateX & modules
          </Link>{' '}
          and schedule <strong>RMSET</strong> so students see it on the tests hub.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-[#0c2340] mb-4">Published papers</h3>
        {papers.length === 0 ? (
          <p className="text-sm text-slate-500">No RMSET papers yet.</p>
        ) : (
          <div className="space-y-3">
            {papers.map((paper) => (
              <div key={paper.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#0c2340]">{paper.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {paper.total_questions} Q · {paper.duration_minutes} min ·{' '}
                      {paper.topics.map((t) => t.name).join(', ') || 'No topics'}
                    </p>
                  </div>
                  <Badge
                    tone={
                      paper.status === 'published'
                        ? 'success'
                        : paper.status === 'draft'
                          ? 'warning'
                          : 'neutral'
                    }
                    className="capitalize"
                  >
                    {paper.status}
                  </Badge>
                </div>
                {paper.test_id ? (
                  <p className="text-xs text-slate-500 mt-2 font-mono">Test ID: {paper.test_id}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
