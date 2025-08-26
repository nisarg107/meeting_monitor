import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Transcript from '@/lib/models/Transcript';
import AssemblyAIWebSocketService from '@/lib/assemblyai-ws';

// Define the TranscriptionResult interface to match the expected type
interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { meetingId, userId, userName, audioData, isLive } = await request.json();

    if (!meetingId || !userId || !userName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const assemblyaiService = AssemblyAIWebSocketService.getInstance();

    if (isLive) {
      // For live transcription, we'll return a WebSocket connection
      return NextResponse.json({ message: 'Live transcription initiated' });
    } else {
      // For recorded audio transcription
      if (!audioData) {
        return NextResponse.json(
          { error: 'Audio data is required for transcription' },
          { status: 400 }
        );
      }

      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Transcribe the audio
      const transcriptionResults = await assemblyaiService.transcribeAudio(audioBuffer);

      // Save transcripts to MongoDB
      const transcripts = await Promise.all(
        transcriptionResults.map(async (result: TranscriptionResult) => {
          const transcript = new Transcript({
            meetingId,
            userId,
            userName,
            text: result.text,
            confidence: result.confidence,
            start: result.start,
            end: result.end,
            isFinal: result.isFinal,
          });
          return await transcript.save();
        })
      );

      return NextResponse.json({
        message: 'Transcription completed',
        transcripts,
      });
    }
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Failed to process transcription' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      );
    }

    const transcripts = await Transcript.find({ meetingId })
      .sort({ timestamp: 1 })
      .exec();

    return NextResponse.json({ transcripts });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

