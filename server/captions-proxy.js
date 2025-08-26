/* eslint-disable */
// Simple WebSocket proxy to AssemblyAI v3 streaming for browser clients.
// Loads env from project root .env so ASSEMBLYAI_API_KEY is available.
// Usage: node server/captions-proxy.js (or npm run captions:proxy)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const WebSocket = require('ws');

const PORT = process.env.CAPTIONS_PROXY_PORT || 8787;
const API_KEY = process.env.ASSEMBLYAI_API_KEY;
const BASE = 'wss://streaming.assemblyai.com/v3/ws';

if (!API_KEY) {
  console.error('Missing ASSEMBLYAI_API_KEY in environment');
  process.exit(1);
}

const server = new WebSocket.Server({ port: PORT });

server.on('connection', (clientWs, req) => {
  try {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const params = url.searchParams;
    const sampleRate = params.get('sample_rate') || '16000';
    const formatTurns = params.get('format_turns') || 'true';

    const upstreamUrl = `${BASE}?sample_rate=${sampleRate}&format_turns=${formatTurns}`;

    const upstream = new WebSocket(upstreamUrl, {
      headers: { Authorization: API_KEY },
    });

    upstream.on('open', () => {
      // Relay client -> upstream
      clientWs.on('message', (data) => {
        try {
          upstream.send(data);
        } catch (e) {}
      });
    });

    upstream.on('message', (data) => {
      try {
        clientWs.send(data);
      } catch (e) {}
    });

    const closeBoth = (code, reason) => {
      try { clientWs.close(code, reason); } catch (e) {}
      try { upstream.close(code, reason); } catch (e) {}
    };

    upstream.on('error', () => closeBoth());
    clientWs.on('error', () => closeBoth());

    upstream.on('close', (code, reason) => closeBoth(code, reason));
    clientWs.on('close', (code, reason) => closeBoth(code, reason));
  } catch (e) {
    try { clientWs.close(1011, 'Proxy error'); } catch {}
  }
});

server.on('listening', () => {
  console.log(`Captions proxy listening on ws://localhost:${PORT}`);
});


