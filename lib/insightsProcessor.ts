import { IInsight } from './models/Insight';

export interface TranscriptChunk {
  text: string;
  speakerId?: string;
  speakerName?: string;
  timestamp: Date;
  meetingId: string;
}

export interface InsightExtractionResult {
  insights: Array<{
    text: string;
    category: 'decision' | 'risk' | 'blocker' | 'commitment' | 'action_item' | 'question' | 'concern';
    urgency: 'low' | 'medium' | 'high';
    confidence: number;
  }>;
}

export class InsightsProcessor {
  private chunkBuffer: TranscriptChunk[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly CHUNK_INTERVAL_MS = 45000; // 45 seconds
  private readonly MIN_CHUNK_LENGTH = 15; // Minimum characters to process (lowered)

  constructor(
    private onInsightsGenerated: (insights: IInsight[]) => void,
    private meetingId: string
  ) {
    this.startProcessing();
  }

  public addTranscriptChunk(chunk: TranscriptChunk) {
    this.chunkBuffer.push(chunk);
    console.log(`📝 Added transcript chunk. Buffer size: ${this.chunkBuffer.length}`);
  }

  private startProcessing() {
    this.processingInterval = setInterval(() => {
      this.processChunks();
    }, this.CHUNK_INTERVAL_MS);
  }

  private async processChunks() {
    if (this.chunkBuffer.length === 0) return;

    const chunksToProcess = [...this.chunkBuffer];
    this.chunkBuffer = [];

    const combinedText = chunksToProcess
      .map(chunk => `${chunk.speakerName || 'Speaker'}: ${chunk.text}`)
      .join('\n');

    if (combinedText.length < this.MIN_CHUNK_LENGTH) {
      console.log('📝 Chunk too short, skipping processing');
      return;
    }

    console.log(`🔍 Processing ${chunksToProcess.length} chunks (${combinedText.length} chars)`);

    try {
      const insights = await this.extractInsights(combinedText, chunksToProcess);
      if (insights.length > 0) {
        this.onInsightsGenerated(insights);
      }
    } catch (error) {
      console.error('❌ Error processing insights:', error);
    }
  }

  private async extractInsights(text: string, chunks: TranscriptChunk[]): Promise<IInsight[]> {
    const prompt = `Analyze this meeting transcript snippet and extract important insights. Focus on:
- Decisions made
- Risks or concerns raised
- Blockers or obstacles mentioned
- Commitments or action items
- Questions that need answers
- Important concerns

Transcript:
${text}

Return a strict JSON object with an "insights" array (no markdown, no prose). Each insight should have:
- text: A clear, concise description of the insight
- category: One of: decision, risk, blocker, commitment, action_item, question, concern
- urgency: One of: low, medium, high
- confidence: A number between 0 and 1 indicating how confident you are

Example format:
{
  "insights": [
    {
      "text": "Client is unhappy with current delivery timelines",
      "category": "risk",
      "urgency": "high",
      "confidence": 0.9
    },
    {
      "text": "Budget increase approved for Q2",
      "category": "decision",
      "urgency": "medium",
      "confidence": 0.8
    }
  ]
}

Only return insights that are significant and actionable. If no significant insights are found, return an empty array.`;

    try {
      const response = await this.callGemini(prompt);
      // Clean possible code fences or stray prose
      const cleaned = response
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
          parsed = { insights: JSON.parse(cleaned) };
        } else {
          throw e;
        }
      }

      const result: InsightExtractionResult = Array.isArray(parsed)
        ? { insights: parsed }
        : parsed;

      const insightArray = Array.isArray((result as any).insights)
        ? (result as any).insights
        : [];

      return insightArray.map((insight: any) => ({
        meetingId: this.meetingId,
        text: insight.text,
        category: insight.category,
        urgency: insight.urgency,
        confidence: insight.confidence,
        speakerId: chunks[0]?.speakerId,
        speakerName: chunks[0]?.speakerName,
        timestamp: chunks[0]?.timestamp || new Date(),
        processedAt: new Date(),
        context: text.substring(0, 200) + '...', // First 200 chars for context
      }));
    } catch (error) {
      console.error('❌ Error extracting insights:', error);
      return [];
    }
  }


  private async callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error details:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  public stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.processChunks(); // Process any remaining chunks
  }
}
