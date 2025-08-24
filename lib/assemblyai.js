// lib/assemblyai.js
const { AssemblyAI, TranscriptService } = require('assemblyai');

class AssemblyAIService {
  constructor() {
    this.client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY || '',
    });
    this.transcriptService = new TranscriptService(this.client);
  }

  static getInstance() {
    if (!AssemblyAIService.instance) {
      AssemblyAIService.instance = new AssemblyAIService();
    }
    return AssemblyAIService.instance;
  }

  /**
   * Create a live transcription connection.
   * @param {Object} options - Configuration options
   * @param {(result: {text:string, confidence:number, start:number, end:number, isFinal:boolean}) => void} onTranscript
   * @param {(err: Error) => void} [onError]
   */
  async createLiveTranscription(options, onTranscript, onError) {
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
      transcriber.on('open', ({ id }) => {
        console.log('🔓 AssemblyAI live connection opened with ID:', id);
      });

      // Handle AssemblyAI turn events (this is where the actual transcript data comes)
      transcriber.on('turn', (turn) => {
        try {
          console.log('🔍 AssemblyAI turn event received:', turn);
          
          if (!turn.transcript) {
            console.log('⚠️ No transcript in turn event');
            return;
          }

          const result = {
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

      transcriber.on('close', (code, reason) => {
        console.log('🔌 AssemblyAI connection closed:', code, reason);
        console.log('🔍 Close details - Code:', code, 'Reason:', reason);
        
        // If the connection closes unexpectedly, try to understand why
        if (code !== 1000) { // 1000 is normal closure
          console.log('⚠️ Unexpected connection closure - this might indicate an issue');
        }
      });

      transcriber.on('error', (error) => {
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
      
      // Check if the connection is still open
      if (transcriber.readyState === 1) { // 1 = OPEN
        console.log('✅ AssemblyAI connection is OPEN and ready');
      } else {
        console.log('⚠️ AssemblyAI connection state:', transcriber.readyState);
      }
      
      // No heartbeat needed - AssemblyAI handles connection management

      return transcriber;
    } catch (error) {
      throw new Error(`Failed to create live transcription: ${error.message || error}`);
    }
  }

  /**
   * Transcribe prerecorded audio buffer.
   * @param {Buffer} audioBuffer
   */
  async transcribeAudio(audioBuffer) {
    try {
      const response = await this.transcriptService.transcribe({
        audio: audioBuffer,
        sample_rate: 16000,
        formatTurns: true,
      });

      if (response.status === 'completed') {
        const words = response.words || [];
        return words.map((w) => ({
          text: w.text || '',
          confidence: w.confidence || 0,
          start: w.start || 0,
          end: w.end || 0,
          isFinal: true,
        }));
      } else {
        throw new Error(`Transcription failed with status: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to transcribe audio: ${error.message || error}`);
    }
  }
}

module.exports = AssemblyAIService;
