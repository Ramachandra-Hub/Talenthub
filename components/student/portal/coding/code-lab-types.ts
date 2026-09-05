export type CodeLabConsoleTab = 'output' | 'tests' | 'errors';

export type PublicTestRow = {
  passed: boolean;
  stderr?: string;
};

export type CodeLabSubmitSnapshot = {
  passed: number;
  total: number;
  status: string;
  compileOk?: boolean;
  publicResults?: PublicTestRow[];
};

export type CodeLabProblem = {
  id: string;
  title: string;
  statement: string;
  constraints: string | null;
  inputFormat: string;
  outputFormat: string;
  difficulty: string;
  conceptSlug: string;
  sampleTests: Array<{ input: string; expectedOutput: string }>;
  hiddenTestCount: number;
  best: { passed: number; total: number; status: string; language: string } | null;
};
