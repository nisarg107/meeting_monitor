import mongoose from 'mongoose';

export interface ITranscript {
  meetingId: string;
  userId: string;
  userName: string;
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  timestamp: Date;
}

const TranscriptSchema = new mongoose.Schema<ITranscript>({
  meetingId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  confidence: {
    type: Number,
    required: true,
  },
  start: {
    type: Number,
    required: true,
  },
  end: {
    type: Number,
    required: true,
  },
  isFinal: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Transcript || mongoose.model<ITranscript>('Transcript', TranscriptSchema);

