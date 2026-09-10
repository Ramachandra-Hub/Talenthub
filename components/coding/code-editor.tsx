'use client';

import dynamic from 'next/dynamic';
import { useCallback } from 'react';
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
  /** Block paste / drop (proctored exams). */
  disablePaste?: boolean;
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
  disablePaste = false,
}: Props) {
  const monacoLang = getCodingLanguage(language).monaco;

  const handleMount = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any, monaco: any) => {
      if (!disablePaste) return;

      editor.updateOptions({ contextmenu: false });

      editor.onKeyDown((e: { ctrlKey: boolean; metaKey: boolean; keyCode: number; preventDefault: () => void; stopPropagation: () => void }) => {
        const isPaste =
          (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyV;
        const isShiftInsert =
          e.keyCode === monaco.KeyCode.Insert && (e as { shiftKey?: boolean }).shiftKey;
        if (isPaste || isShiftInsert) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      const dom = editor.getContainerDomNode?.() as HTMLElement | null;
      if (dom) {
        const block = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        dom.addEventListener('paste', block, true);
        dom.addEventListener('drop', block, true);
      }
    },
    [disablePaste],
  );

  return (
    <div
      className={cn(
        'overflow-hidden bg-[#1e1e1e]',
        fill
          ? 'absolute inset-0 h-full min-h-0 rounded-none border-0'
          : 'min-h-[420px] rounded-lg border border-slate-200',
        className,
      )}
      onPaste={
        disablePaste
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
          : undefined
      }
      onDrop={
        disablePaste
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
          : undefined
      }
    >
      <Monaco
        height={fill ? '100%' : height}
        language={monacoLang}
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
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
          contextmenu: !disablePaste,
        }}
      />
    </div>
  );
}
