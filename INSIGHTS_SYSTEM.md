# Real-time Meeting Insights System

This system provides live insights extraction from meeting transcripts, surfacing important decisions, risks, blockers, and action items as they happen during the meeting.

## Features

### 🔍 Real-time Insight Extraction
- **Chunk-based processing**: Analyzes transcript every 45 seconds
- **LLM-powered**: Uses Google Gemini for insight extraction
- **Multiple categories**: Decisions, risks, blockers, commitments, action items, questions, concerns
- **Urgency levels**: Low, medium, high priority classification
- **Confidence scoring**: 0-1 confidence rating for each insight

### 📡 Live Updates
- **WebSocket integration**: Real-time insights pushed to all meeting participants
- **Fallback polling**: 30-second polling as backup
- **Persistent storage**: Insights saved to MongoDB for later review

### 🎨 User Interface
- **Sliding sidebar**: Clean, modern insights panel
- **Visual indicators**: Color-coded categories and urgency levels
- **Context viewing**: Expandable context from original transcript
- **Speaker attribution**: Shows who said what
- **Confidence bars**: Visual confidence indicators

## Architecture

### Components

1. **InsightsProcessor** (`lib/insightsProcessor.ts`)
   - Manages transcript chunking and LLM processing
   - Handles Google Gemini API calls
   - Processes insights every 45 seconds

2. **Insight Model** (`lib/models/Insight.ts`)
   - MongoDB schema for storing insights
   - Includes metadata like confidence, urgency, speaker info

3. **API Endpoints**
   - `GET /api/insights` - Fetch insights for a meeting
   - `POST /api/insights` - Create new insight
   - `POST /api/insights/process` - Process transcript chunks
   - `DELETE /api/insights/process` - Stop processing

4. **InsightsPanel** (`components/InsightsPanel.tsx`)
   - React component for displaying insights
   - WebSocket integration for real-time updates
   - Responsive design with sliding panel

5. **useInsights Hook** (`hooks/useInsights.ts`)
   - React hook for managing insights state
   - Handles API calls and WebSocket connections

### Data Flow

```
Transcript → Chunking → LLM Analysis → Database → WebSocket → UI
     ↓              ↓           ↓           ↓         ↓       ↓
  Real-time    Every 45s    Google Gemini  MongoDB  Broadcast  Live
```

## Setup

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Required for insights processing
GEMINI_API_KEY=your_gemini_api_key_here

# Existing variables
MONGODB_URI=mongodb://localhost:27017/zoom-clone
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Dependencies

The system uses existing dependencies plus:
- `@radix-ui/react-scroll-area` (for scrollable insights list)

### 3. Database

The system automatically creates the `insights` collection in MongoDB when first used.

## Usage

### In Meeting Room

1. **Start transcription** - Insights processing begins automatically
2. **Click insights button** - Opens the insights sidebar
3. **View live insights** - See insights appear in real-time
4. **Expand context** - Click "View context" to see original transcript

### Insight Categories

- **Decision** ✅ - Important decisions made
- **Risk** ⚠️ - Potential risks or concerns
- **Blocker** 🚫 - Obstacles or impediments
- **Commitment** 🎯 - Promises or commitments
- **Action Item** 📋 - Tasks or action items
- **Question** ❓ - Questions that need answers
- **Concern** 💭 - General concerns or issues

### Urgency Levels

- **High** 🔴 - Requires immediate attention
- **Medium** 🟡 - Important but not urgent
- **Low** ⚪ - Good to know but not critical

## API Reference

### Process Transcript Chunks

```javascript
POST /api/insights/process
{
  "meetingId": "meeting-123",
  "transcriptChunks": [
    {
      "text": "We need to increase the budget",
      "speakerId": "user-1",
      "speakerName": "John",
      "timestamp": "2024-01-01T10:00:00Z",
      "meetingId": "meeting-123"
    }
  ]
}
```

### Fetch Insights

```javascript
GET /api/insights?meetingId=meeting-123
```

Response:
```javascript
{
  "insights": [
    {
      "_id": "insight-123",
      "text": "Budget increase approved for Q2",
      "category": "decision",
      "urgency": "medium",
      "confidence": 0.9,
      "speakerName": "John",
      "timestamp": "2024-01-01T10:00:00Z",
      "context": "We need to increase the budget for Q2..."
    }
  ]
}
```

## Testing

Run the test script to verify the system:

```bash
node test-insights.js
```

This will:
1. Send test transcript chunks
2. Wait for processing
3. Fetch and display generated insights

## Customization

### Adjust Processing Frequency

In `lib/insightsProcessor.ts`:

```typescript
private readonly CHUNK_INTERVAL_MS = 45000; // Change to 30000 for 30s
```

### Modify Insight Categories

In `lib/models/Insight.ts`:

```typescript
category: {
  type: String,
  enum: ['decision', 'risk', 'blocker', 'commitment', 'action_item', 'question', 'concern', 'new_category'],
  required: true,
}
```

### Customize LLM Prompts

In `lib/insightsProcessor.ts`, modify the `extractInsights` method prompt to focus on specific types of insights for your use case.

## Troubleshooting

### No Insights Generated
- Check GEMINI_API_KEY is set correctly
- Verify MongoDB connection
- Check console for Gemini API errors

### WebSocket Not Working
- Ensure `NEXT_PUBLIC_APP_URL` is set correctly
- Check if Socket.IO server is running
- Fallback polling should still work

### High API Costs
- Increase `CHUNK_INTERVAL_MS` to process less frequently
- Add minimum text length requirements
- Gemini API is generally more cost-effective than OpenAI

## Future Enhancements

- **Sentiment analysis** - Track meeting mood and engagement
- **Topic clustering** - Group related insights
- **Action item tracking** - Follow up on commitments
- **Meeting summaries** - Generate end-of-meeting summaries
- **Integration with calendars** - Auto-schedule follow-ups
- **Custom insight types** - Industry-specific categories
