# Local Transcript Storage

This document explains the local transcript storage feature that has been implemented to store meeting transcripts locally in a clean, professional format.

## Features

### 1. Clean Transcript Format
- Removes confidence scores and timestamps from the display
- Deduplicates repeated words/phrases automatically
- Formats transcripts in a professional, readable format
- Groups transcripts by time intervals (30-second segments)

### 2. Local File Storage
- Saves transcripts as `.txt` files locally
- Uses browser download functionality
- Files are automatically named with meeting ID and timestamp
- No server-side storage required

### 3. Deduplication
- Automatically detects and removes duplicate or very similar text
- Uses 80% similarity threshold to identify duplicates
- Prevents repeated words/phrases from cluttering the transcript

### 4. Professional Format
The saved transcript files include:
- Meeting details (ID, title, start/end time, duration, participants)
- Clean transcript text organized by time intervals
- Professional formatting with clear sections

## How It Works

### 1. Starting Transcription
When you click "Start" in the transcription panel:
- A new transcript session is created for the meeting
- Local storage is initialized with meeting information
- Real-time transcription begins

### 2. Processing Transcripts
As you speak:
- AssemblyAI processes your audio and sends transcript data
- Text is cleaned and normalized
- Duplicates are automatically filtered out
- Clean text is added to the local storage

### 3. Saving Transcripts
You can save transcripts in two ways:
- **Manual Save**: Click the "Save" button during the meeting
- **Auto Save**: Transcripts are automatically saved when you stop recording

### 4. File Format
Saved files are named: `meeting-{meetingId}-{timestamp}.txt`

Example content:
```
================================================================================
MEETING TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: test-meeting-123
  Title: Meeting test-meeting-123
  Start Time: 1/15/2024, 10:30:00 AM
  End Time: 1/15/2024, 10:35:00 AM
  Duration: 5 minutes
  Participants: John Doe

Transcript:
--------------------------------------------------------------------------------

[00:00]
  Hello everyone, welcome to our meeting today.

[00:30]
  Let's discuss the project timeline and next steps.

[01:00]
  I think we should focus on the user interface improvements first.

--------------------------------------------------------------------------------
Transcript generated on: 1/15/2024, 10:35:00 AM
Total entries: 3
================================================================================
```

## Usage

1. **Start a Meeting**: Join any meeting room
2. **Open Transcript Panel**: Click the transcript icon in the meeting interface
3. **Start Recording**: Click "Start" to begin live transcription
4. **Speak Clearly**: The system will capture and process your speech
5. **Save Transcript**: Click "Save" to download the transcript file
6. **Stop Recording**: Click "Stop" to end transcription and auto-save

## Technical Details

### Files Modified
- `lib/localTranscriptStorageClient.ts` - Client-side storage utility
- `hooks/useAssemblyAITranscription.ts` - Updated to use local storage
- `components/TranscriptionPanel.tsx` - Updated UI with save functionality

### Key Functions
- `startMeeting()` - Initialize new transcript session
- `addTranscript()` - Add and process new transcript entries
- `saveTranscript()` - Generate and download transcript file
- `endMeeting()` - Finalize and save transcript session

### Deduplication Algorithm
- Compares current text with last processed text
- Calculates word similarity percentage
- Filters out texts with >80% similarity
- Preserves unique content only

## Benefits

1. **No Database Required**: Works completely locally without MongoDB
2. **Clean Output**: Professional format without technical metadata
3. **Automatic Deduplication**: No repeated words or phrases
4. **Easy Access**: Files saved directly to your downloads folder
5. **Privacy**: All processing happens locally in your browser

## Troubleshooting

### No Transcripts Saved
- Ensure you have transcripts captured (check the counter)
- Try clicking "Save" manually during the meeting
- Check browser download settings

### Duplicate Content Still Appears
- The deduplication threshold is set to 80% similarity
- Very different phrases may both be included
- This is intentional to preserve meaningful content

### File Not Downloading
- Check browser popup blockers
- Ensure downloads are allowed for the site
- Try refreshing the page and starting again

## Future Enhancements

- Speaker identification
- Custom time intervals
- Export to different formats (PDF, Word)
- Cloud storage integration
- Real-time collaboration features
