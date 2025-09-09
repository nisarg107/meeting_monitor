import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInsight extends Document {
  meetingId: string;
  text: string;
  category:
    | "decision"
    | "risk"
    | "blocker"
    | "commitment"
    | "action_item"
    | "question"
    | "concern";
  urgency: "low" | "medium" | "high";
  confidence: number;
  speakerId?: string;
  speakerName?: string;
  timestamp: Date;
  processedAt: Date;
  context?: string; // transcript chunk that generated this insight
}

const InsightSchema: Schema<IInsight> = new Schema<IInsight>(
  {
    meetingId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "decision",
        "risk",
        "blocker",
        "commitment",
        "action_item",
        "question",
        "concern",
      ],
      required: true,
    },
    urgency: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    speakerId: { type: String },
    speakerName: { type: String },
    timestamp: { type: Date, default: Date.now },
    processedAt: { type: Date, default: Date.now },
    context: { type: String },
  },
  { timestamps: true } // adds createdAt and updatedAt
);

// Avoid OverwriteModelError in dev/hot reload
const Insight: Model<IInsight> =
  mongoose.models.Insight || mongoose.model<IInsight>("Insight", InsightSchema);

export default Insight;

