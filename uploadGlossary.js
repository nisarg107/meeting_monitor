import fs from "fs";
import "dotenv/config";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";

// Init HuggingFace and Supabase
const hf = new HfInference(process.env.HF_API_KEY);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadGlossary() {
  // Step 1: Load JSON data
  const glossary = JSON.parse(fs.readFileSync("glossary.json", "utf-8"));

  for (const item of glossary) {
    try {
      // Step 2: Create embedding using HuggingFace model
      const inputText = `${item.term}: ${item.definition}`;
      const embedding = await hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2", // free, 384-dim
        inputs: inputText
      });

      // Some HuggingFace responses return nested arrays → flatten
      const vector = Array.isArray(embedding[0]) ? embedding[0] : embedding;

      // Step 3: Insert into Supabase
      const { error } = await supabase.from("industry_glossary").insert({
        industry: item.industry,
        term: item.term,
        definition: item.definition,
        embedding: vector
      });

      if (error) {
        console.error(`Error inserting ${item.term}:`, error);
      } else {
        console.log(`Inserted ${item.term}`);
      }

    } catch (err) {
      console.error("Error processing term:", item.term, err);
    }
  }

  console.log("All glossary items uploaded!");
}

uploadGlossary();
