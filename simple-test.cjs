// Simple test for local transcript storage
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Local Transcript Storage System...\n');

// Create transcripts directory
const transcriptsDir = path.join(process.cwd(), 'transcripts');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
  console.log('📁 Created transcripts directory:', transcriptsDir);
} else {
  console.log('📁 Transcripts directory already exists:', transcriptsDir);
}

// Test 1: Create a sample transcript file
console.log('\n📝 Test 1: Creating sample transcript file...');

const sampleTranscript = `================================================================================
MEETING TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: test-meeting-123
  Title: Test Team Meeting
  Start Time: 01/15/2024, 10:30:00
  End Time: 01/15/2024, 11:00:00
  Participants: John Doe, Jane Smith, Bob Johnson

Transcript:
--------------------------------------------------------------------------------

[00:00]
  Good morning everyone, let's start our daily standup (95% confidence)

[00:05]
  I'll go first. Yesterday I completed the user authentication feature (92% confidence)

[00:15]
  Today I'm planning to work on the dashboard improvements (88% confidence)

[00:25]
  Any blockers? No, everything is going smoothly (90% confidence)

--------------------------------------------------------------------------------
Transcript generated on: 01/15/2024, 11:00:15
Total entries: 4
================================================================================`;

const filename = `meeting-test-123-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const filepath = path.join(transcriptsDir, filename);

try {
  fs.writeFileSync(filepath, sampleTranscript, 'utf8');
  console.log('✅ Sample transcript saved successfully');
  console.log(`📁 File path: ${filepath}`);
} catch (error) {
  console.error('❌ Failed to save sample transcript:', error);
}

// Test 2: List all transcript files
console.log('\n📋 Test 2: Listing all transcript files...');
try {
  const files = fs.readdirSync(transcriptsDir);
  const txtFiles = files.filter(file => file.endsWith('.txt'));
  console.log(`✅ Found ${txtFiles.length} transcript file(s):`);
  txtFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });
} catch (error) {
  console.error('❌ Failed to list transcript files:', error);
}

// Test 3: Read the saved transcript
console.log('\n📖 Test 3: Reading saved transcript...');
try {
  const content = fs.readFileSync(filepath, 'utf8');
  console.log('✅ Transcript content read successfully');
  console.log('📄 First 300 characters:');
  console.log(content.substring(0, 300) + '...');
} catch (error) {
  console.error('❌ Failed to read transcript:', error);
}

// Test 4: Create another transcript file
console.log('\n📝 Test 4: Creating another transcript file...');

const anotherTranscript = `================================================================================
MEETING TRANSCRIPT
================================================================================

Meeting Details:
  Meeting ID: test-meeting-456
  Title: Product Review Meeting
  Start Time: 01/15/2024, 14:00:00
  Participants: Alice Brown, Charlie Wilson

Transcript:
--------------------------------------------------------------------------------

[00:00]
  Welcome to the product review meeting (96% confidence)

[00:03]
  Let's discuss the new features we've implemented (89% confidence)

--------------------------------------------------------------------------------
Transcript generated on: 01/15/2024, 14:05:00
Total entries: 2
================================================================================`;

const filename2 = `meeting-test-456-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const filepath2 = path.join(transcriptsDir, filename2);

try {
  fs.writeFileSync(filepath2, anotherTranscript, 'utf8');
  console.log('✅ Second transcript saved successfully');
  console.log(`📁 File path: ${filepath2}`);
} catch (error) {
  console.error('❌ Failed to save second transcript:', error);
}

// Test 5: Final count
console.log('\n📊 Test 5: Final transcript count...');
try {
  const files = fs.readdirSync(transcriptsDir);
  const txtFiles = files.filter(file => file.endsWith('.txt'));
  console.log(`✅ Total transcript files: ${txtFiles.length}`);
  console.log('📁 All transcript files:');
  txtFiles.forEach((file, index) => {
    const stats = fs.statSync(path.join(transcriptsDir, file));
    console.log(`   ${index + 1}. ${file} (${stats.size} bytes)`);
  });
} catch (error) {
  console.error('❌ Failed to get final count:', error);
}

console.log('\n🎉 Local transcript storage system test completed!');
console.log('\n📁 Check the "transcripts" directory for generated files.');
console.log('💡 You can now use the local transcription system in your meetings.');
console.log('\n🚀 To test the full system:');
console.log('   1. Start the development server: npm run dev');
console.log('   2. Open http://localhost:3000');
console.log('   3. Join a meeting and click the transcript icon');
console.log('   4. Click "Start" to begin live transcription');
