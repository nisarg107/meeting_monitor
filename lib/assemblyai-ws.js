// lib/assemblyai-ws.js - Pure WebSocket implementation for AssemblyAI
import WebSocket from 'ws';
import querystring from 'querystring';

class AssemblyAIWebSocketService {
  constructor() {
    this.apiKey = process.env.ASSEMBLYAI_API_KEY || '';
  // Use v3 universal streaming websocket endpoint
  this.baseUrl = 'wss://streaming.assemblyai.com/v3/ws';
  }

  static getInstance() {
    if (!AssemblyAIWebSocketService.instance) {
      AssemblyAIWebSocketService.instance = new AssemblyAIWebSocketService();
    }
    return AssemblyAIWebSocketService.instance;
  }

  /**
   * Create a live transcription connection using pure WebSocket
   * @param {Object} options - Configuration options
   * @param {(result: {text:string, confidence:number, start:number, end:number, isFinal:boolean}) => void} onTranscript
   * @param {(err: Error) => void} [onError]
   */
  async createLiveTranscription(options, onTranscript, onError) {
    try {
      console.log('🔧 Creating AssemblyAI WebSocket connection (API key present?):', !!this.apiKey);
      
      if (!this.apiKey) {
        throw new Error('AssemblyAI API key is required');
      }

      const connectionParams = {
        sampleRate: options.sample_rate || 16000,
        formatTurns: true,
        endOfTurnConfidenceThreshold: 0.7,
        minEndOfTurnSilenceWhenConfident: 160,
        maxTurnSilence: 2400
      };

      const wsUrl = `${this.baseUrl}?${querystring.stringify(connectionParams)}`;
      console.log('🔗 Connecting to:', wsUrl);

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: this.apiKey,
        },
      });

      // Setup WebSocket event handlers
      ws.on('open', () => {
        console.log('🔓 AssemblyAI WebSocket connection opened');
        console.log('✅ Ready to receive audio data');
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          const msgType = data.type;

          console.log('📨 AssemblyAI message received:', msgType, data);

          if (msgType === 'Begin') {
            const sessionId = data.id;
            const expiresAt = data.expires_at;
            console.log(`🚀 Session began: ID=${sessionId}, ExpiresAt=${expiresAt}`);
          } else if (msgType === 'Turn') {
            const transcript = data.transcript || '';
            const formatted = data.turn_is_formatted;
            const confidence = data.end_of_turn_confidence || 0;

            if (transcript.trim()) {
              console.log('📝 Processing transcript:', transcript);
              
              const result = {
                text: transcript,
                confidence: confidence,
                start: data.words?.[0]?.start || 0,
                end: data.words?.[data.words.length - 1]?.end || 0,
                isFinal: formatted || false,
              };

              console.log('✅ Sending transcript to client:', result);
              onTranscript(result);
            }
          } else if (msgType === 'Termination') {
            const audioDuration = data.audio_duration_seconds;
            const sessionDuration = data.session_duration_seconds;
            console.log(`🔚 Session Terminated: Audio Duration=${audioDuration}s, Session Duration=${sessionDuration}s`);
          }
        } catch (error) {
          console.error('❌ Error handling message:', error);
          console.error('Message data:', message);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket Error:', error);
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      });

      ws.on('close', (code, reason) => {
        console.log('🔌 WebSocket Disconnected:', code, reason);
        if (code !== 1000) { // 1000 is normal closure
          console.log('⚠️ Unexpected connection closure');
        }
      });

      // Wait for connection to open
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
        ws.once('close', () => reject(new Error('Connection closed before opening')));
      });

      console.log('✅ AssemblyAI WebSocket connection established and ready');

      // Add a method to send audio data
      ws.sendAudio = (audioBuffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioBuffer);
        } else {
          throw new Error('WebSocket is not open');
        }
      };

      // Add a method to close the connection
      ws.closeConnection = () => {
        if (ws.readyState === WebSocket.OPEN) {
          const terminateMessage = { type: 'Terminate' };
          ws.send(JSON.stringify(terminateMessage));
          ws.close(1000, 'Normal closure');
        }
      };

      return ws;

    } catch (error) {
      throw new Error(`Failed to create live transcription: ${error.message || error}`);
    }
  }

  /**
   * Transcribe prerecorded audio buffer (using the REST API)
   * @param {Buffer} audioBuffer
   */
  async transcribeAudio(audioBuffer) {
    try {
      // For prerecorded audio, we'll use the REST API
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: 'data:audio/wav;base64,' + audioBuffer.toString('base64'),
          formatTurns: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'completed') {
        const words = data.words || [];
        return words.map((w) => ({
          text: w.text || '',
          confidence: w.confidence || 0,
          start: w.start || 0,
          end: w.end || 0,
          isFinal: true,
        }));
      } else {
        throw new Error(`Transcription failed with status: ${data.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to transcribe audio: ${error.message || error}`);
    }
  }
}

export default AssemblyAIWebSocketService;
