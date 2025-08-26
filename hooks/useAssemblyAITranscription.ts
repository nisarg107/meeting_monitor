import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCall, useCallStateHooks } from '@stream-io/video-react-sdk';

interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
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
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSpeakerRef = useRef<{ id: string; name: string } | null>(null);
  const lastSpeakingParticipantRef = useRef<{ id: string; name: string } | null>(null);
  const speakerLabelMapRef = useRef<Record<string, { id: string; name: string }>>({});
  const recentSpeakingAtRef = useRef<Record<string, number>>({});

  // Detect current speaker using Stream participant state
  const detectCurrentSpeaker = useCallback(() => {
    const speakingParticipants = participants.filter(p => p.isSpeaking);
    
    if (speakingParticipants.length > 0) {
      // Prefer a non-local participant if available
      const remoteFirst = speakingParticipants.find(p => p.userId !== localParticipant?.userId) || speakingParticipants[0];
      const name = remoteFirst.name || remoteFirst.userId?.split('@')[0] || 'Speaker';
      const info = { id: remoteFirst.userId, name };
      currentSpeakerRef.current = info;
      lastSpeakingParticipantRef.current = info;
      // Update recent speaking timestamp
      const now = Date.now();
      recentSpeakingAtRef.current[remoteFirst.userId] = now;
      // Also record any others flagged as speaking
      speakingParticipants.forEach(p => {
        recentSpeakingAtRef.current[p.userId] = now;
      });
    } else if (localParticipant?.isSpeaking) {
      currentSpeakerRef.current = {
        id: localParticipant.userId,
        name: localParticipant.name || localParticipant.userId?.split('@')[0] || 'Speaker'
      };
      recentSpeakingAtRef.current[localParticipant.userId] = Date.now();
    } else {
      // Fallback to local participant
      currentSpeakerRef.current = {
        id: localParticipant?.userId || user?.id || 'user-1',
        name: localParticipant?.name || user?.fullName || 'Speaker'
      };
    }
  }, [participants, localParticipant, user]);

  // Setup audio capture to include all participants (tab/system audio preferred, otherwise mix remote tracks)
  const setupAudioCapture = useCallback(async () => {
    console.log('🎤 Setting up audio capture...');
    
    // Try to capture system/tab audio to include all participants (best quality & simplest)
    // Many browsers require this to be triggered by a user gesture.
    let audioStream: MediaStream | null = null;
    try {
      // Prefer current tab audio with echo cancellation off for cleaner diarization
      const displayConstraints: any = {
        video: false,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: true,
        },
        preferCurrentTab: true,
      };
      audioStream = await (navigator.mediaDevices as any).getDisplayMedia(displayConstraints);
      // Ensure at least one audio track
      if (!audioStream || !audioStream.getAudioTracks().length) {
        throw new Error('No audio track in displayMedia stream');
      }
      console.log('🎵 Got system/tab audio stream (includes all participants)');
    } catch (e) {
      console.warn('⚠️ Could not get system/tab audio, attempting to mix remote participant tracks:', e);
      try {
        // Create an AudioContext mix and add: local mic + remote participant audio tracks (if available)
        const tempContext = new AudioContext({ sampleRate: 16000 });
        const destination = tempContext.createMediaStreamDestination();

        // 1) Try to add remote participant tracks from Stream SDK
        try {
          const remoteParticipants = participants.filter(p => p.userId !== localParticipant?.userId);
          for (const p of remoteParticipants) {
            // Stream SDK exposes audio stream on participant?.audioStream (implementation-dependent)
            // Try known fields; if not available, skip silently.
            const anyParticipant: any = p as any;
            const mediaStream: MediaStream | null = anyParticipant.audioStream || anyParticipant.mediaStream || null;
            if (mediaStream) {
              const remoteTracks = mediaStream.getAudioTracks();
              if (remoteTracks.length) {
                const remoteStream = new MediaStream([remoteTracks[0]]);
                const remoteSource = tempContext.createMediaStreamSource(remoteStream);
                const gain = tempContext.createGain();
                gain.gain.value = 1.0;
                remoteSource.connect(gain).connect(destination);
              }
            }
          }
        } catch (mixErr) {
          console.warn('⚠️ Unable to auto-detect remote participant tracks:', mixErr);
        }

        // 2) Add local microphone as fallback so we at least capture the speaker
        try {
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
            video: false,
          });
          if (mic.getAudioTracks().length) {
            const micSource = tempContext.createMediaStreamSource(mic);
            const gain = tempContext.createGain();
            gain.gain.value = 1.0;
            micSource.connect(gain).connect(destination);
          }
        } catch (_) {}

        // If we ended up with at least one node connected, use the mixed stream
        if (destination.stream.getAudioTracks().length) {
          audioStream = destination.stream;
          // Keep tempContext alive by storing it until full setup completes
          audioContextRef.current = tempContext;
          console.log('🎚️ Using mixed audio stream (remote + local if available)');
        } else {
          // Final fallback: just mic
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          console.log('🎤 Fallback to local microphone only');
          // Close temporary context if unused
          try { tempContext.close(); } catch {}
        }
      } catch (mixAllErr) {
        console.error('❌ Mixing attempt failed, falling back to microphone:', mixAllErr);
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('🎤 Fallback to local microphone only');
      }
    }
    
    if (!audioStream) {
      throw new Error('No audio stream available for transcription');
    }
    
    streamRef.current = audioStream;

    // Route audio through AudioWorklet to get raw PCM 16k mono frames
    // Reuse any pre-created context (when mixing) to avoid disconnects
    const audioContext = audioContextRef.current || new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(audioStream);
    sourceRef.current = source;
    
    await audioContext.audioWorklet.addModule('/audio-processor.js');
    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioWorkletNodeRef.current = workletNode;
    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
    
    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('Could not resume audio context:', error);
    }
    
    console.log('✅ Audio capture setup complete');
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
      const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${data.token}`;
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
        
        // Start speaker detection timer (check frequently for better attribution)
        speakerDetectionTimerRef.current = setInterval(() => {
          detectCurrentSpeaker();
        }, 200);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('📨 AssemblyAI message:', msg);

          if (msg.type === 'Turn') {
            const { turn_order, transcript, end_of_turn_confidence, speaker } = msg;
            
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

              // Determine speaker attribution using recent Stream speaking state and AssemblyAI diarization label
              let attributed: { id: string; name: string } | null = null;

              const nowTs = Date.now();
              const recentWindowMs = 1500;

              // 1) Prefer a remote participant who spoke very recently
              const recentRemote = participants
                .filter(p => p.userId !== localParticipant?.userId)
                .map(p => ({ p, ts: recentSpeakingAtRef.current[p.userId] || 0 }))
                .filter(({ ts }) => nowTs - ts <= recentWindowMs)
                .sort((a, b) => b.ts - a.ts);

              if (recentRemote.length > 0) {
                const sel = recentRemote[0].p;
                attributed = {
                  id: sel.userId,
                  name: sel.name || sel.userId?.split('@')[0] || 'Participant',
                };
              }

              // 2) If AssemblyAI provided a diarized speaker label, try to bind that label to the most recent remote speaker
              if (speaker) {
                const label = String(speaker);
                if (!attributed && speakerLabelMapRef.current[label]) {
                  attributed = speakerLabelMapRef.current[label];
                } else if (attributed) {
                  // Bind this label to the chosen participant for future turns
                  speakerLabelMapRef.current[label] = attributed;
                }
              }

              // Fallbacks if we could not attribute via diarization mapping
              if (!attributed) {
                // Prefer an actively speaking remote participant
                const remoteSpeaking = participants.find(p => p.isSpeaking && p.userId !== localParticipant?.userId);
                if (remoteSpeaking) {
                  attributed = {
                    id: remoteSpeaking.userId,
                    name: remoteSpeaking.name || remoteSpeaking.userId?.split('@')[0] || 'Participant',
                  };
                }
              }

              if (!attributed && lastSpeakingParticipantRef.current && lastSpeakingParticipantRef.current.id !== localParticipant?.userId) {
                attributed = lastSpeakingParticipantRef.current;
              }

              if (!attributed) {
                // Final fallback: detected current speaker or local participant
                const cur = currentSpeakerRef.current || {
                  id: localParticipant?.userId || user?.id || 'user-1',
                  name: localParticipant?.name || user?.fullName || 'Speaker',
                };
                attributed = cur;
              }

              const speakerId = attributed.id;
              const speakerName = attributed.name;

              const transcriptWithSpeaker = {
                ...result,
                speakerId,
                speakerName,
                timestamp: new Date()
              };
              
              localTranscriptStorageClient.addTranscript(transcriptWithSpeaker);
              
              // Only show final transcripts in UI (less restrictive)
              if (result.isFinal && result.text.trim().length > 0) {
                setTranscripts(prev => [...prev, result]);
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
