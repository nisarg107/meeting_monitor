// Web Speech API Transcription Service - Completely Free, No API Key Required
// Works directly in the browser using native browser APIs

export interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  speakerId?: string;
  speakerName?: string;
  timestamp?: Date;
}

export class WebSpeechTranscriptionService {
  private recognition: any = null;
  private isSupported: boolean = false;

  constructor() {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.isSupported = !!SpeechRecognition;
    
    if (this.isSupported) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    } else {
      console.warn('⚠️ Web Speech API not supported in this browser. Try Chrome, Edge, or Safari.');
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    // Configuration for better continuous transcription
    this.recognition.continuous = true; // Keep listening continuously
    this.recognition.interimResults = true; // Get interim results for better UX
    this.recognition.lang = 'en-US'; // Language (can be made configurable)
    this.recognition.maxAlternatives = 1;
    
    // Additional settings for better accuracy
    if ('grammars' in this.recognition) {
      // Some browsers support grammars for better accuracy
    }
  }

  /**
   * Check if Web Speech API is supported
   */
  public isBrowserSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Start live transcription
   * @param onTranscript Callback when transcript is received
   * @param onError Optional error callback
   */
  public startTranscription(
    onTranscript: (result: TranscriptionResult) => void,
    onError?: (error: Error) => void
  ): void {
    if (!this.isSupported || !this.recognition) {
      const error = new Error('Web Speech API is not supported in this browser');
      if (onError) onError(error);
      throw error;
    }

    let startTime = Date.now();

    // Handle results - improved for better continuous transcription
    this.recognition.onresult = (event: any) => {
      const now = Date.now();
      
      // Process all results in the event
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultItem = event.results[i];
        const transcript = resultItem[0].transcript;
        const confidence = resultItem[0].confidence || 0.8;
        const isFinal = resultItem.isFinal;

        if (transcript.trim()) {
          // Calculate timing more accurately
          const resultStart = startTime + (i * 100); // Approximate start time
          const resultEnd = now;

          const result: TranscriptionResult = {
            text: transcript.trim(),
            confidence: confidence,
            start: resultStart,
            end: resultEnd,
            isFinal: isFinal,
            timestamp: new Date(resultStart),
          };
          
          // Always send results - let the hook decide what to do with them
          onTranscript(result);
        }
      }
    };

    // Handle errors
    this.recognition.onerror = (event: any) => {
      console.error('Web Speech API error:', event.error);
      let errorMessage = 'Unknown error';
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected';
          break;
        case 'audio-capture':
          errorMessage = 'Microphone not accessible';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission denied';
          break;
        case 'network':
          errorMessage = 'Network error';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      if (onError) {
        onError(new Error(errorMessage));
      }
    };

    // Track if we're manually stopping
    let isManuallyStopped = false;
    
    // Store original stop method
    const originalStop = this.recognition.stop.bind(this.recognition);
    this.recognition.stop = () => {
      isManuallyStopped = true;
      originalStop();
    };

    // Handle end of speech
    this.recognition.onend = () => {
      console.log('Web Speech API recognition ended');
      
      // Auto-restart if it ended unexpectedly (not manually stopped)
      // This keeps transcription continuous
      if (!isManuallyStopped && this.recognition && this.isSupported) {
        // Small delay before restart to avoid rapid restart loops
        setTimeout(() => {
          if (!isManuallyStopped && this.recognition) {
            try {
              this.recognition.start();
              console.log('🔄 Auto-restarted Web Speech API');
            } catch (e) {
              // Already started or stopped, ignore
              console.log('⚠️ Could not auto-restart:', e);
            }
          }
        }, 100);
      } else {
        isManuallyStopped = false; // Reset for next start
      }
    };

    // Start recognition
    try {
      this.recognition.start();
      console.log('✅ Web Speech API transcription started');
    } catch (error) {
      console.error('Failed to start Web Speech API:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Stop transcription
   */
  public stopTranscription(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
        console.log('🛑 Web Speech API transcription stopped');
      } catch (error) {
        console.error('Error stopping Web Speech API:', error);
      }
    }
  }

  /**
   * Change language
   */
  public setLanguage(lang: string): void {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }
}

export default WebSpeechTranscriptionService;

