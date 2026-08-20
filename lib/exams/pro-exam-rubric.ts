import { subtopicsForSubject } from '@/lib/exams/subject-subtopics';
import { syllabusTopicSlugForSubject } from '@/lib/exams/subject-syllabus-map';

export type RubricTopicRow = {
  topicSlug: string;
  topicName?: string;
  mcqCount: number;
  codingCount?: number;
};

export type SubjectRubricConfig = {
  topics: RubricTopicRow[];
  /** Shuffle drawn questions within this subject before the student sees them. */
  shuffleQuestions?: boolean;
  /** Coding snippets only check logic via sample I/O (no hidden test cases). */
  logicOnlyCoding?: boolean;
};

export type SubjectRubricInput = {
  subjectId: string;
  subjectName: string;
  slug: string;
  rubric: SubjectRubricConfig;
};

export function defaultRubricForSubject(input: {
  slug: string;
  subjectName: string;
  questionsPerSubject: number;
  codingCount?: number;
}): SubjectRubricConfig {
  const slug = input.slug.trim().toLowerCase();
  const codingCount = input.codingCount ?? 0;
  if (slug.includes('java') || /\bjava\b/i.test(input.subjectName)) {
    const topics: RubricTopicRow[] = [
      {
        topicSlug: 'technical-java',
        topicName: 'Java language, OOP & arrays',
        mcqCount: input.questionsPerSubject,
        codingCount: 0,
      },
    ];
    if (codingCount > 0) {
      topics.push({
        topicSlug: 'coding-java',
        topicName: 'Java coding problems',
        mcqCount: 0,
        codingCount,
      });
    }
    return {
      topics,
      shuffleQuestions: true,
      logicOnlyCoding: false,
    };
  }
  const subtopics = subtopicsForSubject(input);
  if (subtopics.length) {
    const first = subtopics[0];
    return {
      topics: [
        {
          topicSlug: first.slug,
          topicName: first.name,
          mcqCount: input.questionsPerSubject,
          codingCount: input.codingCount ?? 0,
        },
      ],
      shuffleQuestions: true,
      logicOnlyCoding: true,
    };
  }
  const defaultSlug = syllabusTopicSlugForSubject({
    slug: input.slug,
    subjectName: input.subjectName,
  });
  return {
    topics: [
      {
        topicSlug: defaultSlug,
        mcqCount: input.questionsPerSubject,
        codingCount: input.codingCount ?? 0,
      },
    ],
    shuffleQuestions: true,
    logicOnlyCoding: false,
  };
}

export function parseSubjectRubricConfig(raw: unknown): SubjectRubricConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.topics)) return null;
  const topics: RubricTopicRow[] = [];
  for (const row of obj.topics) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const topicSlug = String(r.topicSlug ?? r.topic_slug ?? '').trim();
    if (!topicSlug) continue;
    const mcqCount = Math.min(Math.max(Number(r.mcqCount ?? r.mcq_count ?? 0), 0), 30);
    const codingRaw = r.codingCount ?? r.coding_count;
    const codingCount =
      codingRaw == null ? undefined : Math.min(Math.max(Number(codingRaw), 0), 10);
    topics.push({
      topicSlug,
      topicName: r.topicName ? String(r.topicName) : r.topic_name ? String(r.topic_name) : undefined,
      mcqCount,
      codingCount,
    });
  }
  if (!topics.length) return null;
  return {
    topics,
    shuffleQuestions: obj.shuffleQuestions !== false && obj.shuffle_questions !== false,
    logicOnlyCoding: obj.logicOnlyCoding === true || obj.logic_only_coding === true,
  };
}

export function parseSubjectRubricsFromBody(
  body: Record<string, unknown>,
): Record<string, SubjectRubricConfig> {
  const raw = body.subjectRubrics ?? body.subject_rubrics;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, SubjectRubricConfig> = {};
  for (const [subjectId, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseSubjectRubricConfig(value);
    if (parsed) out[subjectId] = parsed;
  }
  return out;
}

export function validateSubjectRubric(rubric: SubjectRubricConfig): string | null {
  if (!rubric.topics.length) return 'Rubric must include at least one topic row.';
  for (const row of rubric.topics) {
    if (!row.topicSlug.trim()) return 'Each rubric row needs a topic.';
    const total = row.mcqCount + (row.codingCount ?? 0);
    if (total <= 0) return `Topic "${row.topicSlug}" needs at least one MCQ or coding question.`;
    if (row.mcqCount > 30) return `Topic "${row.topicSlug}" exceeds 30 MCQs.`;
    if ((row.codingCount ?? 0) > 10) return `Topic "${row.topicSlug}" exceeds 10 coding items.`;
  }
  return null;
}

export function rubricTotalQuestions(rubric: SubjectRubricConfig): number {
  return rubric.topics.reduce(
    (sum, row) => sum + row.mcqCount + (row.codingCount ?? 0),
    0,
  );
}

export function rubricMcqTopicSlugs(rubric: SubjectRubricConfig): string[] {
  return rubric.topics.filter((row) => row.mcqCount > 0).map((row) => row.topicSlug);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function shuffleIfEnabled<T>(items: T[], enabled: boolean): T[] {
  return enabled ? shuffle(items) : items;
}
