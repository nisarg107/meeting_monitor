interface TranscriptEntry {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  timestamp?: Date;
  // Enhanced fields for AI analysis
  speakerId?: string;
  speakerName?: string;
  emotion?: 'positive' | 'negative' | 'neutral' | 'excited' | 'concerned' | 'confident' | 'uncertain';
  audioQuality?: number; // 0-1 scale
  volume?: number; // 0-1 scale
  speakingRate?: number; // words per minute
  pauseDuration?: number; // milliseconds
  isQuestion?: boolean;
  isInterruption?: boolean;
  technicalTerms?: string[];
  industryContext?: string;
  sentimentScore?: number; // -1 to 1
  urgency?: 'low' | 'medium' | 'high';
  topic?: string;
  actionItems?: string[];
  followUpRequired?: boolean;
}

interface MeetingInfo {
  meetingId: string;
  title?: string;
  startTime?: Date;
  participants?: string[];
  // Enhanced meeting context
  industry?: 'manufacturing' | 'construction' | 'financial-services';
  meetingType?: 'sales' | 'project' | 'review' | 'planning' | 'negotiation';
  attendees?: Array<{
    id: string;
    name: string;
    role: string;
    company?: string;
    email?: string;
    isHost: boolean;
  }>;
  agenda?: string[];
  expectedDuration?: number; // minutes
  recordingQuality?: 'low' | 'medium' | 'high';
  language?: string;
  timezone?: string;
}

