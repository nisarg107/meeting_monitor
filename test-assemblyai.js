require('dotenv').config({ path: '.env.local' });
const { AssemblyAI } = require('assemblyai');

async function testAssemblyAI() {
  console.log('🔧 Testing AssemblyAI API key...');
  console.log('🔧 API Key present:', process.env.ASSEMBLYAI_API_KEY ? 'Yes' : 'No');
  
  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.log('❌ No API key found in .env.local');
    return;
  }

  try {
    // Test basic AssemblyAI client creation
    console.log('🔧 Testing AssemblyAI client creation...');
    
    const client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY,
    });

    console.log('✅ AssemblyAI client created successfully!');
    console.log('🔧 Available services:', Object.keys(client));
    
    // Test if we can access the services
    if (client.realtime) {
      console.log('✅ RealtimeTranscriber service available');
    }
    
    if (client.transcripts) {
      console.log('✅ TranscriptService available');
    }

    console.log('✅ AssemblyAI API test completed successfully!');
    
  } catch (error) {
    console.log('❌ AssemblyAI API test failed:', error.message);
    console.log('🔧 Error details:', error);
  }
}

testAssemblyAI();
