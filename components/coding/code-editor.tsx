'use client';

import dynamic from 'next/dynamic';
import { getCodingLanguage } from '@/lib/coding/languages';

const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Props = {
  language: string;
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
};

export function CodeEditor({ language, value, onChange, height = '360px', readOnly = false }: Props) {
  const monacoLang = getCodingLanguage(language).monaco;

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden min-h-[420px] bg-[#1e1e1e]">
      <Monaco
        height={height}
        language={monacoLang}
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          readOnly,
        }}
      />
    </div>
  );
}

