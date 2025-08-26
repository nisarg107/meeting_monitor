'use client';
import { useEffect, useRef } from 'react';
import { useAssemblyAICaptions } from '@/hooks/useAssemblyAICaptions';
import { Button } from './ui/button';

type CaptionsApi = ReturnType<typeof useAssemblyAICaptions>;

const CaptionsPanel = ({ api }: { api?: CaptionsApi }) => {
  const defaultApi = useAssemblyAICaptions();
  const {
    status,
    error,
    segments,
    asPlainText,
    asVtt,
    start,
    stop,
  } = api || defaultApi;

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [segments]);

  const downloading = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex h-[calc(100vh-86px)] w-[360px] flex-col rounded-md bg-dark-1 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Captions</h3>
        <div className="flex gap-2">
          {status !== 'running' ? (
            <Button className="bg-green-600 px-3 py-1" onClick={start}>
              Start CC
            </Button>
          ) : (
            <Button className="bg-red-600 px-3 py-1" onClick={stop}>
              Stop CC
            </Button>
          )}
          <Button
            className="bg-dark-4 px-3 py-1"
            onClick={() => downloading(asPlainText, 'text/plain', 'txt')}
            disabled={segments.length === 0}
          >
            .txt
          </Button>
          <Button
            className="bg-dark-4 px-3 py-1"
            onClick={() => downloading(asVtt, 'text/vtt', 'vtt')}
            disabled={segments.length === 0}
          >
            .vtt
          </Button>
        </div>
      </div>
      <div className="mt-2 text-sm text-red-400">{error}</div>
      <div
        ref={listRef}
        className="mt-2 flex-1 overflow-y-auto rounded bg-dark-2 p-3 text-sm"
      >
        {segments.map((s) => (
          <div key={s.id} className="mb-2">
            {s.speaker && (
              <span className="mr-2 text-xs text-sky-300">[{s.speaker}]</span>
            )}
            <span className={s.isFinal ? 'text-white' : 'text-gray-400'}>
              {s.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CaptionsPanel;


