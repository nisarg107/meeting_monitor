import { useCallback, useMemo, useRef, useState } from 'react';

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  isFinal: boolean;
};

export function useTranscriptBuffer() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const startedAtRef = useRef<number>(Date.now());

  const nowOffsetMs = () => Date.now() - startedAtRef.current;

  const addInterim = useCallback((id: string, text: string) => {
    setSegments((prev) => {
      const existingIndex = prev.findIndex((s) => s.id === id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          text,
          endMs: nowOffsetMs(),
          isFinal: false,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id,
          startMs: nowOffsetMs(),
          endMs: nowOffsetMs(),
          text,
          isFinal: false,
        },
      ];
    });
  }, []);

  const finalize = useCallback((id: string, text: string, speaker?: string) => {
    setSegments((prev) => {
      const existingIndex = prev.findIndex((s) => s.id === id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          text,
          endMs: nowOffsetMs(),
          isFinal: true,
          speaker: speaker ?? updated[existingIndex].speaker,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id,
          startMs: nowOffsetMs(),
          endMs: nowOffsetMs(),
          text,
          isFinal: true,
          speaker,
        },
      ];
    });
  }, []);

  const clear = useCallback(() => setSegments([]), []);

  const asPlainText = useMemo(() => {
    return segments
      .filter((s) => s.text.trim().length > 0)
      .map((s) => `${s.speaker ? `[${s.speaker}] ` : ''}${s.text}`)
      .join('\n');
  }, [segments]);

  function formatVttTimestamp(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const milli = (ms % 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milli}`;
  }

  const asVtt = useMemo(() => {
    const lines = ['WEBVTT', ''];
    segments
      .filter((s) => s.text.trim().length > 0)
      .forEach((s, idx) => {
        lines.push(`${idx + 1}`);
        lines.push(
          `${formatVttTimestamp(s.startMs)} --> ${formatVttTimestamp(s.endMs)}`,
        );
        lines.push(`${s.speaker ? `${s.speaker}: ` : ''}${s.text}`);
        lines.push('');
      });
    return lines.join('\n');
  }, [segments]);

  return { segments, addInterim, finalize, clear, asPlainText, asVtt };
}


