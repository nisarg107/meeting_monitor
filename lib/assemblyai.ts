import { AssemblyAI } from 'assemblyai';

export interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
}

export class AssemblyAIService {
  private static instance: AssemblyAIService | null = null;
  private client: AssemblyAI;

  private constructor() {
    this.client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY || '',
    });
  }

  public static getInstance(): AssemblyAIService {
    if (!AssemblyAIService.instance) {
      AssemblyAIService.instance = new AssemblyAIService();
    }
    return AssemblyAIService.instance;
  }

  /**
   * Create a live transcription connection
   * @param options Configuration options
   * @param onTranscript callback when new transcript arrives
   * @param onError optional error callback
   */
  public async createLiveTranscription(
    options: any,
    onTranscript: (result: TranscriptionResult) => void,
    onError?: (error: Error) => void
  ): Promise<any> {
    try {
      console.log('🔧 Creating AssemblyAI connection (API key present?):', !!process.env.ASSEMBLYAI_API_KEY);
      
      const CONNECTION_PARAMS = {
        sampleRate: options.sample_rate || 16000,
        formatTurns: true,
        endOfTurnConfidenceThreshold: 0.7,
        minEndOfTurnSilenceWhenConfident: 160,
        maxTurnSilence: 2400
      };

      const transcriber = this.client.streaming.transcriber(CONNECTION_PARAMS);

      // --- WebSocket events ---
      transcriber.on('open', ({ id }: { id: string }) => {
        console.log('🔓 AssemblyAI live connection opened with ID:', id);
      });

      // Handle AssemblyAI turn events (this is where the actual transcript data comes)
      transcriber.on('turn', (turn: any) => {
        try {
          console.log('🔍 AssemblyAI turn event received:', turn);
          
          if (!turn.transcript) {
            console.log('⚠️ No transcript in turn event');
            return;
          }

          const result: TranscriptionResult = {
            text: turn.transcript,
            confidence: turn.confidence || 0,
            start: turn.start || 0,
            end: turn.end || 0,
            isFinal: turn.isFinal || false,
          };

          if (result.text.trim()) {
            console.log('✅ Sending transcript to client:', result);
            onTranscript(result);
          }
        } catch (err) {
          console.error('❌ Error processing AssemblyAI turn:', err);
        }
      });

      transcriber.on('close', (code: number, reason: string) => {
        console.log('🔌 AssemblyAI connection closed:', code, reason);
        console.log('🔍 Close details - Code:', code, 'Reason:', reason);
        
        // If the connection closes unexpectedly, try to understand why
        if (code !== 1000) { // 1000 is normal closure
          console.log('⚠️ Unexpected connection closure - this might indicate an issue');
        }
      });

      transcriber.on('error', (error: any) => {
        console.error('❌ AssemblyAI connection error:', error);
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      });

      // Connect to the streaming service
      await transcriber.connect();
      console.log('✅ AssemblyAI streaming connection established');
      
      // Add a small delay to ensure the connection is fully established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('✅ AssemblyAI connection established');
      
      // No heartbeat needed - AssemblyAI handles connection management

      return transcriber;
    } catch (error) {
      throw new Error(`Failed to create live transcription: ${error}`);
    }
  }

  /**
   * Transcribe prerecorded audio buffer
   * Note: This method is currently disabled due to API changes
   */
  public async transcribeAudio(audioBuffer: Buffer): Promise<TranscriptionResult[]> {
    // TODO: Update this method when AssemblyAI API is properly configured
    throw new Error('TranscribeAudio method is not currently implemented');
  }
}

export default AssemblyAIService;
