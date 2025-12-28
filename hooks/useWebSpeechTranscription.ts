import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCall, useCallStateHooks } from '@stream-io/video-react-sdk';
import WebSpeechTranscriptionService, { TranscriptionResult } from '@/lib/web-speech-transcription';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

export const useWebSpeechTranscription = (meetingId: string) => {
  const { user } = useUser();
  const call = useCall();
  const { useLocalParticipant, useParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTranscriptPath, setSavedTranscriptPath] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const serviceRef = useRef<WebSpeechTranscriptionService | null>(null);
  const participantsRef = useRef(participants);
  const localParticipantRef = useRef(localParticipant);
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSpeakerRef = useRef<{ id: string; name: string; timestamp: number } | null>(null);
  type SpeakingSample = { ts: number; speakerId: string; speakerName: string };
  const speakingHistoryRef = useRef<SpeakingSample[]>([]);

  useEffect(() => { 
    participantsRef.current = participants; 
  }, [participants]);
  
  useEffect(() => { 
    localParticipantRef.current = localParticipant; 
  }, [localParticipant]);

  // Initialize service and check support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const service = new WebSpeechTranscriptionService();
      serviceRef.current = service;
      setIsSupported(service.isBrowserSupported());
    }
  }, []);

  // Detect current speaker with continuous tracking
  const detectCurrentSpeaker = useCallback(() => {
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;
    const now = Date.now();
    
    // Priority: remote participants speaking > local participant speaking > last known speaker > fallback
    const speakingParticipants = parts.filter(p => p.isSpeaking);
    
    let detectedSpeaker: { id: string; name: string } | null = null;
    
    if (speakingParticipants.length > 0) {
      // Remote participant is speaking - prioritize them
      const currentSpeaker = speakingParticipants[0];
      detectedSpeaker = {
        id: currentSpeaker.userId,
        name: currentSpeaker.name || currentSpeaker.userId?.split('@')[0] || `User ${currentSpeaker.userId}`
      };
    } else if (local?.isSpeaking) {
      // Local participant is speaking
      detectedSpeaker = {
        id: local.userId,
        name: local.name || local.userId?.split('@')[0] || 'You'
      };
    } else if (currentSpeakerRef.current) {
      // Use last known speaker (within last 2 seconds)
      const timeSinceLastSpeaker = now - currentSpeakerRef.current.timestamp;
      if (timeSinceLastSpeaker < 2000) {
        detectedSpeaker = {
          id: currentSpeakerRef.current.id,
          name: currentSpeakerRef.current.name
        };
      }
    }
    
    // Fallback to local participant
    if (!detectedSpeaker) {
      detectedSpeaker = {
        id: local?.userId || user?.id || 'user-1',
        name: local?.name || user?.fullName || 'Speaker'
      };
    }
    
    // Update current speaker ref
    currentSpeakerRef.current = {
      ...detectedSpeaker,
      timestamp: now
    };
    
    // Add to speaking history (keep last 10 seconds)
    speakingHistoryRef.current.push({
      ts: now,
      speakerId: detectedSpeaker.id,
      speakerName: detectedSpeaker.name
    });
    
    // Clean up old history (keep last 10 seconds)
    const cutoff = now - 10000;
    speakingHistoryRef.current = speakingHistoryRef.current.filter(s => s.ts > cutoff);
    
    return detectedSpeaker;
  }, [user]);

  // Get speaker at a specific timestamp
  const getSpeakerAtTime = useCallback((timestamp: number) => {
    // Find the closest speaking sample to the timestamp
    const history = speakingHistoryRef.current;
    if (history.length === 0) {
      return currentSpeakerRef.current || {
        id: localParticipantRef.current?.userId || user?.id || 'user-1',
        name: localParticipantRef.current?.name || user?.fullName || 'Speaker'
      };
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
    return currentSpeakerRef.current || {
      id: localParticipantRef.current?.userId || user?.id || 'user-1',
      name: localParticipantRef.current?.name || user?.fullName || 'Speaker'
    };
  }, [user]);

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (!user || !meetingId || !serviceRef.current) return;

    if (!isSupported) {
      setError('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

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

      // Start continuous speaker detection timer (sample every 200ms)
      if (speakerDetectionTimerRef.current) {
        clearInterval(speakerDetectionTimerRef.current);
      }
      
      speakerDetectionTimerRef.current = setInterval(() => {
        detectCurrentSpeaker();
      }, 200);

      // Start Web Speech API transcription
      serviceRef.current.startTranscription(
        (result: TranscriptionResult) => {
          // Process both final and interim results, but prioritize final
          if (result.text.trim()) {
            // Get speaker at the time the audio was captured (use start time)
            const captureTime = result.start || Date.now();
            const speaker = getSpeakerAtTime(captureTime);
            
            const transcriptWithSpeaker: TranscriptionResult = {
              ...result,
              speakerId: speaker.id,
              speakerName: speaker.name,
              timestamp: new Date(captureTime)
            };
            
            // Only store final results to avoid duplicates
            if (result.isFinal) {
              localTranscriptStorageClient.addTranscript(transcriptWithSpeaker);
              setTranscripts(prev => {
                // Remove any interim results with similar text and add final
                const filtered = prev.filter(t => 
                  !t.isFinal || Math.abs((t.start || 0) - captureTime) > 1000
                );
                return [...filtered, transcriptWithSpeaker];
              });
              
              console.log('✅ Transcript received:', { 
                text: result.text, 
                speakerId: speaker.id, 
                speakerName: speaker.name,
                isFinal: result.isFinal
              });
            } else {
              // Show interim results in UI but don't save yet
              setTranscripts(prev => {
                // Replace interim results with same timestamp
                const filtered = prev.filter(t => 
                  t.isFinal || Math.abs((t.start || 0) - captureTime) > 500
                );
                return [...filtered, transcriptWithSpeaker];
              });
            }
          }
        },
        (err: Error) => {
          console.error('Transcription error:', err);
          setError(err.message);
          setIsTranscribing(false);
        }
      );

      console.log('✅ Web Speech API transcription started with continuous speaker detection');
    } catch (err) {
      console.error('Failed to start transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
      setIsTranscribing(false);
    }
  }, [user, meetingId, isSupported, localParticipant, participants, detectCurrentSpeaker]);

  // Stop transcription
  const stopTranscription = useCallback(() => {
    console.log('🛑 Stopping transcription...');
    
    // Clear speaker detection timer
    if (speakerDetectionTimerRef.current) {
      clearInterval(speakerDetectionTimerRef.current);
      speakerDetectionTimerRef.current = null;
    }
    
    // Clear speaking history
    speakingHistoryRef.current = [];
    currentSpeakerRef.current = null;
    
    if (serviceRef.current) {
      serviceRef.current.stopTranscription();
    }

    // Save transcript to local file
    const savedPath = localTranscriptStorageClient.endMeeting();
    if (savedPath) {
      setSavedTranscriptPath(savedPath);
      console.log('💾 Transcript saved to:', savedPath);
    }

    setIsTranscribing(false);
    console.log('✅ Transcription stopped');
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    console.log('🧹 Clearing transcripts...');
    
    stopTranscription();
    setTranscripts([]);
    setSavedTranscriptPath(null);
    
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
    isSupported,
  };
};

