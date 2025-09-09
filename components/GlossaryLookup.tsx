"use client";

import { useState } from "react";

export default function GlossaryLookup() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | { type: "match"; term: string; definition: string; score?: number | null }
    | { type: "explanation"; text: string }
    | { type: "error"; text: string }
    | null
  >(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch("/api/glossary/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword })
      });
      const data = await resp.json();
      if (data?.match) {
        setResult({ type: "match", term: data.match.term, definition: data.match.definition, score: data.match.score });
      } else if (data?.explanation) {
        setResult({ type: "explanation", text: data.explanation });
      } else if (data?.error) {
        setResult({ type: "error", text: data.error });
      } else {
        setResult({ type: "error", text: "No result returned." });
      }
    } catch (err: any) {
      setResult({ type: "error", text: err?.message || "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-xl space-y-3 text-black">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Look up a term..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit" className="px-4 py-2 bg-black text-white rounded" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {result && (
        <div className="border rounded p-3 bg-white text-black">
          {result.type === "match" && (
            <div>
              <div className="font-semibold text-black">{result.term}</div>
              <div className="text-sm mt-1 text-black">{result.definition}</div>
              {typeof result.score === "number" && (
                <div className="text-xs text-gray-500 mt-2">Similarity: {result.score.toFixed(3)}</div>
              )}
            </div>
          )}
          {result.type === "explanation" && (
            <div className="text-sm text-black">{result.text}</div>
          )}
          {result.type === "error" && (
            <div className="text-sm text-red-600">{result.text}</div>
          )}
        </div>
      )}
    </div>
  );
}


