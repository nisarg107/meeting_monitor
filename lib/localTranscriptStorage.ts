import fs from 'fs';
import path from 'path';

interface TranscriptEntry {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  timestamp?: Date;
  speakerId?: string;
  speakerName?: string;
}

interface MeetingInfo {
  meetingId: string;
  title?: string;
  startTime?: Date;
  participants?: string[];
}

class LocalTranscriptStorage {
  private transcriptsDir: string;
  private currentMeetingId: string | null = null;
  private currentTranscripts: TranscriptEntry[] = [];
  private lastProcessedText: string = '';
  private meetingInfo: MeetingInfo | null = null;

  constructor() {
    this.transcriptsDir = path.join(process.cwd(), 'transcripts');
    this.ensureTranscriptsDirectory();
  }

  private ensureTranscriptsDirectory(): void {
    if (!fs.existsSync(this.transcriptsDir)) {
      fs.mkdirSync(this.transcriptsDir, { recursive: true });
      console.log('📁 Created transcripts directory:', this.transcriptsDir);
    }
  }

  /**
   * Start a new transcript session for a meeting
   */
  startMeeting(meetingId: string, meetingInfo?: Partial<MeetingInfo>): void {
    this.currentMeetingId = meetingId;
    this.currentTranscripts = [];
    this.lastProcessedText = '';
    this.meetingInfo = {
      meetingId,
      title: meetingInfo?.title || `Meeting ${meetingId}`,
      startTime: meetingInfo?.startTime || new Date(),
      participants: meetingInfo?.participants || [],
    };
    console.log(`🎯 Started transcript session for meeting: ${meetingId}`);
  }

  /**
   * Add a new transcript entry with deduplication
   */
  addTranscript(entry: TranscriptEntry): void {
    if (!this.currentMeetingId) {
      console.warn('⚠️ No active meeting session. Call startMeeting() first.');
      return;
    }

    // Only process final transcripts
    if (!entry.isFinal) {
      return;
    }

    // Clean the text
    const cleanText = this.cleanText(entry.text);
    
    // Skip if text is empty or just whitespace
    if (!cleanText.trim()) {
      return;
    }

    // Deduplication: Skip if this text is very similar to the last processed text
    if (this.isDuplicate(cleanText)) {
      return;
    }

    // Add timestamp if not provided
    const transcriptEntry: TranscriptEntry = {
      ...entry,
      text: cleanText,
      timestamp: entry.timestamp || new Date(),
    };

    this.currentTranscripts.push(transcriptEntry);
    this.lastProcessedText = cleanText;

    console.log(`📝 Added transcript: "${cleanText}"`);
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s.,!?;:()[\]{}"'`~@#$%^&*+=|\\<>/]/g, '') // Remove special characters but keep punctuation
      .replace(/\s+([.,!?;:])/g, '$1') // Remove spaces before punctuation
      .replace(/([.,!?;:])\s*/g, '$1 ') // Ensure single space after punctuation
      .trim();
  }

  /**
   * Check if text is a duplicate of the last processed text
   */
  private isDuplicate(text: string): boolean {
    if (!this.lastProcessedText) {
      return false;
    }

    // Simple similarity check - if 80% of words match, consider it duplicate
    const currentWords = text.toLowerCase().split(/\s+/);
    const lastWords = this.lastProcessedText.toLowerCase().split(/\s+/);
    
    const commonWords = currentWords.filter(word => lastWords.includes(word));
    const similarity = commonWords.length / Math.max(currentWords.length, lastWords.length);
    
    return similarity > 0.8;
  }

