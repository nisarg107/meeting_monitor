import dotenv from 'dotenv';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import AssemblyAIWebSocketService from './lib/assemblyai-ws.js'; // Pure WebSocket implementation

// Load environment variables from .env / .env.local if present
dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

process.env.NEXT_TELEMETRY_DISABLED = '1';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// --- Mongo model ---
const transcriptSchema = new mongoose.Schema({
  meetingId: String,
  userId: String,
  userName: String,
  text: String,
  confidence: Number,
  start: Number,
  end: Number,
  isFinal: Boolean,
  timestamp: { type: Date, default: Date.now },
});
const Transcript =
  mongoose.models.Transcript || mongoose.model('Transcript', transcriptSchema);

// --- Safe MongoDB connect helper ---
async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zoom-clone');
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.log('⚠️ MongoDB connection failed:', err.message);
  }
}

// Helper: wrap AssemblyAI connection with isOpen()
function attachIsOpen(connection) {
  if (connection && typeof connection.isOpen !== 'function') {
    connection.isOpen = function () {
      try {
        // Official SDK: connection._socket or connection.ws holds the underlying websocket
        const ws = connection.ws || connection._socket;
        return ws && ws.readyState === 1; // 1 = OPEN
      } catch (_) {
        return false;
      }
    };
  }
  return connection;
}

app.prepare().then(async () => {
  await connectMongo();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // --- Join a room ---
    socket.on('join-meeting', (meetingId) => {
      if (typeof meetingId === 'string' && meetingId.trim()) {
        socket.join(meetingId);
        console.log(`🫶 Socket ${socket.id} joined room ${meetingId}`);
      }
    });

    // --- Start AssemblyAI transcription ---
    socket.on('start-transcription', async ({ meetingId, userId, userName }) => {
      if (!meetingId) {
        socket.emit('transcription-error', { error: 'Missing meetingId' });
        return;
      }
      socket.join(meetingId);

      try {
        const assemblyai = AssemblyAIWebSocketService.getInstance();

        const connection = attachIsOpen(
          await assemblyai.createLiveTranscription(
            { sample_rate: 16000 },
            async (result) => {
              const transcriptData = {
                meetingId,
                userId,
                userName,
                text: result.text,
                confidence: result.confidence,
                start: result.start,
                end: result.end,
                isFinal: result.isFinal,
              };

              if (transcriptData.text?.trim()) {
                await connectMongo();
                try {
                  await new Transcript(transcriptData).save();
                  console.log('💾 Transcript saved:', transcriptData.text);
                } catch (dbErr) {
                  console.log('⚠️ DB save failed:', dbErr.message);
                }

                io.to(meetingId).emit('transcript', {
                  ...transcriptData,
                  timestamp: new Date(),
                });
                console.log('📤 Transcript broadcasted:', transcriptData.text);
              }
            },
            (error) => {
              console.error('❌ AssemblyAI error:', error);
              socket.assemblyaiConnection = null;
              socket.emit('transcription-error', { error: error.message || String(error) });
            }
          )
        );

        // Attach AssemblyAI connection to socket
        socket.assemblyaiConnection = connection;
        socket.assemblyaiReady = true;

        // Handle AssemblyAI connection close
        connection.on('close', () => {
          console.log(`🔌 AssemblyAI closed for ${socket.id}`);
          socket.assemblyaiConnection = null;
          socket.assemblyaiReady = false;
        });

        // Start keepAlive pings
        socket.keepAliveInterval = setInterval(() => {
          if (socket.assemblyaiConnection && socket.assemblyaiConnection.readyState !== 1) {
            console.log('AssemblyAI connection closed, clearing interval');
            clearInterval(socket.keepAliveInterval);
          }
        }, 30000);

        socket.emit('transcription-started');
        console.log(`🎤 AssemblyAI ready for socket ${socket.id}`);
      } catch (err) {
        console.error('Failed to start transcription:', err);
        socket.emit('transcription-error', { error: err.message || String(err) });
      }
    });

    // --- Incoming audio chunks ---
    socket.on('audio-chunk', (data) => {
      const base64 = data?.audioChunk;
      if (!base64) return;

      if (
        !socket.assemblyaiConnection ||
        !socket.assemblyaiReady ||
        socket.assemblyaiConnection.readyState !== 1
      ) {
        console.log('⚠️ Skipping audio chunk: AssemblyAI not ready or socket closed');
        return;
      }

      try {
        const buf = Buffer.from(base64, 'base64');
        console.log('🎤 Forwarding audio chunk, size:', buf.length, 'bytes');
        
        // Check if the chunk size is reasonable (should be under ~16KB for 100ms at 16kHz)
        if (buf.length > 32000) { // 16kHz * 2 bytes * 1 second
          console.log('⚠️ Audio chunk seems too large, this might cause duration violations');
        }
        
        socket.assemblyaiConnection.sendAudio(buf);
      } catch (err) {
        console.error('❌ Error sending audio to AssemblyAI:', err.message);
        socket.assemblyaiReady = false;
        socket.assemblyaiConnection = null;
        socket.emit('transcription-error', { error: 'Connection closed' });
      }
    });

    // --- Stop transcription manually ---
    socket.on('stop-transcription', () => {
      if (socket.assemblyaiConnection) {
        try {
          if (socket.assemblyaiConnection.closeConnection) {
            socket.assemblyaiConnection.closeConnection();
          } else {
            socket.assemblyaiConnection.close();
          }
        } catch (_) {}
        socket.assemblyaiConnection = null;
        socket.assemblyaiReady = false;
      }
      clearInterval(socket.keepAliveInterval);
      socket.emit('transcription-stopped');
    });

    // --- Cleanup on disconnect ---
    socket.on('disconnect', () => {
      if (socket.assemblyaiConnection) {
        try {
          if (socket.assemblyaiConnection.closeConnection) {
            socket.assemblyaiConnection.closeConnection();
          } else {
            socket.assemblyaiConnection.close();
          }
        } catch (_) {}
      }
      clearInterval(socket.keepAliveInterval);
      socket.assemblyaiConnection = null;
      socket.assemblyaiReady = false;
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> Socket.IO server running');
  });
});
