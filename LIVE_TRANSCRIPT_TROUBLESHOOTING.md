# Live Transcription Troubleshooting Guide

## Current Issues Fixed
✅ **AssemblyAI Service Import/Export** - Fixed inconsistencies between lib/assemblyai.js and server.js  
✅ **Socket.IO Server** - Custom server with Socket.IO is running properly  
✅ **Audio Chunk Transmission** - Added comprehensive logging for audio flow  
✅ **Error Handling** - Improved client and server-side error handling  

## How to Test Live Transcription

### 1. Start the Server
```bash
cd "C:\Users\nisar\OneDrive\Desktop\monitormeeting\zoom-clone"
npm run dev
```

### 2. Join a Meeting
1. Open http://localhost:3000 in your browser
2. Create or join a meeting
3. Allow microphone permissions when prompted
4. Click the **Transcript button** (📄 icon) in the meeting controls

### 3. Start Transcription
1. In the Live Transcript panel, click **Start**
2. Grant microphone permission if requested
3. Speak clearly and you should see live transcription appearing

## Expected Server Logs
When transcription is working properly, you should see:
```
🔌 Client connected: [socket-id]
🫶 Socket [socket-id] joined room [meeting-id]
🔧 Creating AssemblyAI connection (API key present?): true
🔓 AssemblyAI live connection opened with ID: [id]
✅ AssemblyAI streaming connection established
🎤 AssemblyAI ready for socket [socket-id]
🎤 Server: Forwarding audio chunk to AssemblyAI, size: [bytes] bytes
📝 Transcript received from AssemblyAI: { text: "Hello world", ... }
💾 Transcript saved: Hello world
📤 Transcript broadcasted: Hello world
```

## Common Issues & Solutions

### Issue 1: No Audio Chunks Being Sent
**Symptoms:** No "🎤 Server: Forwarding audio chunk" messages in server logs
**Solutions:**
- Check microphone permissions in browser
- Verify MediaRecorder is supported in your browser
- Try different audio formats (the app automatically tries multiple formats)

### Issue 2: AssemblyAI Connection Closes Immediately
**Symptoms:** "🔌 AssemblyAI connection closed" appears right after opening
**Solutions:**
- Verify ASSEMBLYAI_API_KEY is valid in .env.local
- Check if you have sufficient API credits
- Ensure audio format is supported (we use linear16 PCM)

### Issue 3: Audio Sent But No Transcription
**Symptoms:** Audio chunks are forwarded but no "📝 Transcript received" logs
**Solutions:**
- Check if audio quality is sufficient (speak clearly, reduce background noise)
- Try adjusting the audio sample rate (currently 16000Hz)
- Verify the audio encoding settings match what AssemblyAI expects

### Issue 4: Socket.IO Connection Failed
**Symptoms:** "❌ Socket.IO connection error" in browser console
**Solutions:**
- Ensure you're running the custom server (npm run dev) not just Next.js dev
- Check if port 3000 is available
- Verify NEXT_PUBLIC_APP_URL in .env.local matches your server URL

## Browser Console Debugging
Open browser DevTools (F12) and check the Console tab for:
- "✅ Connected to transcription server" - Socket.IO connected
- "🎤 Using audio format: [format]" - MediaRecorder format selected
- "🎤 Client: Audio chunk available" - Audio being captured
- Any error messages about permissions or MediaRecorder

## Audio Format Preferences
The app tries these formats in order:
1. `audio/webm;codecs=opus` (preferred)
2. `audio/webm`
3. `audio/mp4`
4. `audio/wav`

## Environment Variables Required
In `.env.local`:
```
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
MONGODB_URI=mongodb://localhost:27017/zoom-clone
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Testing Audio Input
You can test if your microphone is working by:
1. Opening browser DevTools
2. Going to Application > Permissions
3. Checking if microphone permission is granted for localhost:3000
4. Testing with: `navigator.mediaDevices.getUserMedia({ audio: true }).then(console.log).catch(console.error)`

## Still Having Issues?
1. Check server logs for specific error messages
2. Check browser console for client-side errors
3. Verify all environment variables are set correctly
4. Ensure MongoDB is running (if saving transcripts)
5. Test with a different browser or incognito mode
