'use client';

import dynamic from 'next/dynamic';
import { getCodingLanguage } from '@/lib/coding/languages';
import { cn } from '@/lib/utils';

const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Props = {
  language: string;
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  /** Fill parent (Code Lab). Avoids 100%-height collapse. */
  fill?: boolean;
  fontSize?: number;
  className?: string;
};

export function CodeEditor({
  language,
  value,
  onChange,
  height = '360px',
  readOnly = false,
  fill = false,
  fontSize = 16,
  className,
}: Props) {
  const monacoLang = getCodingLanguage(language).monaco;

  return (
    <div
      className={cn(
        'overflow-hidden bg-[#1e1e1e]',
        fill
          ? 'absolute inset-0 h-full min-h-0 rounded-none border-0'
          : 'min-h-[420px] rounded-lg border border-slate-200',
        className,
      )}
    >
      <Monaco
        height={fill ? '100%' : height}
        language={monacoLang}
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          lineHeight: Math.round(fontSize * 1.45),
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          readOnly,
          padding: { top: 8, bottom: 8 },
          mouseWheelZoom: true,
        }}
      />
    </div>
  );
}
