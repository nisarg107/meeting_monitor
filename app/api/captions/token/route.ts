import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing ASSEMBLYAI_API_KEY' },
      { status: 500 },
    );
  }

  try {
    const model = process.env.ASSEMBLYAI_REALTIME_MODEL || 'universal-2';
    const res = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_in: 3600, model }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Failed to create AssemblyAI token', details: text },
        { status: 500 },
      );
    }

    const data = await res.json();
    return NextResponse.json({ token: data.token });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Unexpected error creating token' },
      { status: 500 },
    );
  }
}


