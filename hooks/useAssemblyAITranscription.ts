import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCall, useCallStateHooks } from '@stream-io/video-react-sdk';

interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  speakerId?: string;
  speakerName?: string;
  timestamp?: Date;
}

// Import local storage utility
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

export const useAssemblyAITranscription = (meetingId: string) => {
  const { user } = useUser();
  const call = useCall();
  const { useLocalParticipant, useParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTranscriptPath, setSavedTranscriptPath] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixBusRef = useRef<GainNode | null>(null);
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const rescanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSpeakerRef = useRef<{ id: string; name: string } | null>(null);
  const diarizationMapRef = useRef<Map<string, { id: string; name: string }>>(new Map());
  type SpeakingSample = { ts: number; active: string[] };
  const speakingHistoryRef = useRef<SpeakingSample[]>([]);
  // Keep latest participant states to avoid stale closures inside timers/WS handlers
  const participantsRef = useRef(participants);
  const localParticipantRef = useRef(localParticipant);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { localParticipantRef.current = localParticipant; }, [localParticipant]);

  // Detect current speaker using Stream participant state
  const detectCurrentSpeaker = useCallback(() => {
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;
    const speakingParticipants = parts.filter(p => p.isSpeaking);
    
    if (speakingParticipants.length > 0) {
      const currentSpeaker = speakingParticipants[0];
      currentSpeakerRef.current = {
        id: currentSpeaker.userId,
        name: currentSpeaker.name || currentSpeaker.userId?.split('@')[0] || 'Speaker'
      };
    } else if (local?.isSpeaking) {
      currentSpeakerRef.current = {
        id: local.userId,
        name: local.name || local.userId?.split('@')[0] || 'Speaker'
      };
    } else {
      // Fallback to local participant
      currentSpeakerRef.current = {
        id: local?.userId || user?.id || 'user-1',
        name: local?.name || user?.fullName || 'Speaker'
      };
    }
  }, [user]);

  // Helper: attach a MediaStream to graph, dedup by track id
  const attachStreamToGraph = useCallback((stream: MediaStream, label: string) => {
    if (!audioContextRef.current || !mixBusRef.current) return;
    const tracks = stream.getAudioTracks();
    if (!tracks || tracks.length === 0) return;

    tracks.forEach((track) => {
      const id = `${label}:${track.id}`;
      if (remoteSourcesRef.current.has(id)) return;
      try {
        const singleTrackStream = new MediaStream([track]);
        const src = audioContextRef.current!.createMediaStreamSource(singleTrackStream);
        src.connect(mixBusRef.current!);
        remoteSourcesRef.current.set(id, src);
        console.log('🔊 Attached audio track:', id);
      } catch (err) {
        console.warn('Could not attach track', id, err);
      }
    });
  }, []);

  // Scan DOM for Stream Video SDK media elements and attach their audio
  const scanAndAttachRemoteAudio = useCallback(() => {
    try {
      // Stream Video SDK mounts media inside elements with class containing 'str-video'
      const container = document.querySelector('[class*="str-video"]') || document.body;
      const mediaEls = Array.from(container.querySelectorAll('video, audio')) as (HTMLVideoElement | HTMLAudioElement)[];
      mediaEls.forEach((el, idx) => {
        // Skip elements without audio
        let mediaStream: MediaStream | null = null;
        try {
          // captureStream works for <video> and many <audio> in Chromium
          const anyEl: any = el as any;
          if (typeof anyEl.captureStream === 'function') {
            mediaStream = anyEl.captureStream();
          }
        } catch {}
        if (!mediaStream) return;
        attachStreamToGraph(mediaStream, `elem${idx}`);
      });
    } catch (e) {
      console.warn('Remote audio scan failed:', e);
    }
  }, [attachStreamToGraph]);

  // Setup audio capture by mixing mic + remote elements (no screen share)
  const setupAudioCapture = useCallback(async () => {
    console.log('🎤 Setting up audio capture...');
    // Create the audio graph
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule('/audio-processor.js');
    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioWorkletNodeRef.current = workletNode;

    // Mix bus collects all sources (mic + remotes)
    const mixBus = audioContext.createGain();
    mixBus.gain.value = 1.0;
    mixBusRef.current = mixBus;
    mixBus.connect(workletNode);

    // Mute output but keep graph running
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    workletNode.connect(sink);
    sink.connect(audioContext.destination);

    // 1) Attach local microphone (so your voice is included)
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = mic;
      const micSrc = audioContext.createMediaStreamSource(mic);
      sourceRef.current = micSrc;
      micSrc.connect(mixBus);
      console.log('🎙️ Mic attached');
    } catch (micErr) {
      console.warn('Mic not available:', micErr);
    }

    // 2) Attach remote participant audio by capturing SDK-rendered media elements
    scanAndAttachRemoteAudio();
    // Re-scan periodically to catch joins/leaves
    if (rescanTimerRef.current) clearInterval(rescanTimerRef.current);
    rescanTimerRef.current = setInterval(scanAndAttachRemoteAudio, 1500);

    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('Could not resume audio context:', error);
    }
    console.log('✅ Audio mixing setup complete');
  }, []);

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (!user || !meetingId) return;

    // Force cleanup any existing connections first
    console.log('🧹 Cleaning up any existing connections...');
    stopTranscription();
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      setIsTranscribing(true);
      setError(null);
      
      // Get all participants with proper display names
      const getAllParticipants = () => {
        const allParticipants = [];
        
        // Add local participant
        if (localParticipant) {
          const localName = localParticipant.name || 
                           localParticipant.userId?.split('@')[0] || 
                           'Host';
          allParticipants.push({
            id: localParticipant.userId,
            name: localName,
            role: 'Host',
            isHost: true
          });
        }
        
        // Add remote participants
        participants.forEach(participant => {
          if (participant.userId !== localParticipant?.userId) {
            const participantName = participant.name || 
                                  participant.userId?.split('@')[0] || 
                                  `Participant ${participant.userId}`;
            allParticipants.push({
              id: participant.userId,
              name: participantName,
              role: 'Participant',
              isHost: false
            });
          }
        });
        
        return allParticipants;
      };

      const allParticipants = getAllParticipants();
      const participantNames = allParticipants.map(p => p.name);

      // Start local transcript storage session with enhanced details
      localTranscriptStorageClient.startMeeting(meetingId, {
        title: `Meeting ${meetingId}`,
        startTime: new Date(),
        participants: participantNames,
        industry: 'manufacturing', // Can be made configurable
        meetingType: 'sales',
        attendees: allParticipants,
        language: 'English',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      // Setup audio capture
      try {
        await setupAudioCapture();
        console.log('🎤 Audio capture setup complete');
      } catch (error) {
        console.error('❌ Audio capture setup failed:', error);
        throw error;
      }

      // Get AssemblyAI token (no-cache to avoid stale tokens)
      const response = await fetch('/api/assemblyai-token', { cache: 'no-store' });
      const data = await response.json();
      
      if (data.error || !data.token) {
        console.error('AssemblyAI token error:', data.error);
        throw new Error('Failed to get AssemblyAI token');
      }

      // Debug: log masked token info (length only, not the token)
      try { console.log('🔑 Retrieved AssemblyAI token length:', data.token.length); } catch (_) {}

      // Connect to AssemblyAI Universal Streaming WebSocket (v3) - using direct connection
      const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&format_turns=true&speaker_labels=true&enable_speaker_diarization=true&token=${data.token}`;
      console.log('🔗 Connecting to AssemblyAI:', endpoint.substring(0, 50) + '...');
      
      const ws = new WebSocket(endpoint);
      wsRef.current = ws;

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('❌ WebSocket connection timeout');
          ws.close();
          setError('Connection timeout. Please try again.');
          setIsTranscribing(false);
        }
      }, 10000); // 10 second timeout

      const turns: Record<number, string> = {}; // keyed by turn_order

      ws.onopen = () => {
        console.log('🔓 AssemblyAI WebSocket connected!');
        clearTimeout(connectionTimeout); // Clear connection timeout

        // Setup audio streaming to WebSocket
        if (audioWorkletNodeRef.current) {
          audioWorkletNodeRef.current.port.onmessage = (event) => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                // Send the audio buffer as Uint8Array (correct format for AssemblyAI)
                const audioBuffer = event.data.audio_data;
                const uint8Array = new Uint8Array(audioBuffer);
                ws.send(uint8Array);
              }
            } catch (sendErr) {
              console.error('❌ Failed to send audio chunk:', sendErr);
            }
          };
        }
        
        // Start speaker detection timer: sample Stream SDK's isSpeaking and build a small history buffer
        const sampleIntervalMs = 200;
        speakerDetectionTimerRef.current = setInterval(() => {
          detectCurrentSpeaker();
          try {
            const actives: string[] = [];
            const parts = participantsRef.current || [];
            const local = localParticipantRef.current;
            parts.forEach(p => { if (p.isSpeaking) actives.push(p.userId); });
            if (local?.isSpeaking && !actives.includes(local.userId)) {
              actives.push(local.userId);
            }
            speakingHistoryRef.current.push({ ts: Date.now(), active: actives });
            // Keep last 30s
            const cutoff = Date.now() - 30000;
            while (speakingHistoryRef.current.length > 0 && speakingHistoryRef.current[0].ts < cutoff) {
              speakingHistoryRef.current.shift();
            }
          } catch {}
        }, sampleIntervalMs);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('📨 AssemblyAI message:', msg);

          if (msg.type === 'Turn') {
            const { turn_order, transcript, end_of_turn_confidence } = msg;
            // Robust speaker label extraction across possible keys
            const speakerLabelRaw = (msg.speaker ?? msg.turn_speaker ?? msg.channel ?? msg.spk ?? '').toString();
            const speakerLabel = speakerLabelRaw || '';
            
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

              // Resolve speaker using diarization + speaking history
              let resolved: { id: string; name: string } | null = null;
              if (speakerLabel) {
                resolved = diarizationMapRef.current.get(speakerLabel) || null;
              }

              // If still unknown, infer from speaking history over the turn time window
              if (!resolved) {
                // Estimate time window from words if available; else last 2s
                let startTs = Date.now() - 2000;
                let endTs = Date.now();
                try {
                  const words = (msg.words || []) as Array<{ start?: number; end?: number }>;
                  if (words.length > 0) {
                    const first = words.find(w => typeof w.start === 'number');
                    const last = [...words].reverse().find(w => typeof w.end === 'number');
                    if (first?.start != null && last?.end != null) {
                      // AssemblyAI times are usually in ms
                      const now = Date.now();
                      endTs = now; // keep relative to now
                      startTs = now - Math.max(500, Math.min(5000, (last.end - first.start)));
                    }
                  }
                } catch {}

                const windowSamples = speakingHistoryRef.current.filter(s => s.ts >= startTs && s.ts <= endTs);
                const counts = new Map<string, number>();
                windowSamples.forEach(s => s.active.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
                let topId: string | null = null;
                let topCount = 0;
                counts.forEach((c, id) => { if (c > topCount) { topCount = c; topId = id; } });

                if (topId) {
                  // Resolve name by matching participants/local
                  const parts = participantsRef.current || [];
                  const local = localParticipantRef.current;
                  let name = parts.find(p => p.userId === topId)?.name || '';
                  if (!name && local && local.userId === topId) {
                    name = local.name || user?.fullName || 'Host';
                  }
                  const fallbackName = name || `Speaker ${speakerLabel || ''}`.trim() || 'Speaker';
                  resolved = { id: topId, name: fallbackName };
                  if (speakerLabel) {
                    diarizationMapRef.current.set(speakerLabel, resolved);
                    console.log('🔗 Inferred mapping', speakerLabel, '→', resolved.name, '(history-based)');
                  }
                }
              }
              if (!resolved) {
                // Fallback to current speaker or anonymous label
                const cur = currentSpeakerRef.current || {
                  id: (localParticipantRef.current?.userId) || user?.id || 'user-1',
                  name: (localParticipantRef.current?.name) || user?.fullName || (speakerLabel ? `Speaker ${speakerLabel}` : 'Speaker'),
                };
                resolved = cur;
              }
              const speakerId = resolved.id;
              const speakerName = resolved.name;

              const transcriptWithSpeaker = {
                ...result,
                speakerId,
                speakerName,
                timestamp: new Date()
              };
              
              localTranscriptStorageClient.addTranscript(transcriptWithSpeaker);
              
              // Only show final transcripts in UI (less restrictive)
              if (result.isFinal && result.text.trim().length > 0) {
                setTranscripts(prev => [...prev, transcriptWithSpeaker]);
              }
              
              console.log('✅ Transcript received:', { 
                text: result.text, 
                speakerId, 
                speakerName
              });
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
        clearTimeout(connectionTimeout); // Clear connection timeout
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
  }, [user, meetingId, setupAudioCapture]);

  // Stop transcription
  const stopTranscription = useCallback(() => {
    console.log('🛑 Stopping transcription...');
    if (rescanTimerRef.current) {
      clearInterval(rescanTimerRef.current);
      rescanTimerRef.current = null;
    }
    
    // Close WebSocket connection
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'Terminate' }));
        wsRef.current.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      wsRef.current = null;
    }

    // Clean up audio worklet
    if (audioWorkletNodeRef.current) {
      try {
        audioWorkletNodeRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio worklet:', error);
      }
      audioWorkletNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }

    // Stop all audio tracks
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped audio track:', track.kind);
        });
      } catch (error) {
        console.error('Error stopping audio tracks:', error);
      }
      streamRef.current = null;
    }

    // Disconnect audio source
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio source:', error);
      }
      sourceRef.current = null;
    }

    // Disconnect remote sources
    if (remoteSourcesRef.current.size > 0) {
      remoteSourcesRef.current.forEach((src) => {
        try { src.disconnect(); } catch {}
      });
      remoteSourcesRef.current.clear();
    }

    if (mixBusRef.current) {
      try { mixBusRef.current.disconnect(); } catch {}
      mixBusRef.current = null;
    }

    // Clear speaker detection timer
    if (speakerDetectionTimerRef.current) {
      clearInterval(speakerDetectionTimerRef.current);
      speakerDetectionTimerRef.current = null;
    }

    // Save transcript to local file
    const savedPath = localTranscriptStorageClient.endMeeting();
    if (savedPath) {
      setSavedTranscriptPath(savedPath);
      console.log('💾 Transcript saved to:', savedPath);
    }

    setIsTranscribing(false);
    console.log('✅ Transcription stopped and cleaned up');
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    console.log('🧹 Clearing transcripts and resetting...');
    
    // Force cleanup any existing connections
    stopTranscription();
    
    setTranscripts([]);
    setSavedTranscriptPath(null);
    
    // Get all participants for reset
    const getAllParticipants = () => {
      const allParticipants = [];
      
      if (localParticipant) {
        const localName = localParticipant.name || 
                         localParticipant.userId?.split('@')[0] || 
                         'Host';
        allParticipants.push({
          id: localParticipant.userId,
          name: localName,
          role: 'Host',
          isHost: true
        });
      }
      
      participants.forEach(participant => {
        if (participant.userId !== localParticipant?.userId) {
          const participantName = participant.name || 
                                participant.userId?.split('@')[0] || 
                                `Participant ${participant.userId}`;
          allParticipants.push({
            id: participant.userId,
            name: participantName,
            role: 'Participant',
            isHost: false
          });
        }
      });
      
      return allParticipants;
    };

    const allParticipants = getAllParticipants();
    const participantNames = allParticipants.map(p => p.name);
    
    // Reset local storage session
    localTranscriptStorageClient.startMeeting(meetingId, {
      title: `Meeting ${meetingId}`,
      startTime: new Date(),
      participants: participantNames,
      industry: 'manufacturing',
      meetingType: 'sales',
      attendees: allParticipants,
      language: 'English',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }, [meetingId, localParticipant, participants]);

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
    savedTranscriptPath,
    setSavedTranscriptPath,
    startTranscription,
    stopTranscription,
    clearTranscripts,
  };
};
