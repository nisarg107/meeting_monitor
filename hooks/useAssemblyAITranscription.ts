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

  // Detect current speaker using Stream participant state
  const detectCurrentSpeaker = useCallback(() => {
    const speakingParticipants = participants.filter(p => p.isSpeaking);
    
    if (speakingParticipants.length > 0) {
      const currentSpeaker = speakingParticipants[0];
      currentSpeakerRef.current = {
        id: currentSpeaker.userId,
        name: currentSpeaker.name || currentSpeaker.userId?.split('@')[0] || 'Speaker'
      };
    } else if (localParticipant?.isSpeaking) {
      currentSpeakerRef.current = {
        id: localParticipant.userId,
        name: localParticipant.name || localParticipant.userId?.split('@')[0] || 'Speaker'
      };
    } else {
      // Fallback to local participant
      currentSpeakerRef.current = {
        id: localParticipant?.userId || user?.id || 'user-1',
        name: localParticipant?.name || user?.fullName || 'Speaker'
      };
    }
  }, [participants, localParticipant, user]);

  // Setup audio capture using the working captions approach
  const setupAudioCapture = useCallback(async () => {
    console.log('🎤 Setting up audio capture...');
    
    // Try to capture system/tab audio to include all participants
    let audioStream: MediaStream | null = null;
    try {
      audioStream = await (navigator.mediaDevices as any).getDisplayMedia({
        audio: true,
        video: false,
      });
      console.log('🎵 Got system audio stream (includes all participants)');
    } catch (e) {
      console.warn('⚠️ Could not get system audio, falling back to local microphone:', e);
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('🎤 Got local microphone stream');
      } catch (micErr) {
        throw new Error('Could not capture audio for transcription');
      }
    }
    
    if (!audioStream) {
      throw new Error('No audio stream available for transcription');
    }
    
    streamRef.current = audioStream;

    // Route audio through AudioWorklet to get raw PCM 16k mono frames
    const audioContext = new AudioContext({ sampleRate: 16000 });
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
        
        // Start speaker detection timer (check every 500ms)
        speakerDetectionTimerRef.current = setInterval(() => {
          detectCurrentSpeaker();
        }, 500);
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

              // Use detected current speaker
              const currentSpeaker = currentSpeakerRef.current || {
                id: localParticipant?.userId || user?.id || 'user-1',
                name: localParticipant?.name || user?.fullName || 'Speaker'
              };
              
              const speakerId = currentSpeaker.id;
              const speakerName = currentSpeaker.name;

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
