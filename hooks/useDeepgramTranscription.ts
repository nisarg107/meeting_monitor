import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCall, useCallStateHooks } from '@stream-io/video-react-sdk';
import DeepgramTranscriptionService, { TranscriptionResult } from '@/lib/deepgram-transcription';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

export const useDeepgramTranscription = (meetingId: string) => {
  const { user } = useUser();
  const call = useCall();
  const { useLocalParticipant, useParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTranscriptPath, setSavedTranscriptPath] = useState<string | null>(null);

  const serviceRef = useRef<DeepgramTranscriptionService | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixBusRef = useRef<GainNode | null>(null);
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const rescanTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Speaker mapping: Deepgram speaker labels -> participant info
  const speakerMapRef = useRef<Map<number, { id: string; name: string }>>(new Map());
  const participantsRef = useRef(participants);
  const localParticipantRef = useRef(localParticipant);
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  type SpeakingSample = { ts: number; speakerId: string; speakerName: string };
  const speakingHistoryRef = useRef<SpeakingSample[]>([]);

  useEffect(() => { 
    participantsRef.current = participants; 
  }, [participants]);
  
  useEffect(() => { 
    localParticipantRef.current = localParticipant; 
  }, [localParticipant]);

  // Detect current speaker continuously - with better logging
  const detectCurrentSpeaker = useCallback((): { id: string; name: string } => {
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;
    const now = Date.now();
    
    // Priority: remote participants speaking > local participant speaking
    const speakingParticipants = parts.filter(p => p.isSpeaking);
    
    let detectedSpeaker: { id: string; name: string };
    
    if (speakingParticipants.length > 0) {
      // Remote participant is speaking - get the first one
      const speaker = speakingParticipants[0];
      detectedSpeaker = {
        id: speaker.userId,
        name: speaker.name || speaker.userId?.split('@')[0] || `User ${speaker.userId}`
      };
      // Log occasionally to verify it's working
      if (Math.random() < 0.1) {
        console.log(`🎤 Detected remote speaker: ${detectedSpeaker.name} (${detectedSpeaker.id})`);
      }
    } else if (local?.isSpeaking) {
      // Local participant is speaking
      detectedSpeaker = {
        id: local.userId,
        name: local.name || local.userId?.split('@')[0] || 'You'
      };
      // Log occasionally
      if (Math.random() < 0.1) {
        console.log(`🎤 Detected local speaker: ${detectedSpeaker.name} (${detectedSpeaker.id})`);
      }
    } else {
      // No one is currently speaking - use last known speaker from history
      if (speakingHistoryRef.current.length > 0) {
        const lastSpeaker = speakingHistoryRef.current[speakingHistoryRef.current.length - 1];
        const timeSinceLastSpeaker = now - lastSpeaker.ts;
        if (timeSinceLastSpeaker < 5000) { // Within last 5 seconds
          detectedSpeaker = {
            id: lastSpeaker.speakerId,
            name: lastSpeaker.speakerName
          };
        } else {
          // Too long ago - don't assume, but we'll still use it as fallback
          detectedSpeaker = {
            id: lastSpeaker.speakerId,
            name: lastSpeaker.speakerName
          };
        }
      } else {
        // No history - fallback to local participant (but this should be rare)
        detectedSpeaker = {
          id: local?.userId || user?.id || 'user-1',
          name: local?.name || user?.fullName || 'Speaker'
        };
      }
    }
    
    // Add to speaking history (only if different from last entry to avoid duplicates)
    const lastEntry = speakingHistoryRef.current[speakingHistoryRef.current.length - 1];
    if (!lastEntry || lastEntry.speakerId !== detectedSpeaker.id || (now - lastEntry.ts) > 500) {
      speakingHistoryRef.current.push({
        ts: now,
        speakerId: detectedSpeaker.id,
        speakerName: detectedSpeaker.name
      });
    }
    
    // Keep last 20 seconds of history (increased for better accuracy)
    const cutoff = now - 20000;
    speakingHistoryRef.current = speakingHistoryRef.current.filter(s => s.ts > cutoff);
    
    return detectedSpeaker;
  }, [user]);

  // Get speaker at a specific timestamp
  const getSpeakerAtTime = useCallback((timestamp: number): { id: string; name: string } => {
    const history = speakingHistoryRef.current;
    if (history.length === 0) {
      return detectCurrentSpeaker();
    }
    
    // Find the sample closest to the timestamp (within 2 seconds)
    const timeWindow = 2000;
    const relevantSamples = history.filter(s => Math.abs(s.ts - timestamp) < timeWindow);
    
    if (relevantSamples.length > 0) {
      // Get the most recent sample before or at the timestamp
      const closest = relevantSamples.reduce((prev, curr) => 
        Math.abs(curr.ts - timestamp) < Math.abs(prev.ts - timestamp) ? curr : prev
      );
      
      return {
        id: closest.speakerId,
        name: closest.speakerName
      };
    }
    
    // Fallback to current speaker
    return detectCurrentSpeaker();
  }, [detectCurrentSpeaker]);

  // Map Deepgram speaker labels to actual participants
  const mapSpeakerLabel = useCallback((speakerLabel: number | undefined, transcriptTimestamp: number): { id: string; name: string } => {
    // If no speaker label from Deepgram, use speaking history
    if (speakerLabel === undefined) {
      console.log('⚠️ No speaker label from Deepgram, using speaking history');
      return getSpeakerAtTime(transcriptTimestamp);
    }

    // ALWAYS use existing mapping if it exists - Deepgram's speaker labels are consistent
    if (speakerMapRef.current.has(speakerLabel)) {
      const mapped = speakerMapRef.current.get(speakerLabel)!;
      console.log(`🔗 Using existing mapping: Speaker ${speakerLabel} → ${mapped.name} (${mapped.id})`);
      return mapped;
    }

    // New speaker label - map it to whoever is currently speaking
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;
    const speakingParticipants = parts.filter(p => p.isSpeaking);
    
    let speakerToMap: { id: string; name: string };
    
    // Priority: remote participants > local participant > last known speaker
    if (speakingParticipants.length > 0) {
      // Remote participant is speaking - use them
      const speaker = speakingParticipants[0];
      speakerToMap = {
        id: speaker.userId,
        name: speaker.name || speaker.userId?.split('@')[0] || `User ${speaker.userId}`
      };
      console.log(`🎯 Mapping Speaker ${speakerLabel} to remote participant: ${speakerToMap.name}`);
    } else if (local?.isSpeaking) {
      // Local participant is speaking
      speakerToMap = {
        id: local.userId,
        name: local.name || local.userId?.split('@')[0] || 'You'
      };
      console.log(`🎯 Mapping Speaker ${speakerLabel} to local participant: ${speakerToMap.name}`);
    } else {
      // No one currently speaking - check speaking history
      const speakerAtTime = getSpeakerAtTime(transcriptTimestamp);
      
      // Check if this participant already has a different speaker label
      const existingMappings = Array.from(speakerMapRef.current.entries());
      const existingMapping = existingMappings.find(([_, info]) => info.id === speakerAtTime.id);
      
      if (existingMapping && existingMapping[0] !== speakerLabel) {
        // This participant already has a different speaker label - this is a new participant
        // Use the last known speaker from history, or create a new mapping
        if (speakingHistoryRef.current.length > 0) {
          const lastSpeaker = speakingHistoryRef.current[speakingHistoryRef.current.length - 1];
          speakerToMap = {
            id: lastSpeaker.speakerId,
            name: lastSpeaker.speakerName
          };
          console.log(`🎯 Mapping Speaker ${speakerLabel} to last known speaker: ${speakerToMap.name}`);
        } else {
          // Fallback - but this shouldn't happen often
          speakerToMap = {
            id: local?.userId || user?.id || `speaker-${speakerLabel}`,
            name: local?.name || user?.fullName || `Speaker ${speakerLabel}`
          };
          console.log(`⚠️ Fallback mapping Speaker ${speakerLabel} to: ${speakerToMap.name}`);
        }
      } else {
        speakerToMap = speakerAtTime;
        console.log(`🎯 Mapping Speaker ${speakerLabel} to speaker at time: ${speakerToMap.name}`);
      }
    }
    
    // Store the mapping - this is permanent for this session
    speakerMapRef.current.set(speakerLabel, speakerToMap);
    console.log(`✅ NEW MAPPING CREATED: Deepgram Speaker ${speakerLabel} → ${speakerToMap.name} (${speakerToMap.id})`);
    console.log(`📊 All current mappings:`, Array.from(speakerMapRef.current.entries()).map(([label, info]) => 
      `Speaker ${label}: ${info.name} (${info.id})`
    ));
    
    return speakerToMap;
  }, [getSpeakerAtTime, user]);

  // Helper: attach a MediaStream to graph
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
      const container = document.querySelector('[class*="str-video"]') || document.body;
      const mediaEls = Array.from(container.querySelectorAll('video, audio')) as (HTMLVideoElement | HTMLAudioElement)[];
      mediaEls.forEach((el, idx) => {
        let mediaStream: MediaStream | null = null;
        try {
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

  // Setup audio capture by mixing mic + remote elements
  const setupAudioCapture = useCallback(async () => {
    console.log('🎤 Deepgram: Setting up audio capture...');
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      console.log('✅ Deepgram: AudioContext created, sample rate:', audioContext.sampleRate);

      console.log('📦 Deepgram: Loading audio worklet module...');
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      console.log('✅ Deepgram: Audio worklet module loaded');
      
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      audioWorkletNodeRef.current = workletNode;
      console.log('✅ Deepgram: AudioWorkletNode created');

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

      // 1) Attach local microphone
      try {
        console.log('🎙️ Deepgram: Requesting microphone access...');
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = mic;
        console.log('✅ Deepgram: Microphone access granted');
        console.log('🎙️ Deepgram: Audio tracks:', mic.getAudioTracks().length);
        
        const micSrc = audioContext.createMediaStreamSource(mic);
        sourceRef.current = micSrc;
        micSrc.connect(mixBus);
        console.log('✅ Deepgram: Local microphone attached to mix bus');
      } catch (micErr) {
        console.error('❌ Deepgram: Microphone not available:', micErr);
        throw micErr;
      }

      // 2) Attach remote participant audio
      console.log('🔍 Deepgram: Scanning for remote audio sources...');
      scanAndAttachRemoteAudio();
      console.log('✅ Deepgram: Initial remote audio scan complete');
      
      if (rescanTimerRef.current) clearInterval(rescanTimerRef.current);
      rescanTimerRef.current = setInterval(() => {
        console.log('🔍 Deepgram: Rescanning for remote audio...');
        scanAndAttachRemoteAudio();
      }, 1500);
      console.log('✅ Deepgram: Remote audio rescan timer set (every 1.5s)');

      try {
        console.log('▶️ Deepgram: Resuming audio context...');
        await audioContext.resume();
        console.log('✅ Deepgram: Audio context resumed, state:', audioContext.state);
      } catch (error) {
        console.error('❌ Deepgram: Could not resume audio context:', error);
        throw error;
      }
      console.log('✅ Deepgram: Audio mixing setup complete');
    } catch (error) {
      console.error('❌ Deepgram: Audio capture setup failed:', error);
      throw error;
    }
  }, [scanAndAttachRemoteAudio]);

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (!user || !meetingId) return;

      console.log('🚀 Deepgram: Starting transcription setup...');
      
      // Get Deepgram API key from environment (client-side)
      const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
      console.log('🔑 Deepgram: API key from env?', !!apiKey);
      console.log('🔑 Deepgram: API key length:', apiKey ? apiKey.length : 0);

    try {
      setIsTranscribing(true);
      setError(null);

      // Get all participants
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

      // Start local transcript storage session
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

      // Get Deepgram API key from server (or use env directly)
      let deepgramApiKey = apiKey;
      console.log('🔑 Deepgram: Initial API key check:', {
        hasApiKey: !!deepgramApiKey,
        length: deepgramApiKey ? deepgramApiKey.length : 0
      });
      
      if (!deepgramApiKey) {
        console.log('🔑 Deepgram: No API key in env, fetching from server...');
        try {
          const response = await fetch('/api/deepgram-token', { cache: 'no-store' });
          console.log('🔑 Deepgram: Server response status:', response.status);
          const data = await response.json();
          console.log('🔑 Deepgram: Server response data:', { hasApiKey: !!data.apiKey });
          if (data.apiKey) {
            deepgramApiKey = data.apiKey;
            console.log('✅ Deepgram: API key retrieved from server');
          } else {
            console.error('❌ Deepgram: No API key in server response');
            throw new Error('Failed to get Deepgram API key from server');
          }
        } catch (fetchError) {
          console.error('❌ Deepgram: Error fetching API key:', fetchError);
          throw new Error('Could not retrieve Deepgram API key. Please check your configuration.');
        }
      } else {
        console.log('✅ Deepgram: Using API key from environment');
      }

      // Setup audio capture (mixed: local mic + remote participants)
      try {
        console.log('🎤 Deepgram: Setting up audio capture...');
        await setupAudioCapture();
        console.log('✅ Deepgram: Audio capture setup complete');
      } catch (error) {
        console.error('❌ Deepgram: Audio capture setup failed:', error);
        throw error;
      }

      // Initialize Deepgram service
      if (!deepgramApiKey) {
        throw new Error('Deepgram API key is required but not found');
      }
      
      console.log('🔧 Deepgram: Initializing service with API key...');
      const deepgramService = new DeepgramTranscriptionService(deepgramApiKey);
      serviceRef.current = deepgramService;

      // Start continuous speaker detection
      if (speakerDetectionTimerRef.current) {
        clearInterval(speakerDetectionTimerRef.current);
      }
      
      speakerDetectionTimerRef.current = setInterval(() => {
        detectCurrentSpeaker();
      }, 200);
      console.log('✅ Deepgram: Continuous speaker detection started');

      // Start Deepgram transcription
      console.log('🎙️ Deepgram: Starting transcription service...');
      deepgramService.startTranscription(
        (result: TranscriptionResult) => {
          // Map Deepgram speaker label to actual participant using transcript timestamp
          const transcriptTime = result.start || Date.now();
          const speaker = mapSpeakerLabel(result.speakerLabel, transcriptTime);
          
          const transcriptWithSpeaker: TranscriptionResult = {
            ...result,
            speakerId: speaker.id,
            speakerName: speaker.name,
            timestamp: new Date(result.start)
          };
          
          // Only store final results to avoid duplicates
          if (result.isFinal && result.text.trim()) {
            localTranscriptStorageClient.addTranscript(transcriptWithSpeaker);
            setTranscripts(prev => {
              // Remove any interim results with similar timing
              const filtered = prev.filter(t => 
                !t.isFinal || Math.abs((t.start || 0) - result.start) > 1000
              );
              return [...filtered, transcriptWithSpeaker];
            });
            
            console.log('✅ Deepgram transcript received:', { 
              text: result.text, 
              speakerId: speaker.id, 
              speakerName: speaker.name,
              speakerLabel: result.speakerLabel
            });
          } else if (!result.isFinal) {
            // Show interim results
            setTranscripts(prev => {
              const filtered = prev.filter(t => 
                t.isFinal || Math.abs((t.start || 0) - result.start) > 500
              );
              return [...filtered, transcriptWithSpeaker];
            });
          }
        },
        (err: Error) => {
          console.error('Deepgram transcription error:', err);
          setError(err.message);
          setIsTranscribing(false);
        }
      );

      // Setup audio streaming to Deepgram
      if (audioWorkletNodeRef.current) {
        console.log('🎤 Deepgram: Setting up audio worklet message handler...');
        let audioChunkCount = 0;
        let lastSentTime = Date.now();
        
        // Wait a bit for WebSocket to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        audioWorkletNodeRef.current.port.onmessage = (event) => {
          try {
            audioChunkCount++;
            const now = Date.now();
            
            // Check if service is connected before sending
            if (deepgramService.isConnectedToService()) {
              const audioBuffer = event.data.audio_data;
              deepgramService.sendAudio(audioBuffer);
              lastSentTime = now;
              
              // Log every 100 chunks to show it's working
              if (audioChunkCount % 100 === 0) {
                console.log('🎤 Deepgram: Sent', audioChunkCount, 'audio chunks');
              }
            } else {
              // Only log occasionally to avoid spam
              if (now - lastSentTime > 2000) {
                console.warn('⚠️ Deepgram: Audio chunks received but service not connected. Chunks:', audioChunkCount);
                console.warn('⚠️ Deepgram: WebSocket state:', {
                  hasService: !!deepgramService,
                  isConnected: deepgramService.isConnectedToService(),
                  readyState: (deepgramService as any).ws?.readyState
                });
                lastSentTime = now;
              }
            }
          } catch (sendErr) {
            console.error('❌ Deepgram: Failed to send audio chunk:', sendErr);
          }
        };
        console.log('✅ Deepgram: Audio worklet handler set up');
        
        // Send a small silence chunk immediately to keep connection alive
        setTimeout(() => {
          if (deepgramService.isConnectedToService()) {
            console.log('🎤 Deepgram: Sending initial audio to keep connection alive...');
            // Send a small silence buffer (3200 bytes = 100ms at 16kHz)
            const silence = new Int16Array(1600).buffer; // 100ms of silence
            deepgramService.sendAudio(silence);
          }
        }, 100);
      } else {
        console.error('❌ Deepgram: Audio worklet node not available!');
      }

      console.log('✅ Deepgram transcription started with mixed audio capture');
    } catch (err) {
      console.error('Failed to start transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
      setIsTranscribing(false);
    }
  }, [user, meetingId, setupAudioCapture, mapSpeakerLabel, localParticipant, participants]);

  // Stop transcription
  const stopTranscription = useCallback(() => {
    console.log('🛑 Stopping Deepgram transcription...');
    
    // Clear speaker detection timer
    if (speakerDetectionTimerRef.current) {
      clearInterval(speakerDetectionTimerRef.current);
      speakerDetectionTimerRef.current = null;
    }
    
    // Clear speaking history
    speakingHistoryRef.current = [];
    
    if (serviceRef.current) {
      serviceRef.current.stopTranscription();
      serviceRef.current = null;
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

    if (rescanTimerRef.current) {
      clearInterval(rescanTimerRef.current);
      rescanTimerRef.current = null;
    }

    // Clear speaker mappings
    speakerMapRef.current.clear();

    // Save transcript to local file
    const savedPath = localTranscriptStorageClient.endMeeting();
    if (savedPath) {
      setSavedTranscriptPath(savedPath);
      console.log('💾 Transcript saved to:', savedPath);
    }

    setIsTranscribing(false);
    console.log('✅ Deepgram transcription stopped and cleaned up');
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    console.log('🧹 Clearing transcripts...');
    
    stopTranscription();
    setTranscripts([]);
    setSavedTranscriptPath(null);
    speakerMapRef.current.clear();
    
    // Reset local storage session
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
  }, [meetingId, localParticipant, participants, stopTranscription]);

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

