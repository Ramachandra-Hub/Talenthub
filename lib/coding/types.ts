export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  runtimeMs: number;
  memoryKb: number | null;
  engine: 'piston' | 'local' | 'wandbox' | 'inprocess' | 'fallback';
}
