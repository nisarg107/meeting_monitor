import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    // Return API key (Deepgram uses API key directly, not tokens)
    // Note: In production, you might want to use a server-side proxy
    // to keep the API key secure. For now, we'll return it since it's
    // already exposed as NEXT_PUBLIC_DEEPGRAM_API_KEY
    return NextResponse.json(
      { apiKey: apiKey },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );

  } catch (error) {
    console.error('Error getting Deepgram API key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

