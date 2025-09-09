// Simple test script to verify insights processing
const testTranscriptChunks = [
  {
    text: "We need to increase the budget for Q2 by 20% to meet our delivery targets.",
    speakerId: "user-1",
    speakerName: "John",
    timestamp: new Date(),
    meetingId: "test-meeting-123"
  },
  {
    text: "I'm concerned about the timeline. The construction project is already behind schedule.",
    speakerId: "user-2", 
    speakerName: "Sarah",
    timestamp: new Date(),
    meetingId: "test-meeting-123"
  },
  {
    text: "Let's commit to having the prototype ready by next Friday. Who can take ownership of this?",
    speakerId: "user-1",
    speakerName: "John", 
    timestamp: new Date(),
    meetingId: "test-meeting-123"
  }
];

async function testInsightsProcessing() {
  console.log('🧪 Testing insights processing...');
  
  try {
    const response = await fetch('http://localhost:3000/api/insights/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meetingId: 'test-meeting-123',
        transcriptChunks: testTranscriptChunks,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Insights processing test passed:', result);
    
    // Wait a bit for processing
    console.log('⏳ Waiting for insights to be processed...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Fetch insights
    const insightsResponse = await fetch('http://localhost:3000/api/insights?meetingId=test-meeting-123');
    const insightsData = await insightsResponse.json();
    
    console.log('📊 Generated insights:', insightsData.insights);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInsightsProcessing();

