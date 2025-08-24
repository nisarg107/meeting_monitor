import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AssemblyAI API key not configured' },
        { status: 500 }
      );
    }

      // Request a temporary v3 token from AssemblyAI for universal streaming
      // v3 token endpoint returns: { token }
  // AssemblyAI v3 allows up to 600 seconds (10 minutes). Use max=600 to reduce chance of expiry.
  const expiresInSeconds = 600;
      const url = `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${expiresInSeconds}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': apiKey,
        },
      });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AssemblyAI token request failed:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to get AssemblyAI token' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return token and prevent any caching at Next/edge layer so clients always receive a fresh token
    return NextResponse.json(
      { token: data.token },
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
    console.error('Error getting AssemblyAI token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
