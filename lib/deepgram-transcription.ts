// Deepgram Transcription Service - Free tier: 200 hours/month
// Supports speaker diarization for multiple speakers

export interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  speakerId?: string;
  speakerName?: string;
  timestamp?: Date;
  speakerLabel?: number; // Deepgram's speaker label
}

export class DeepgramTranscriptionService {
  private apiKey: string;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Start live transcription with Deepgram
   * @param onTranscript Callback when transcript is received
   * @param onError Optional error callback
   */
  public startTranscription(
    onTranscript: (result: TranscriptionResult) => void,
    onError?: (error: Error) => void
  ): void {
    console.log('🔧 Deepgram: Starting transcription...');
    console.log('🔑 Deepgram: API key present?', !!this.apiKey);
    console.log('🔑 Deepgram: API key length:', this.apiKey ? this.apiKey.length : 0);
    
    if (!this.apiKey) {
      const error = new Error('Deepgram API key is required');
      console.error('❌ Deepgram: No API key provided');
      if (onError) onError(error);
      throw error;
    }

    // Deepgram real-time API endpoint
    // Important: Specify encoding and sample_rate for proper audio format
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&punctuate=true&diarize=true&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1`;
    console.log('🔗 Deepgram: Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***'));

    try {
      this.ws = new WebSocket(wsUrl, ['token', this.apiKey]);
      console.log('🔌 Deepgram: WebSocket created, waiting for connection...');

      this.ws.onopen = () => {
        console.log('✅ Deepgram: WebSocket connected successfully!');
        console.log('✅ Deepgram: Ready to receive audio data');
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Deepgram: Message received, type:', data.type);
          
          if (data.type === 'Results') {
            console.log('📝 Deepgram: Processing results...', {
              is_final: data.is_final,
              has_channel: !!data.channel,
              has_alternatives: !!data.channel?.alternatives
            });
            const channel = data.channel;
            const alternatives = channel?.alternatives || [];
            
            if (alternatives.length > 0) {
              const transcript = alternatives[0].transcript;
              const words = alternatives[0].words || [];
              const isFinal = data.is_final || false;
              
              if (transcript && transcript.trim()) {
                // Get speaker label from words (Deepgram provides speaker labels)
                const speakerLabel = words.length > 0 ? words[0].speaker : undefined;
                
                // Calculate timing
                const start = words.length > 0 ? words[0].start * 1000 : Date.now();
                const end = words.length > 0 ? words[words.length - 1].end * 1000 : Date.now();
                const confidence = alternatives[0].confidence || 0.8;

                console.log('✅ Deepgram: Transcript received:', {
                  text: transcript.trim(),
                  isFinal,
                  speakerLabel,
                  confidence,
                  wordCount: words.length
                });

                const result: TranscriptionResult = {
                  text: transcript.trim(),
                  confidence: confidence,
                  start: start,
                  end: end,
                  isFinal: isFinal,
                  speakerLabel: speakerLabel,
                  timestamp: new Date(start),
                };

                onTranscript(result);
              } else {
                console.log('⚠️ Deepgram: Empty transcript, skipping');
              }
            }
          } else if (data.type === 'Metadata') {
            console.log('📊 Deepgram metadata:', data);
          } else if (data.type === 'Error') {
            console.error('❌ Deepgram error:', data);
            if (onError) {
              onError(new Error(data.message || 'Deepgram API error'));
            }
          }
        } catch (error) {
          console.error('Error parsing Deepgram message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Deepgram: WebSocket error event:', error);
        console.error('❌ Deepgram: Error details:', {
          type: error.type,
          target: error.target
        });
        if (onError) {
          onError(new Error('Deepgram WebSocket connection error'));
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 Deepgram: WebSocket closed');
        console.log('🔌 Deepgram: Close code:', event.code);
        console.log('🔌 Deepgram: Close reason:', event.reason || 'No reason provided');
        console.log('🔌 Deepgram: Was clean:', event.wasClean);
        this.isConnected = false;
        
        // Don't auto-reconnect - let the hook handle reconnection
        // Auto-reconnection can cause issues with audio streaming
        if (event.code === 1011) {
          console.error('❌ Deepgram: Connection timeout - Deepgram did not receive audio in time');
          if (onError) {
            onError(new Error('Deepgram connection timeout. Make sure audio is being sent continuously.'));
          }
        }
      };

    } catch (error) {
      console.error('Failed to create Deepgram connection:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Send audio data to Deepgram
   * @param audioBuffer PCM16 audio buffer
   */
  public sendAudio(audioBuffer: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Deepgram expects binary audio data
        this.ws.send(audioBuffer);
        this.isConnected = true; // Update connection state
        // Log occasionally to avoid spam (every 100th chunk)
        if (Math.random() < 0.01) {
          console.log('🎤 Deepgram: Audio chunk sent, size:', audioBuffer.byteLength, 'bytes');
        }
      } catch (error) {
        console.error('❌ Deepgram: Error sending audio:', error);
        this.isConnected = false;
      }
    } else {
      // Don't log every time to avoid spam, but track the issue
      if (Math.random() < 0.005) { // Very infrequent logging
        console.warn('⚠️ Deepgram: Cannot send audio - WebSocket not ready', {
          hasWs: !!this.ws,
          isConnected: this.isConnected,
          readyState: this.ws?.readyState
        });
      }
    }
  }

  /**
   * Stop transcription
   */
  public stopTranscription(): void {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          // Send close frame
          this.ws.close(1000, 'Normal closure');
        }
        this.ws = null;
        this.isConnected = false;
        console.log('🛑 Deepgram transcription stopped');
      } catch (error) {
        console.error('Error stopping Deepgram:', error);
      }
    }
  }

  /**
   * Check if connected
   */
  public isConnectedToService(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export default DeepgramTranscriptionService;

