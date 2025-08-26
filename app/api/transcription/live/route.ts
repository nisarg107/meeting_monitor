import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // This route will be handled by Socket.IO for WebSocket connections
  return NextResponse.json({ message: 'WebSocket endpoint' });
}

export async function POST(request: NextRequest) {
  try {
    const { meetingId, userId, userName, audioChunk } = await request.json();

    if (!meetingId || !userId || !userName || !audioChunk) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // This will be handled by the Socket.IO server
    return NextResponse.json({ message: 'Audio chunk received' });
  } catch (error) {
    console.error('Error processing audio chunk:', error);
    return NextResponse.json(
      { error: 'Failed to process audio chunk' },
      { status: 500 }
    );
  }
}

