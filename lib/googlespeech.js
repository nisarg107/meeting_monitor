// lib/googlespeech.js
const speech = require('@google-cloud/speech');

class GoogleSpeechService {
  constructor() {
    // Initialize the Google Speech client
    this.client = new speech.SpeechClient({
      // You can specify keyFilename here if using a service account file
      // keyFilename: 'path/to/your/service-account-key.json',
      // Or use environment variables for authentication
    });
  }

  static getInstance() {
    if (!GoogleSpeechService.instance) {
      GoogleSpeechService.instance = new GoogleSpeechService();
    }
    return GoogleSpeechService.instance;
  }

  /**
   * Create a live transcription stream using Google Speech-to-Text
   * @param {(result: {text:string, confidence:number, start:number, end:number, isFinal:boolean}) => void} onTranscript
   * @param {(err: Error) => void} [onError]
   */
  async createLiveTranscription(onTranscript, onError) {
    try {
      console.log('🔧 Creating Google Speech connection (Project ID present?):', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
      
      // Configure the request for streaming recognition
      const request = {
        config: {
          encoding: 'WEBM_OPUS', // Match the client's WebM/Opus format
          sampleRateHertz: 48000, // Standard WebRTC sample rate
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          model: 'latest_long', // Best model for real-time transcription
        },
        interimResults: true, // Enable interim results for real-time feedback
      };

      // Create the recognize stream
      const recognizeStream = this.client
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error('❌ Google Speech streaming error:', error);
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        })
        .on('data', (data) => {
          try {
            console.log('📨 Google Speech data received:', data);
            
            if (data.results && data.results.length > 0) {
              const result = data.results[0];
              const alternative = result.alternatives[0];
              
              if (alternative && alternative.transcript) {
                const words = alternative.words || [];
                const transcriptResult = {
                  text: alternative.transcript.trim(),
                  confidence: alternative.confidence || 0,
                  start: words.length > 0 ? parseFloat(words[0].startTime?.seconds || 0) + parseFloat(words[0].startTime?.nanos || 0) / 1e9 : 0,
                  end: words.length > 0 ? parseFloat(words[words.length - 1].endTime?.seconds || 0) + parseFloat(words[words.length - 1].endTime?.nanos || 0) / 1e9 : 0,
                  isFinal: result.isFinal || false,
                };

                if (transcriptResult.text) {
                  console.log('📝 Google Speech transcript parsed:', transcriptResult);
                  onTranscript(transcriptResult);
                }
              }
            }
          } catch (err) {
            console.error('❌ Error parsing Google Speech data:', err);
          }
        });

      // Create a mock connection object that mimics the AssemblyAI interface
      const connection = {
        send: (audioBuffer) => {
          try {
            if (recognizeStream && !recognizeStream.destroyed) {
              recognizeStream.write(audioBuffer);
            }
          } catch (err) {
            console.error('❌ Error sending audio to Google Speech:', err);
          }
        },
        
        finish: () => {
          try {
            if (recognizeStream && !recognizeStream.destroyed) {
              recognizeStream.end();
            }
          } catch (err) {
            console.error('❌ Error finishing Google Speech stream:', err);
          }
        },
        
        keepAlive: () => {
          // Google Speech doesn't need explicit keep-alive
          // The stream is kept alive by continuous audio data
        },
        
        addListener: (event, callback) => {
          if (event === 'close') {
            recognizeStream.on('end', callback);
            recognizeStream.on('close', callback);
          } else {
            recognizeStream.on(event, callback);
          }
        },
        
        // For compatibility
        on: (event, callback) => {
          connection.addListener(event, callback);
        }
      };

      // Set up close handler
      recognizeStream.on('end', () => {
        console.log('🔌 Google Speech stream ended');
      });

      recognizeStream.on('close', () => {
        console.log('🔌 Google Speech stream closed');
      });

      console.log('🔓 Google Speech streaming connection created');
      return connection;

    } catch (error) {
      throw new Error(`Failed to create Google Speech transcription: ${error.message || error}`);
    }
  }

  /**
   * Transcribe prerecorded audio buffer (for compatibility)
   * @param {Buffer} audioBuffer
   */
  async transcribeAudio(audioBuffer) {
    try {
      const request = {
        audio: {
          content: audioBuffer.toString('base64'),
        },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
        },
      };

      const [response] = await this.client.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0])
        .filter(alternative => alternative && alternative.transcript);

      return transcription.map((alt, index) => ({
        text: alt.transcript || '',
        confidence: alt.confidence || 0,
        start: 0, // Would need word-level timing for accurate start/end
        end: 0,
        isFinal: true,
      }));

    } catch (error) {
      throw new Error(`Failed to transcribe audio with Google Speech: ${error.message || error}`);
    }
  }
}

module.exports = GoogleSpeechService;