class LocalTranscriptStorageClient {
  private currentMeetingId: string | null = null;
  private currentTranscripts: TranscriptEntry[] = [];
  private lastProcessedText: string = '';
  private meetingInfo: MeetingInfo | null = null;

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
      industry: meetingInfo?.industry,
      meetingType: meetingInfo?.meetingType,
      attendees: meetingInfo?.attendees,
      agenda: meetingInfo?.agenda,
      language: meetingInfo?.language,
      timezone: meetingInfo?.timezone,
    };
    console.log(`🎯 Started transcript session for meeting: ${meetingId}`);
  }

  /**
   * Add a new transcript entry with enhanced analysis
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

    // Skip very short texts (likely interim results) - be more strict
    if (cleanText.length < 3) {
      return;
    }

    // Skip single words that are likely interim results
    const words = cleanText.split(/\s+/);
    if (words.length === 1 && words[0].length < 5) {
      return;
    }

    // Check for duplicates against recent transcripts
    if (this.isDuplicateEnhanced(cleanText)) {
      console.log(`🚫 Skipped duplicate: "${cleanText}"`);
      return;
    }

    // Enhanced transcript analysis
    const enhancedEntry = this.enhanceTranscriptData(entry, cleanText);

    this.currentTranscripts.push(enhancedEntry);
    this.lastProcessedText = cleanText;

    console.log(`📝 Added enhanced transcript: "${cleanText}"`);
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
   * Check if text is too short or likely an interim result
   */
  private isInterimResult(text: string): boolean {
    const cleanText = text.trim();
    
    // Skip very short texts (likely interim results)
    if (cleanText.length < 3) {
      return true;
    }
    
    // Skip texts that are just single words repeated
    const words = cleanText.split(/\s+/);
    if (words.length === 1 && words[0].length < 5) {
      return true;
    }
    
    // Skip texts that end with incomplete words (common in interim results)
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length < 3) {
      return true;
    }
    
    return false;
  }

  /**
   * Enhance transcript data with AI analysis features
   */
  private enhanceTranscriptData(entry: TranscriptEntry, cleanText: string): TranscriptEntry {
    const enhancedEntry: TranscriptEntry = {
      ...entry,
      text: cleanText,
      timestamp: entry.timestamp || new Date(),
    };

    // Enhanced speaker identification using AssemblyAI's speaker diarization
    enhancedEntry.speakerId = entry.speakerId || this.identifySpeaker();
    enhancedEntry.speakerName = entry.speakerName || this.getSpeakerName(enhancedEntry.speakerId);

    // Emotion detection based on text analysis
    enhancedEntry.emotion = this.detectEmotion(cleanText);
    enhancedEntry.sentimentScore = this.calculateSentiment(cleanText);

    // Question detection
    enhancedEntry.isQuestion = this.isQuestion(cleanText);

    // Technical terms detection
    enhancedEntry.technicalTerms = this.extractTechnicalTerms(cleanText);

    // Topic classification
    enhancedEntry.topic = this.classifyTopic(cleanText);

    // Urgency detection
    enhancedEntry.urgency = this.detectUrgency(cleanText);

    // Action items detection
    enhancedEntry.actionItems = this.extractActionItems(cleanText);
    enhancedEntry.followUpRequired = enhancedEntry.actionItems.length > 0;

    // Speaking rate calculation (words per minute)
    enhancedEntry.speakingRate = this.calculateSpeakingRate(cleanText, entry.start, entry.end);

    // Audio quality estimation (based on confidence)
    enhancedEntry.audioQuality = entry.confidence;
    enhancedEntry.volume = entry.confidence; // Simplified for now

    return enhancedEntry;
  }

  /**
   * Simple speaker identification - works with free API
   */
  private identifySpeaker(): string {
    // Use the first attendee as default speaker
    if (this.meetingInfo?.attendees && this.meetingInfo.attendees.length > 0) {
      return this.meetingInfo.attendees[0].id;
    }
    return 'speaker-1';
  }

  /**
   * Get speaker name from speaker ID
   */
  private getSpeakerName(speakerId: string): string {
    // Handle regular attendee IDs
    if (this.meetingInfo?.attendees) {
      const attendee = this.meetingInfo.attendees.find(a => a.id === speakerId);
      if (attendee) {
        return attendee.name;
      }
    }
    
    return 'Speaker';
  }

  /**
   * Detect emotion from text
   */
  private detectEmotion(text: string): TranscriptEntry['emotion'] {
    const lowerText = text.toLowerCase();
    
    // Positive emotions
    if (lowerText.includes('great') || lowerText.includes('excellent') || lowerText.includes('amazing')) {
      return 'excited';
    }
    if (lowerText.includes('good') || lowerText.includes('nice') || lowerText.includes('perfect') || lowerText.includes('thank') || lowerText.includes('hope') || lowerText.includes('fine') || lowerText.includes('okay') || lowerText.includes('hello')) {
      return 'positive';
    }
    
    // Negative emotions
    if (lowerText.includes('problem') || lowerText.includes('issue') || lowerText.includes('concern')) {
      return 'concerned';
    }
    if (lowerText.includes('bad') || lowerText.includes('terrible') || lowerText.includes('worried') || lowerText.includes('hell') || lowerText.includes('get out') || lowerText.includes('told you')) {
      return 'negative';
    }
    
    // Uncertainty
    if (lowerText.includes('maybe') || lowerText.includes('perhaps') || lowerText.includes('not sure')) {
      return 'uncertain';
    }
    
    // Confidence
    if (lowerText.includes('definitely') || lowerText.includes('certainly') || lowerText.includes('absolutely')) {
      return 'confident';
    }
    
    return 'neutral';
  }

  /**
   * Calculate sentiment score (-1 to 1)
   */
  private calculateSentiment(text: string): number {
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'amazing', 'wonderful', 'fantastic', 'thank', 'thanks', 'appreciate', 'love', 'like', 'happy', 'pleased', 'fine', 'hope', 'okay', 'hello'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'problem', 'issue', 'concern', 'hell', 'damn', 'hate', 'angry', 'frustrated', 'upset', 'get out', 'told you', 'nothing'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    // Check for positive phrases
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) score += 0.1; // Reduced impact
    });
    
    // Check for negative phrases
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) score -= 0.3; // Reduced impact
    });
    
    // Special cases for stronger negative sentiment
    if (lowerText.includes('what the hell') || lowerText.includes('get out')) {
      score -= 0.6;
    }
    
    if (lowerText.includes('told you')) {
      score -= 0.5;
    }
    
    // Special cases for positive sentiment
    if (lowerText.includes('hello') && !lowerText.includes('what the hell')) {
      score += 0.1;
    }
    
    if (lowerText.includes('okay') && !lowerText.includes('not okay')) {
      score += 0.1;
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Detect if text is a question
   */
  private isQuestion(text: string): boolean {
    return text.includes('?') || 
           text.toLowerCase().startsWith('what') ||
           text.toLowerCase().startsWith('how') ||
           text.toLowerCase().startsWith('why') ||
           text.toLowerCase().startsWith('when') ||
           text.toLowerCase().startsWith('where') ||
           text.toLowerCase().startsWith('who') ||
           text.toLowerCase().startsWith('which');
  }

  /**
   * Extract technical terms based on industry context
   */
  private extractTechnicalTerms(text: string): string[] {
    const terms: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Manufacturing terms
    const manufacturingTerms = ['production', 'assembly', 'quality control', 'inventory', 'supply chain', 'manufacturing', 'factory', 'machinery'];
    // Construction terms
    const constructionTerms = ['blueprint', 'foundation', 'contractor', 'subcontractor', 'permit', 'inspection', 'safety', 'materials'];
    // Financial terms
    const financialTerms = ['revenue', 'profit', 'investment', 'portfolio', 'risk', 'compliance', 'audit', 'budget'];
    // Meeting and business terms
    const meetingTerms = ['meeting', 'agenda', 'minutes', 'action item', 'follow up', 'discussion', 'presentation', 'review', 'status', 'update', 'progress', 'deadline', 'timeline', 'schedule', 'purpose', 'objective', 'goal', 'target', 'milestone', 'deliverable'];
    
    const allTerms = [...manufacturingTerms, ...constructionTerms, ...financialTerms, ...meetingTerms];
    
    allTerms.forEach(term => {
      if (lowerText.includes(term)) {
        terms.push(term);
      }
    });
    
    return terms;
  }

  /**
   * Classify topic of the conversation
   */
  private classifyTopic(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('budget')) {
      return 'pricing';
    }
    if (lowerText.includes('delivery') || lowerText.includes('timeline') || lowerText.includes('schedule')) {
      return 'timeline';
    }
    if (lowerText.includes('quality') || lowerText.includes('specification') || lowerText.includes('requirement')) {
      return 'specifications';
    }
    if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('terms')) {
      return 'contract';
    }
    
    return 'general';
  }

  /**
   * Detect urgency level
   */
  private detectUrgency(text: string): 'low' | 'medium' | 'high' {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('immediately')) {
      return 'high';
    }
    if (lowerText.includes('soon') || lowerText.includes('quickly') || lowerText.includes('fast')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Extract action items from text
   */
  private extractActionItems(text: string): string[] {
    const actionItems: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Action phrases that indicate tasks or responsibilities
    const actionPhrases = [
      'need to', 'have to', 'must', 'should', 'will', 'going to',
      'action item', 'follow up', 'send', 'call', 'meet', 'review',
      'schedule', 'arrange', 'organize', 'prepare', 'complete',
      'do', 'make', 'create', 'update', 'check', 'verify', 'confirm',
      'discuss', 'decide', 'plan', 'implement', 'execute', 'finish'
    ];
    
    // Question phrases that might indicate action items
    const questionPhrases = [
      'what we have done', 'what are the minutes', 'what are the purposes',
      'how are you', 'what is the status', 'when will', 'where should'
    ];
    
    // Check for action phrases
    actionPhrases.forEach(phrase => {
      if (lowerText.includes(phrase) && text.length > 8) {
        actionItems.push(text);
      }
    });
    
    // Check for question phrases that might indicate action items
    questionPhrases.forEach(phrase => {
      if (lowerText.includes(phrase) && text.length > 10) {
        actionItems.push(text);
      }
    });
    
    return actionItems;
  }

  /**
   * Calculate speaking rate (words per minute)
   */
  private calculateSpeakingRate(text: string, start: number, end: number): number {
    const words = text.split(/\s+/).length;
    
    // If we don't have proper timing, estimate based on text length
    if (start === 0 && end === 0) {
      // Estimate: average person speaks ~150 words per minute
      // For short phrases, estimate based on word count
      if (words <= 3) return 120; // Short phrases
      if (words <= 6) return 140; // Medium phrases
      return 160; // Longer phrases
    }
    
    const durationMinutes = (end - start) / 60000; // Convert to minutes
    
    if (durationMinutes <= 0) {
      // Fallback to estimation
      if (words <= 3) return 120;
      if (words <= 6) return 140;
      return 160;
    }
    
    return Math.round(words / durationMinutes);
  }

  /**
   * Check if text is a duplicate of the last processed text
   */
  private isDuplicate(text: string): boolean {
    if (!this.lastProcessedText) {
      return false;
    }

    // Simple exact match check - only skip if text is exactly the same
    return text.toLowerCase().trim() === this.lastProcessedText.toLowerCase().trim();
  }

  /**
   * Enhanced duplicate detection against recent transcripts
   */
  private isDuplicateEnhanced(text: string): boolean {
    if (this.currentTranscripts.length === 0) {
      return false;
    }

    const currentText = text.toLowerCase().trim();
    
    // Check against the last 3 transcripts to avoid recent duplicates
    const recentTranscripts = this.currentTranscripts.slice(-3);
    
    for (const transcript of recentTranscripts) {
      const previousText = transcript.text.toLowerCase().trim();
      
      // Exact match
      if (currentText === previousText) {
        return true;
      }
      
      // Check if current text is contained in previous text (shorter version)
      if (previousText.includes(currentText) && currentText.length > 3) {
        return true;
      }
      
      // Check if previous text is contained in current text (replace shorter with longer)
      if (currentText.includes(previousText) && previousText.length > 3) {
        // Remove the shorter version
        const index = this.currentTranscripts.indexOf(transcript);
        if (index > -1) {
          this.currentTranscripts.splice(index, 1);
          console.log(`🔄 Replaced shorter transcript: "${transcript.text}" -> "${text}"`);
          return false; // Allow this to be added
        }
      }
    }
    
    return false;
  }



  /**
   * Check if one text is contained within another
   */
  private isTextContained(shortText: string, longText: string): boolean {
    // Remove punctuation and extra spaces for comparison
    const cleanShort = shortText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanLong = longText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    return cleanLong.includes(cleanShort) && cleanShort.length > 3;
  }

  /**
   * Save the current transcript to a local file using browser download
   */
  saveTranscript(): string | null {
    if (!this.currentMeetingId || this.currentTranscripts.length === 0) {
      console.warn('⚠️ No transcripts to save');
      return null;
    }

    try {
      const filename = this.generateFilename();
      const content = this.formatTranscriptContent();

      // Create blob and download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      console.log(`💾 Transcript saved: ${filename}`);
      return filename;
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
   * Format transcript content in a professional format with enhanced details
   */
  private formatTranscriptContent(): string {
    const meetingInfo = this.meetingInfo!;
    const endTime = new Date();
    const duration = meetingInfo.startTime 
      ? Math.round((endTime.getTime() - meetingInfo.startTime.getTime()) / 1000 / 60)
      : 0;

    // Clean and merge transcripts before formatting
    const cleanedTranscripts = this.cleanAndMergeTranscripts();

    let content = `================================================================================
MEETING MONITOR - ENHANCED TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: ${meetingInfo.meetingId}
  Title: ${meetingInfo.title}
  Industry: ${meetingInfo.industry || 'Not specified'}
  Meeting Type: ${meetingInfo.meetingType || 'Not specified'}
  Start Time: ${meetingInfo.startTime?.toLocaleString() || 'Unknown'}
  End Time: ${endTime.toLocaleString()}
  Duration: ${duration} minutes
  Language: ${meetingInfo.language || 'English'}
  Timezone: ${meetingInfo.timezone || 'Local'}

Attendees:
${meetingInfo.attendees?.map(attendee => 
  `  - ${attendee.name} (${attendee.role})${attendee.company ? ` - ${attendee.company}` : ''}${attendee.isHost ? ' [HOST]' : ''}`
).join('\n') || '  - No attendee details available'}

Agenda:
${meetingInfo.agenda?.map(item => `  - ${item}`).join('\n') || '  - No agenda specified'}

================================================================================
CLEAN TRANSCRIPT
================================================================================

`;

    // Clean transcript section - just speaker and text with timestamps
    cleanedTranscripts.forEach((transcript) => {
      const timestamp = transcript.timestamp ? transcript.timestamp.toLocaleTimeString() : 'Unknown';
      const speakerName = transcript.speakerName || 'Unknown';
      content += `${speakerName} (timestamp: ${timestamp}): ${transcript.text}\n`;
    });

    content += `\n================================================================================
ENHANCED TRANSCRIPT WITH AI ANALYSIS
================================================================================

`;

    // Group transcripts by speaker for AI analysis
    const speakerGroups = this.groupTranscriptsBySpeaker(cleanedTranscripts);
    
    speakerGroups.forEach((group, speakerIndex) => {
      content += `[${speakerIndex + 1}] Speaker: ${group.speakerName}\n`;
      content += `Total Utterances: ${group.transcripts.length}\n`;
      
      // AI Analysis for this speaker
      const speakerAnalysis = this.analyzeSpeaker(group.transcripts);
      content += `Analysis:\n`;
      content += `  - Overall Emotion: ${speakerAnalysis.overallEmotion} (Sentiment: ${speakerAnalysis.overallSentiment.toFixed(2)})\n`;
      content += `  - Questions Asked: ${speakerAnalysis.questionsAsked}\n`;
      content += `  - Action Items: ${speakerAnalysis.actionItems.length}\n`;
      content += `  - Technical Terms: ${speakerAnalysis.technicalTerms.length}\n`;
      content += `  - Average Speaking Rate: ${speakerAnalysis.avgSpeakingRate} WPM\n`;
      content += `  - Average Audio Quality: ${Math.round(speakerAnalysis.avgAudioQuality * 100)}%\n`;
      
      if (speakerAnalysis.technicalTerms.length > 0) {
        content += `  - Technical Terms Used: ${speakerAnalysis.technicalTerms.join(', ')}\n`;
      }
      
      if (speakerAnalysis.actionItems.length > 0) {
        content += `  - Action Items: ${speakerAnalysis.actionItems.join('; ')}\n`;
      }
      
      content += `\n`;
    });

    // Summary section
    content += `================================================================================
MEETING SUMMARY & INSIGHTS
================================================================================

Key Statistics:
  - Total Utterances: ${cleanedTranscripts.length}
  - Questions Asked: ${cleanedTranscripts.filter(t => t.isQuestion).length}
  - Action Items Identified: ${cleanedTranscripts.filter(t => t.followUpRequired).length}
  - Technical Terms Mentioned: ${new Set(cleanedTranscripts.flatMap(t => t.technicalTerms || [])).size}

Emotion Analysis:
  - Positive: ${cleanedTranscripts.filter(t => t.emotion === 'positive' || t.emotion === 'excited').length}
  - Neutral: ${cleanedTranscripts.filter(t => t.emotion === 'neutral').length}
  - Negative: ${cleanedTranscripts.filter(t => t.emotion === 'negative' || t.emotion === 'concerned').length}

Topics Discussed:
${Array.from(new Set(cleanedTranscripts.map(t => t.topic))).map(topic => 
  `  - ${topic}: ${cleanedTranscripts.filter(t => t.topic === topic).length} mentions`
).join('\n')}

Technical Terms Detected:
${Array.from(new Set(cleanedTranscripts.flatMap(t => t.technicalTerms || []))).map(term => 
  `  - ${term}: ${cleanedTranscripts.filter(t => t.technicalTerms?.includes(term)).length} mentions`
).join('\n')}

Action Items Requiring Follow-up:
${cleanedTranscripts.filter(t => t.followUpRequired).map((transcript, index) => 
  `  ${index + 1}. ${transcript.text} (${transcript.speakerName})`
).join('\n')}

================================================================================
Transcript generated on: ${endTime.toLocaleString()}
Enhanced with AI analysis for Meeting Monitor
================================================================================`;

    return content;
  }

  /**
   * Clean and merge similar consecutive transcripts
   */
  private cleanAndMergeTranscripts(): TranscriptEntry[] {
    if (this.currentTranscripts.length <= 1) {
      return this.currentTranscripts;
    }

    const merged: TranscriptEntry[] = [];
    let current = this.currentTranscripts[0];

    for (let i = 1; i < this.currentTranscripts.length; i++) {
      const next = this.currentTranscripts[i];
      
      // If current and next are very similar, merge them
      if (this.areTranscriptsSimilar(current.text, next.text)) {
        // Keep the longer/more complete version
        current = current.text.length >= next.text.length ? current : next;
      } else {
        // Add current to merged array and move to next
        merged.push(current);
        current = next;
      }
    }
    
    // Add the last transcript
    merged.push(current);
    
    return merged;
  }

  /**
   * Check if two transcripts are similar enough to merge
   */
  private areTranscriptsSimilar(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.6; // 60% similarity threshold for merging
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

    this.currentTranscripts.forEach((transcript, index) => {
      // Use relative time based on transcript order if timestamp is not reliable
      const timestamp = transcript.timestamp?.getTime() || (index * 5000); // 5 seconds apart
      const groupIndex = Math.floor(timestamp / intervalMs);
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
   * Group transcripts by speaker
   */
  private groupTranscriptsBySpeaker(transcripts: TranscriptEntry[]): Array<{
    speakerName: string;
    transcripts: TranscriptEntry[];
  }> {
    const groups: { [key: string]: TranscriptEntry[] } = {};
    
    transcripts.forEach(transcript => {
      const speakerName = transcript.speakerName || 'Unknown';
      if (!groups[speakerName]) {
        groups[speakerName] = [];
      }
      groups[speakerName].push(transcript);
    });
    
    return Object.entries(groups).map(([speakerName, transcripts]) => ({
      speakerName,
      transcripts
    }));
  }

  /**
   * Analyze a group of transcripts for a speaker
   */
  private analyzeSpeaker(transcripts: TranscriptEntry[]): {
    overallEmotion: string;
    overallSentiment: number;
    questionsAsked: number;
    actionItems: string[];
    technicalTerms: string[];
    avgSpeakingRate: number;
    avgAudioQuality: number;
  } {
    const emotions = transcripts.map(t => t.emotion || 'neutral');
    const sentiments = transcripts.map(t => t.sentimentScore || 0);
    const questionsAsked = transcripts.filter(t => t.isQuestion).length;
    const actionItems = transcripts.flatMap(t => t.actionItems || []);
    const technicalTerms = Array.from(new Set(transcripts.flatMap(t => t.technicalTerms || [])));
    const speakingRates = transcripts.map(t => t.speakingRate || 0).filter(rate => rate > 0);
    const audioQualities = transcripts.map(t => t.audioQuality || 0);
    
    // Calculate overall emotion (most common)
    const emotionCounts: { [key: string]: number } = {};
    emotions.forEach(emotion => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });
    const overallEmotion = Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'neutral';
    
    // Calculate average sentiment
    const overallSentiment = sentiments.length > 0 
      ? sentiments.reduce((sum, val) => sum + val, 0) / sentiments.length 
      : 0;
    
    // Calculate average speaking rate
    const avgSpeakingRate = speakingRates.length > 0
      ? Math.round(speakingRates.reduce((sum, rate) => sum + rate, 0) / speakingRates.length)
      : 0;
    
    // Calculate average audio quality
    const avgAudioQuality = audioQualities.length > 0
      ? audioQualities.reduce((sum, quality) => sum + quality, 0) / audioQualities.length
      : 0;
    
    return {
      overallEmotion,
      overallSentiment,
      questionsAsked,
      actionItems,
      technicalTerms,
      avgSpeakingRate,
      avgAudioQuality
    };
  }

  /**
   * End the current meeting session
   */
  endMeeting(): string | null {
    const filename = this.saveTranscript();
    this.currentMeetingId = null;
    this.currentTranscripts = [];
    this.lastProcessedText = '';
    this.meetingInfo = null;
    return filename;
  }

  /**
   * Get current transcript count
   */
  getTranscriptCount(): number {
    return this.currentTranscripts.length;
  }

  /**
   * Get current meeting ID
   */
  getCurrentMeetingId(): string | null {
    return this.currentMeetingId;
  }
}

// Export singleton instance
const localTranscriptStorageClient = new LocalTranscriptStorageClient();
export default localTranscriptStorageClient;
