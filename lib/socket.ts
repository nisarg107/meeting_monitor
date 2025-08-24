import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export interface TranscriptMessage {
  meetingId: string;
  userId: string;
  userName: string;
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  timestamp: Date;
}

export class SocketService {
  private io: SocketIOServer | null = null;

  public initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join-meeting', (meetingId: string) => {
        socket.join(meetingId);
        console.log(`Client ${socket.id} joined meeting: ${meetingId}`);
      });

      socket.on('leave-meeting', (meetingId: string) => {
        socket.leave(meetingId);
        console.log(`Client ${socket.id} left meeting: ${meetingId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    return this.io;
  }

  public broadcastTranscript(meetingId: string, transcript: TranscriptMessage) {
    if (this.io) {
      this.io.to(meetingId).emit('transcript', transcript);
    }
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }
}

export default SocketService;

