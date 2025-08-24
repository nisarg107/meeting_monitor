# Live Transcription Setup Guide

This guide will help you set up live transcription using AssemblyAI's streaming API with your zoom-clone application.

## Prerequisites

1. **AssemblyAI Account**: Sign up at [www.assemblyai.com](https://www.assemblyai.com/) and get your API key
2. **MongoDB**: Install MongoDB locally or use MongoDB Atlas
3. **Node.js**: Version 16 or higher

## Installation

The required dependencies have already been installed:

```bash
npm install assemblyai node-record-lpcm16 mongodb mongoose socket.io socket.io-client
```

## Environment Configuration

Create a `.env.local` file in the root directory with the following variables:

```env
# AssemblyAI API Key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/zoom-clone

# Next.js App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Features Implemented

### 1. Real-time Audio Capture
- Captures audio from getstream meetings using MediaRecorder API
- Sends audio chunks to AssemblyAI every 100ms for low-latency transcription

### 2. AssemblyAI Integration
- Uses AssemblyAI's streaming transcription for high-accuracy transcription
- Supports live streaming with interim results
- Handles multiple speakers in the same meeting

### 3. MongoDB Storage
- Stores all transcripts with metadata (confidence, timestamps, speaker info)
- Supports querying transcripts by meeting ID
- Maintains conversation history

### 4. Real-time Broadcasting
- Uses Socket.IO for real-time communication
- Broadcasts transcripts to all participants in the meeting
- Shows live transcription status and confidence scores

### 5. User Interface
- Transcription panel with start/stop controls
- Real-time transcript display with speaker identification
- Confidence score visualization
- Auto-scrolling transcript view

## Usage

1. **Start the Application**:
   ```bash
   npm run dev
   ```

2. **Join a Meeting**: Navigate to any meeting room

3. **Enable Transcription**: Click the transcript icon (📄) in the meeting controls

4. **Start Recording**: Click "Start" to begin live transcription

5. **View Transcripts**: See real-time transcripts appear in the panel

6. **Stop Recording**: Click "Stop" to end transcription

## API Endpoints

- `POST /api/transcription` - Process recorded audio transcription
- `GET /api/transcription?meetingId={id}` - Fetch meeting transcripts
- WebSocket connection for live transcription

## File Structure

```
zoom-clone/
├── lib/
│   ├── mongodb.ts              # MongoDB connection
│   ├── assemblyai.ts           # AssemblyAI service
│   ├── socket.ts               # Socket.IO service
│   └── models/
│       └── Transcript.ts       # Transcript model
├── hooks/
│   └── useTranscription.ts     # React hook for transcription
├── components/
│   └── TranscriptionPanel.tsx  # UI component
├── app/api/transcription/      # API routes
└── server.js                   # Custom server with Socket.IO
```

## Troubleshooting

### Common Issues

1. **Microphone Access**: Ensure your browser has permission to access the microphone
2. **AssemblyAI API Key**: Verify your API key is correct and has sufficient credits
3. **MongoDB Connection**: Check if MongoDB is running and accessible
4. **Socket.IO Connection**: Ensure the server is running and ports are not blocked

### Error Messages

- "Failed to access microphone" - Check browser permissions
- "Failed to start transcription" - Verify AssemblyAI API key and network connection
- "MongoDB connection failed" - Check MongoDB service and connection string

## Performance Considerations

- Audio chunks are sent every 100ms for optimal latency
- Transcripts are stored in MongoDB for persistence
- Socket.IO handles real-time communication efficiently
- AssemblyAI's streaming transcription provides high accuracy with low latency

## Security Notes

- API keys are stored server-side only
- User authentication is handled by Clerk
- Meeting access is controlled by getstream permissions
- Audio data is processed securely through AssemblyAI's API

## Next Steps

- Add transcript export functionality
- Implement speaker diarization
- Add language support for multiple languages
- Create transcript search and filtering
- Add transcript analytics and insights

