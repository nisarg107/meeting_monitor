'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle, Clock, AlertTriangle, MessageSquare, Target, HelpCircle } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

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

interface InsightsPanelProps {
  meetingId: string;
  isVisible: boolean;
  onToggle: () => void;
}

const categoryIcons = {
  decision: CheckCircle,
  risk: AlertTriangle,
  blocker: AlertCircle,
  commitment: Target,
  action_item: Target,
  question: HelpCircle,
  concern: MessageSquare,
};

const categoryColors = {
  decision: 'bg-green-100 text-green-800 border-green-200',
  risk: 'bg-red-100 text-red-800 border-red-200',
  blocker: 'bg-orange-100 text-orange-800 border-orange-200',
  commitment: 'bg-blue-100 text-blue-800 border-blue-200',
  action_item: 'bg-purple-100 text-purple-800 border-purple-200',
  question: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  concern: 'bg-gray-100 text-gray-800 border-gray-200',
};

const urgencyColors = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-600',
  high: 'bg-red-100 text-red-600',
};

export default function InsightsPanel({ meetingId, isVisible, onToggle }: InsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const fetchInsights = async () => {
    if (!meetingId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/insights?meetingId=${meetingId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      
      const data = await response.json();
      setInsights(data.insights || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    
    // Setup WebSocket connection for real-time updates
    const newSocket = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to insights WebSocket');
      newSocket.emit('join-meeting', meetingId);
    });

    newSocket.on('insights', (data: { meetingId: string; insights: Insight[] }) => {
      if (data.meetingId === meetingId) {
        setInsights(prev => [...data.insights, ...prev]);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from insights WebSocket');
    });

    // Fallback polling every 30 seconds
    const interval = setInterval(fetchInsights, 30000);
    
    return () => {
      clearInterval(interval);
      newSocket.disconnect();
    };
  }, [meetingId]);

  const formatTime = (ts: string | undefined, createdAt?: string) => {
    const raw = ts || createdAt || new Date().toISOString();
    return new Date(raw).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryIcon = (category: string) => {
    const IconComponent = categoryIcons[category as keyof typeof categoryIcons] || MessageSquare;
    return <IconComponent className="w-4 h-4" />;
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white p-3 rounded-l-lg shadow-lg hover:bg-blue-700 transition-colors z-50"
      >
        <div className="flex flex-col items-center">
          <MessageSquare className="w-5 h-5" />
          <span className="text-xs mt-1">Insights</span>
          {insights.length > 0 && (
            <Badge className="mt-1 bg-red-500 text-white text-xs">
              {insights.length}
            </Badge>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Live Insights</h3>
          <button
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span className="sr-only">Close insights panel</span>
            ×
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Real-time meeting insights and key moments
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2">Loading insights...</p>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-600">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            <p>{error}</p>
            <button
              onClick={fetchInsights}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && insights.length === 0 && (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No insights yet</p>
            <p className="text-sm">Insights will appear as the meeting progresses</p>
          </div>
        )}

        {!loading && !error && insights.length > 0 && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {insights.map((insight) => {
                const IconComponent = categoryIcons[insight.category];
                const categoryColor = categoryColors[insight.category];
                const urgencyColor = urgencyColors[insight.urgency];

                return (
                  <Card key={insight._id} className="p-3 border-l-4 border-l-blue-500">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`p-1 rounded-full ${categoryColor}`}>
                          <IconComponent className="w-3 h-3" />
                        </div>
                        <Badge className={`text-xs ${categoryColor}`}>
                          {insight.category.replace('_', ' ')}
                        </Badge>
                        <Badge className={`text-xs ${urgencyColor}`}>
                          {insight.urgency}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(insight.timestamp as any, (insight as any).createdAt)}</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-900 mb-2">{insight.text}</p>

                    {insight.speakerName && (
                      <p className="text-xs text-gray-600 mb-1">
                        — {insight.speakerName}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${insight.confidence * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    {insight.context && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                          View context
                        </summary>
                        <p className="text-xs text-gray-600 mt-1 italic">
                          "{insight.context}"
                        </p>
                      </details>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{insights.length} insights</span>
          <button
            onClick={fetchInsights}
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
