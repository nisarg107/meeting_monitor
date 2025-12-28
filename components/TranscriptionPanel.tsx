'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Trash2, FileText, Download } from 'lucide-react';
import { useDeepgramTranscription } from '@/hooks/useDeepgramTranscription';
import { useParams } from 'next/navigation';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

interface TranscriptionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

const TranscriptionPanel = ({ isOpen, onToggle }: TranscriptionPanelProps) => {
  const { id } = useParams();
  const meetingId = Array.isArray(id) ? id[0] : id;
  const { transcripts, isTranscribing, startTranscription, stopTranscription, clearTranscripts, error, savedTranscriptPath, setSavedTranscriptPath } = useDeepgramTranscription(meetingId || '');
  const [autoScroll, setAutoScroll] = useState(true);

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
    setAutoScroll(isAtBottom);
  };

  const scrollToBottom = () => {
    const transcriptContainer = document.getElementById('transcript-container');
    if (transcriptContainer) {
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }
  };

  // Auto-scroll to bottom when new transcripts arrive
  if (autoScroll && transcripts.length > 0) {
    setTimeout(scrollToBottom, 100);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-20 w-80 bg-dark-1 rounded-lg shadow-lg border border-dark-2 z-50">
      <div className="flex items-center justify-between p-4 border-b border-dark-2">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-white" />
          <h3 className="text-white font-semibold">Live Transcript</h3>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ×
        </button>
      </div>

      <div className="p-4">
        {/* Transcription Controls */}
        <div className="flex items-center gap-2 mb-4">
          {!isTranscribing ? (
            <button
              onClick={startTranscription}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <Mic size={16} />
              Start
            </button>
          ) : (
            <button
              onClick={stopTranscription}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <MicOff size={16} />
              Stop
            </button>
          )}
          
          <button
            onClick={clearTranscripts}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors"
            disabled={transcripts.length === 0}
          >
            <Trash2 size={16} />
            Clear
          </button>
          
          <button
            onClick={() => {
              const filename = localTranscriptStorageClient.saveTranscript();
              if (filename) {
                setSavedTranscriptPath(filename);
              }
            }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors"
            disabled={transcripts.length === 0}
          >
            <Download size={16} />
            Save
          </button>
        </div>

        {/* Status */}
        <div className="mb-4">
          {isTranscribing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Recording... Capturing all participants' audio.
                <span className="text-xs text-gray-400 ml-2">(Deepgram - Speaker Diarization)</span>
              </div>
              <div className="text-xs text-blue-300 bg-blue-900/20 p-2 rounded border border-blue-600">
                ✅ <strong>Multi-speaker support:</strong> Captures audio from all participants (local mic + remote audio) and automatically identifies who is speaking.
              </div>
            </div>
          )}
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-600">
              ⚠️ {error}
              {error.includes('microphone') && (
                <div className="mt-1 text-xs text-red-300">
                  Please allow microphone access and try again.
                </div>
              )}
            </div>
          )}
          {savedTranscriptPath && (
            <div className="text-green-400 text-sm bg-green-900/20 p-2 rounded border border-green-600">
              ✅ Transcript saved to: {savedTranscriptPath.split('/').pop()}
            </div>
          )}
          {!isTranscribing && !error && transcripts.length === 0 && (
            <div className="text-gray-400 text-sm">
              💡 Click Start to begin live transcription
            </div>
          )}
          {transcripts.length > 0 && (
            <div className="text-blue-400 text-sm">
              📝 {transcripts.length} transcript entries captured
              <br />
              <span className="text-xs text-gray-400">
                (Filtered from {localTranscriptStorageClient.getTranscriptCount()} total entries)
              </span>
            </div>
          )}
        </div>

        {/* Transcripts */}
        <div
          id="transcript-container"
          className="max-h-96 overflow-y-auto space-y-2"
          onScroll={handleScroll}
        >
          {transcripts.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              No transcripts yet. Start recording to see live transcription.
            </div>
          ) : (
            transcripts.map((transcript, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  transcript.isFinal ? 'bg-dark-2' : 'bg-dark-3'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-blue-400 font-medium text-sm">
                    {transcript.speakerName || 'Speaker'}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {formatTime(transcript.timestamp || new Date())}
                  </span>
                </div>
                <p className="text-white text-sm">
                  {transcript.text}
                  {!transcript.isFinal && (
                    <span className="text-gray-400">...</span>
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TranscriptionPanel;

