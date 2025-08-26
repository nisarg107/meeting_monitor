import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranscriptBuffer } from './useTranscriptBuffer';

type Status = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export function useAssemblyAICaptions() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const { segments, addInterim, finalize, clear, asPlainText, asVtt } =
    useTranscriptBuffer();

  const provider = useMemo(
    () => process.env.NEXT_PUBLIC_CAPTIONS_PROVIDER ?? 'assemblyai',
    [],
  );

  const stop = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    tabStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    wsRef.current = null;
    audioContextRef.current = null;
    workletNodeRef.current = null;
    tabStreamRef.current = null;
    setStatus('stopped');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    clear();
    setStatus('starting');

    if (provider !== 'assemblyai') {
      setError('Unsupported captions provider');
      setStatus('error');
      return;
    }

    // No token needed when using local proxy with Authorization header
    // 2) Try to capture system/tab audio so we include remote participants.
    // If that fails (e.g., requires user gesture, denied, or unsupported),
    // fall back to capturing the local microphone so captions still work automatically.
    let audioStream: MediaStream | null = null;
    try {
      audioStream = await (navigator.mediaDevices as any).getDisplayMedia({
        audio: true,
        video: false,
      });
    } catch (e) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (micErr) {
        setError('Could not capture audio for captions');
        setStatus('error');
        return;
      }
    }
    if (!audioStream) {
      setError('No audio stream available for captions');
      setStatus('error');
      return;
    }
    tabStreamRef.current = audioStream;

    // 3) Route audio through AudioWorklet to get raw PCM 16k mono frames
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(audioStream);
    await audioContext.audioWorklet.addModule('/worklets/pcm-processor.js');
    const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
    workletNodeRef.current = workletNode;
    source.connect(workletNode);
    // Ensure the graph is rendering by connecting to a muted sink
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    workletNode.connect(sink);
    sink.connect(audioContext.destination);
    try {
      await audioContext.resume();
    } catch {}

    // 4) Connect websocket
    // Route via local proxy using v3 streaming API which supports Authorization header from server side
    const url = `ws://localhost:${process.env.NEXT_PUBLIC_CAPTIONS_PROXY_PORT || process.env.CAPTIONS_PROXY_PORT || '8787'}?sample_rate=16000&format_turns=true`;
    const ws = new WebSocket(url, []);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('running');
      // v3 protocol authenticates via upstream proxy header, so no auth message.
    };

    ws.onerror = () => {
      setError('Captions connection error. Is the captions proxy running?');
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'error' ? s : 'stopped'));
    };

    ws.onmessage = (msg) => {
      try {
        const raw = msg.data;
        if (typeof raw !== 'string') return; // ignore non-JSON control frames
        const data = JSON.parse(raw);
        // AssemblyAI v3: Turn messages with speaker diarization
        if (data.type === 'Turn') {
          const id = data.id || uuidv4();
          const transcript = data.transcript || '';
          const formatted = data.turn_is_formatted;
          const speaker = data.speaker; // Speaker label from diarization
          
          if (formatted) {
            finalize(id, transcript, speaker);
          } else {
            addInterim(id, transcript);
          }
          return;
        }
        // Fallbacks: handle generic text transcripts
        const text = data.text || data.transcript || '';
        const isFinal = !!(data.is_final || data.final || data.message_type === 'FinalTranscript');
        if (text) {
          const id = data.id || uuidv4();
          if (isFinal) {
            finalize(id, text, data.speaker || undefined);
          } else {
            addInterim(id, text);
          }
        }
      } catch (e) {
        // swallow parse errors
      }
    };

    workletNode.port.onmessage = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const pcmChunk = e.data as ArrayBuffer; // 16-bit LE mono PCM at 16k
      ws.send(pcmChunk);
    };
  }, [addInterim, clear, finalize, provider]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    status,
    error,
    segments,
    asPlainText,
    asVtt,
    start,
    stop,
  };
}


