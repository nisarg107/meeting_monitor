import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
}

export const useAssemblyAITranscription = (meetingId: string) => {
  const { user } = useUser();
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Create microphone with AudioWorklet
  const createMicrophone = useCallback(() => {
    let stream: MediaStream;
    let audioContext: AudioContext;
    let audioWorkletNode: AudioWorkletNode;
    let source: MediaStreamAudioSourceNode;

    return {
      async requestPermission() {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      },

      async startRecording(onAudioCallback: (audioChunk: Uint8Array) => void) {
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
        }

        audioContext = new AudioContext({
          sampleRate: 16000,
          latencyHint: 'balanced'
        });
        audioContextRef.current = audioContext;

        source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        try {
          await audioContext.audioWorklet.addModule('/audio-processor.js');
          audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
          audioWorkletNodeRef.current = audioWorkletNode;

          source.connect(audioWorkletNode);
          audioWorkletNode.connect(audioContext.destination);

          audioWorkletNode.port.onmessage = (event) => {
            const audioBuffer = event.data.audio_data;
            const uint8Array = new Uint8Array(audioBuffer);
            
            if (onAudioCallback) {
              onAudioCallback(uint8Array);
            }
          };
        } catch (error) {
          console.error('Error setting up AudioWorklet:', error);
          throw error;
        }
      },

      stopRecording() {
        stream?.getTracks().forEach((track) => track.stop());
        audioContext?.close();
        audioWorkletNode?.disconnect();
        source?.disconnect();
        
        streamRef.current = null;
        audioContextRef.current = null;
        audioWorkletNodeRef.current = null;
        sourceRef.current = null;
      }
    };
  }, []);

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (!user || !meetingId) return;

    try {
      setIsTranscribing(true);
      setError(null);

      const microphone = createMicrophone();
      await microphone.requestPermission();

  // Get AssemblyAI token (no-cache to avoid stale tokens)
  const response = await fetch('/api/assemblyai-token', { cache: 'no-store' });
      const data = await response.json();
      
      if (data.error || !data.token) {
        console.error('AssemblyAI token error:', data.error);
        throw new Error('Failed to get AssemblyAI token');
      }

      // Debug: log masked token info (length only, not the token)
      try { console.log('🔑 Retrieved AssemblyAI token length:', data.token.length); } catch (_) {}

  // Connect to AssemblyAI Universal Streaming WebSocket (v3)
  // Use formatted_finals=true so Turn messages include final text
  const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${data.token}`;
      const ws = new WebSocket(endpoint);
      wsRef.current = ws;

      const turns: Record<number, string> = {}; // keyed by turn_order

      ws.onopen = () => {
        console.log('🔓 AssemblyAI WebSocket connected!');

        // Start recording with AudioWorklet — surface errors so UI can show them
        try {
          microphone.startRecording((audioChunk) => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(audioChunk);
              }
            } catch (sendErr) {
              console.error('❌ Failed to send audio chunk:', sendErr);
            }
          });
        } catch (recErr) {
          console.error('❌ Microphone/startRecording failed:', recErr);
          setError(recErr instanceof Error ? recErr.message : String(recErr));
          try { ws.close(); } catch (_) {}
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('📨 AssemblyAI message:', msg);

          if (msg.type === 'Turn') {
            const { turn_order, transcript, end_of_turn_confidence } = msg;
            
            if (transcript && transcript.trim()) {
              turns[turn_order] = transcript;

              const orderedTurns = Object.keys(turns)
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => turns[Number(k)])
                .join(' ');

              const result: TranscriptionResult = {
                text: transcript,
                confidence: end_of_turn_confidence || 0,
                start: 0,
                end: 0,
                isFinal: true,
              };

              setTranscripts(prev => [...prev, result]);
              console.log('✅ Transcript received:', result);
            }
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      ws.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        setError('WebSocket connection error: ' + (err && (err as any).message ? (err as any).message : String(err)));
      };

      ws.onclose = (ev) => {
        try {
          const code = (ev as any)?.code ?? 'unknown';
          const reason = (ev as any)?.reason ?? '';
          console.log('🔌 WebSocket closed; code=', code, ' reason=', reason);
          if (code !== 1000) setError(`WebSocket closed (code=${code}) ${reason}`);
        } catch (closeErr) {
          console.log('🔌 WebSocket closed (could not parse event)');
        }
        setIsTranscribing(false);
      };

    } catch (err) {
      console.error('Failed to start transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
      setIsTranscribing(false);
    }
  }, [user, meetingId, createMicrophone]);

  // Stop transcription
  const stopTranscription = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'Terminate' }));
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsTranscribing(false);
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTranscription();
    };
  }, [stopTranscription]);

  return {
    transcripts,
    isTranscribing,
    error,
    startTranscription,
    stopTranscription,
    clearTranscripts,
  };
};