  /**
   * Save the current transcript to a local file
   */
  saveTranscript(): string | null {
    if (!this.currentMeetingId || this.currentTranscripts.length === 0) {
      console.warn('⚠️ No transcripts to save');
      return null;
    }

    try {
      const filename = this.generateFilename();
      const filepath = path.join(this.transcriptsDir, filename);
      const content = this.formatTranscriptContent();

      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`💾 Transcript saved: ${filepath}`);
      
      return filepath;
    } catch (error) {
      console.error('❌ Failed to save transcript:', error);
      return null;
    }
  }

  /**
   * Generate filename for the transcript
   */
  private generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `meeting-${this.currentMeetingId}-${timestamp}.txt`;
  }

  /**
   * Format transcript content in a professional format
   */
  private formatTranscriptContent(): string {
    const meetingInfo = this.meetingInfo!;
    const endTime = new Date();
    const duration = meetingInfo.startTime 
      ? Math.round((endTime.getTime() - meetingInfo.startTime.getTime()) / 1000 / 60)
      : 0;

    const participantsLine = meetingInfo.participants && meetingInfo.participants.length > 0 
      ? `  Participants: ${meetingInfo.participants.join(', ')}\n` 
      : '';

    let content = `================================================================================
MEETING TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: ${meetingInfo.meetingId}
  Title: ${meetingInfo.title}
  Start Time: ${meetingInfo.startTime?.toLocaleString() || 'Unknown'}
  End Time: ${endTime.toLocaleString()}
  Duration: ${duration} minutes
${participantsLine}
Transcript:
--------------------------------------------------------------------------------

`;

    // Group transcripts by time intervals (every 30 seconds)
    const timeGroups = this.groupTranscriptsByTime();
    
    timeGroups.forEach((group, index) => {
      const timeLabel = this.formatTimeLabel(group.startTime);
      content += `[${timeLabel}]\n`;
      
      group.transcripts.forEach(transcript => {
        const who = transcript.speakerName || 'Speaker';
        const when = transcript.timestamp ? new Date(transcript.timestamp).toLocaleTimeString() : '';
        content += `  ${who}${when ? ` (${when})` : ''}: ${transcript.text}\n`;
      });
      
      content += '\n';
    });

    content += `--------------------------------------------------------------------------------
Transcript generated on: ${endTime.toLocaleString()}
Total entries: ${this.currentTranscripts.length}
================================================================================`;

    return content;
  }

  /**
   * Group transcripts by time intervals
   */
  private groupTranscriptsByTime(): Array<{
    startTime: number;
    transcripts: TranscriptEntry[];
  }> {
    const groups: Array<{
      startTime: number;
      transcripts: TranscriptEntry[];
    }> = [];
    
    const intervalMs = 30000; // 30 seconds

    this.currentTranscripts.forEach(transcript => {
      const groupIndex = Math.floor((transcript.timestamp?.getTime() || 0) / intervalMs);
      const groupStartTime = groupIndex * intervalMs;
      
      let group = groups.find(g => g.startTime === groupStartTime);
      if (!group) {
        group = { startTime: groupStartTime, transcripts: [] };
        groups.push(group);
      }
      
      group.transcripts.push(transcript);
    });

    return groups.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Format time label for transcript sections
   */
  private formatTimeLabel(timestamp: number): string {
    const minutes = Math.floor(timestamp / 60000);
    const seconds = Math.floor((timestamp % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get all transcript files
   */
  getAllTranscriptFiles(): string[] {
    try {
      const files = fs.readdirSync(this.transcriptsDir);
      return files.filter(file => file.endsWith('.txt'));
    } catch (error) {
      console.error('❌ Failed to read transcript files:', error);
      return [];
    }
  }

  /**
   * Read a specific transcript file
   */
  readTranscriptFile(filename: string): string | null {
    try {
      const filepath = path.join(this.transcriptsDir, filename);
      return fs.readFileSync(filepath, 'utf8');
    } catch (error) {
      console.error('❌ Failed to read transcript file:', error);
      return null;
    }
  }

  /**
   * End the current meeting session
   */
  endMeeting(): string | null {
    const filepath = this.saveTranscript();
    this.currentMeetingId = null;
    this.currentTranscripts = [];
    this.lastProcessedText = '';
    this.meetingInfo = null;
    return filepath;
  }
}

// Export singleton instance
const localTranscriptStorage = new LocalTranscriptStorage();
export default localTranscriptStorage;
