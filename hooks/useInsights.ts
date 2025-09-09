'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { InsightsProcessor, TranscriptChunk } from '@/lib/insightsProcessor';

interface Insight {
  _id: string;
  text: string;
  category: 'decision' | 'risk' | 'blocker' | 'commitment' | 'action_item' | 'question' | 'concern';
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
  speakerName?: string;
  timestamp: string;
  context?: string;
}

export const useInsights = (meetingId: string) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processorRef = useRef<InsightsProcessor | null>(null);

  const addTranscriptChunk = useCallback(async (chunk: TranscriptChunk) => {
    if (!meetingId) return;

    try {
      const response = await fetch('/api/insights/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          transcriptChunks: [chunk],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process transcript chunk');
      }
    } catch (err) {
      console.error('Error processing transcript chunk:', err);
      setError(err instanceof Error ? err.message : 'Failed to process transcript chunk');
    }
  }, [meetingId]);

  const fetchInsights = useCallback(async () => {
    if (!meetingId) return;

    try {
      const response = await fetch(`/api/insights?meetingId=${meetingId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      setInsights(data.insights || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    }
  }, [meetingId]);

  const startInsightsProcessing = useCallback(() => {
    if (!meetingId) return;

    setIsProcessing(true);
    setError(null);
    fetchInsights();
  }, [meetingId, fetchInsights]);

  const stopInsightsProcessing = useCallback(async () => {
    if (!meetingId) return;

    try {
      await fetch(`/api/insights/process?meetingId=${meetingId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Error stopping insights processing:', err);
    }

    setIsProcessing(false);
  }, [meetingId]);

  // Poll for new insights every 10 seconds when processing
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(fetchInsights, 10000);
    return () => clearInterval(interval);
  }, [isProcessing, fetchInsights]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (meetingId) {
        stopInsightsProcessing();
      }
    };
  }, [meetingId, stopInsightsProcessing]);

  return {
    insights,
    isProcessing,
    error,
    addTranscriptChunk,
    fetchInsights,
    startInsightsProcessing,
    stopInsightsProcessing,
  };
};
