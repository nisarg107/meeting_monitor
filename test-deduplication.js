// Test script for improved deduplication logic
const testTranscripts = [
  "enough",
  "enough one",
  "enough one two",
  "enough one two three",
  "enough one two three testing",
  "Enough. One, two, three, testing.",
  "testing",
  "Testing, testing.",
  "okay",
  "okay i",
  "okay i think",
  "okay i think now",
  "okay i think now everything",
  "okay i think now everything should be",
  "okay i think now everything should be saved properly",
  "Okay. I think now everything should be saved properly.",
  "hey",
  "hey you",
  "hey you buddy",
  "hey you buddy hello",
  "hey you buddy hello one",
  "hey you buddy hello one two three",
  "Hey, you, buddy. Hello. One, two, three."
];

console.log('🧪 Testing Improved Deduplication Logic\n');

// Simulate the deduplication logic
let processedTranscripts = [];
let lastProcessedText = '';

function cleanText(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.,!?;:()[\]{}"'`~@#$%^&*+=|\\<>/]/g, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\s*/g, '$1 ')
    .trim();
}

function isInterimResult(text) {
  const cleanText = text.trim();
  
  if (cleanText.length < 3) {
    return true;
  }
  
  const words = cleanText.split(/\s+/);
  if (words.length === 1 && words[0].length < 5) {
    return true;
  }
  
  const lastWord = words[words.length - 1];
  if (lastWord && lastWord.length < 3) {
    return true;
  }
  
  return false;
}

function isTextContained(shortText, longText) {
  const cleanShort = shortText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanLong = longText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return cleanLong.includes(cleanShort) && cleanShort.length > 3;
}

function isDuplicateEnhanced(text, transcripts) {
  if (transcripts.length === 0) {
    return false;
  }

  const currentWords = text.toLowerCase().split(/\s+/).filter(word => word.length > 1);
  
  for (const transcript of transcripts) {
    const previousWords = transcript.toLowerCase().split(/\s+/).filter(word => word.length > 1);
    
    if (isTextContained(text.toLowerCase(), transcript.toLowerCase())) {
      return true;
    }
    
    if (isTextContained(transcript.toLowerCase(), text.toLowerCase())) {
      const index = transcripts.indexOf(transcript);
      if (index > -1) {
        transcripts.splice(index, 1);
        console.log(`🔄 Would replace: "${transcript}" -> "${text}"`);
        return false;
      }
    }
    
    const commonWords = currentWords.filter(word => previousWords.includes(word));
    const similarity = commonWords.length / Math.max(currentWords.length, previousWords.length);
    
    if (similarity > 0.7) {
      return true;
    }
  }
  
  return false;
}

console.log('📝 Processing transcripts...\n');

testTranscripts.forEach((transcript, index) => {
  const cleanText = cleanText(transcript);
  
  console.log(`[${index + 1}] Original: "${transcript}"`);
  console.log(`    Cleaned: "${cleanText}"`);
  
  if (!cleanText.trim()) {
    console.log('    ❌ Skipped: Empty after cleaning');
  } else if (isInterimResult(cleanText)) {
    console.log('    ⏭️ Skipped: Interim result');
  } else if (isDuplicateEnhanced(cleanText, processedTranscripts)) {
    console.log('    🚫 Skipped: Duplicate');
  } else {
    processedTranscripts.push(cleanText);
    console.log('    ✅ Added to final transcript');
  }
  
  console.log('');
});

console.log('🎯 Final Results:');
console.log('================');
console.log(`Original transcripts: ${testTranscripts.length}`);
console.log(`Processed transcripts: ${processedTranscripts.length}`);
console.log(`Reduction: ${Math.round((1 - processedTranscripts.length / testTranscripts.length) * 100)}%`);

console.log('\n📄 Final Clean Transcript:');
console.log('========================');
processedTranscripts.forEach((transcript, index) => {
  console.log(`${index + 1}. ${transcript}`);
});

console.log('\n✅ Test completed!');
