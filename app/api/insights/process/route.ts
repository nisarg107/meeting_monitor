import { NextRequest, NextResponse } from 'next/server';
import { InsightsProcessor, TranscriptChunk } from '@/lib/insightsProcessor';
import { connectToDatabase } from '@/lib/mongodb';
import Insight from '@/lib/models/Insight';
import SocketService from '@/lib/socket';

// Store active processors per meeting
const activeProcessors = new Map<string, InsightsProcessor>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, transcriptChunks } = body;

    if (!meetingId || !transcriptChunks || !Array.isArray(transcriptChunks)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get or create processor for this meeting
    let processor = activeProcessors.get(meetingId);
    if (!processor) {
      processor = new InsightsProcessor(
        async (insights) => {
          // Save insights to database
          try {
            await connectToDatabase();
            const savedInsights = await Insight.insertMany(insights);
            console.log(`💾 Saved ${insights.length} insights for meeting ${meetingId}`);
            
            // Broadcast insights via WebSocket
            const socketService = new SocketService();
            const io = socketService.getIO();
            if (io) {
              io.to(meetingId).emit('insights', {
                meetingId,
                insights: savedInsights
              });
              console.log(`📡 Broadcasted ${insights.length} insights to meeting ${meetingId}`);
            }
          } catch (error) {
            console.error('Error saving insights:', error);
          }
        },
        meetingId
      );
      activeProcessors.set(meetingId, processor);
    }

    // Add transcript chunks to processor
    transcriptChunks.forEach((chunk: TranscriptChunk) => {
      processor.addTranscriptChunk(chunk);
    });

    return NextResponse.json({ 
      message: 'Transcript chunks processed',
      chunksProcessed: transcriptChunks.length 
    });
  } catch (error) {
    console.error('Error processing transcript chunks:', error);
    return NextResponse.json(
      { error: 'Failed to process transcript chunks' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      );
    }

    // Stop and remove processor
    const processor = activeProcessors.get(meetingId);
    if (processor) {
      processor.stop();
      activeProcessors.delete(meetingId);
    }

    return NextResponse.json({ message: 'Processor stopped' });
  } catch (error) {
    console.error('Error stopping processor:', error);
    return NextResponse.json(
      { error: 'Failed to stop processor' },
      { status: 500 }
    );
  }
}
