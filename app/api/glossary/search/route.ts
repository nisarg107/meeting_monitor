import { NextRequest } from "next/server";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";

type GlossaryRow = {
  id?: string;
  industry?: string | null;
  term: string;
  definition: string;
  embedding: number[];
};

function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(req: NextRequest) {
  try {
    const { keyword, industry } = await req.json();
    if (!keyword || typeof keyword !== "string") {
      return new Response(JSON.stringify({ error: "keyword is required" }), { status: 400 });
    }

    const hfApiKey = process.env.HF_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!hfApiKey || !supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured: missing env vars" }), { status: 500 });
    }

    const hf = new HfInference(hfApiKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const embeddingResp = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: keyword
    });
    const queryEmbedding: number[] = Array.isArray(embeddingResp[0]) ? embeddingResp[0] as number[] : (embeddingResp as number[]);

    const query = supabase
      .from("industry_glossary")
      .select("id,industry,term,definition,embedding");
    const { data, error } = industry ? await query.eq("industry", industry) : await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const rows: GlossaryRow[] = (data as unknown as GlossaryRow[]) || [];
    let best: { row: GlossaryRow | null; score: number } = { row: null, score: -1 };
    for (const row of rows) {
      if (!Array.isArray(row.embedding)) continue;
      const score = computeCosineSimilarity(queryEmbedding, row.embedding);
      if (score > best.score) {
        best = { row, score };
      }
    }

    const threshold = 0.60;
    if (best.row && best.score >= threshold) {
      return new Response(
        JSON.stringify({
          match: {
            term: best.row.term,
            definition: best.row.definition,
            industry: best.row.industry,
            score: best.score
          }
        }),
        { status: 200 }
      );
    }

    if (!geminiKey) {
      return new Response(
        JSON.stringify({
          match: null,
          explanation: "No close glossary match found and GEMINI_API_KEY not configured."
        }),
        { status: 200 }
      );
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Explain the term "${keyword}" in 1–2 concise sentences for a general audience.`
                }
              ]
            }
          ]
        })
      }
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ match: null, explanation: null, error: txt }), { status: 200 });
    }
    const json = await resp.json();
    const explanation = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    return new Response(JSON.stringify({ match: null, explanation }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
}



