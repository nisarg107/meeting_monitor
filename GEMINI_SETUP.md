# Google Gemini API Setup Guide

This guide will help you get a Google Gemini API key for the insights system.

## Step 1: Get Google AI Studio Access

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. If you don't have access yet, you may need to join the waitlist

## Step 2: Create an API Key

1. Once in Google AI Studio, click on "Get API Key" in the left sidebar
2. Click "Create API Key"
3. Choose "Create API key in new project" (recommended)
4. Copy the generated API key

## Step 3: Add to Environment

Add the API key to your `.env.local` file:

```bash
GEMINI_API_KEY=your_actual_api_key_here
```

## Step 4: Test the Setup

You can test if your API key works by running:

```bash
node test-insights.js
```

## Important Notes

- **Free Tier**: Gemini API has a generous free tier
- **Rate Limits**: Free tier allows 15 requests per minute
- **Model**: We use `gemini-pro` which is the standard model
- **Cost**: Much more cost-effective than OpenAI

## Troubleshooting

### "API key not found" Error
- Make sure `GEMINI_API_KEY` is in your `.env.local` file
- Restart your development server after adding the key
- Check for typos in the environment variable name

### "Quota exceeded" Error
- You've hit the rate limit (15 requests/minute on free tier)
- Wait a minute and try again
- Consider upgrading to paid tier for higher limits

### "Invalid API key" Error
- Double-check the API key is copied correctly
- Make sure there are no extra spaces or characters
- Try generating a new API key

## Alternative: Use Vertex AI

If you have access to Google Cloud Platform, you can also use Vertex AI:

1. Enable the Vertex AI API in your GCP project
2. Create a service account with Vertex AI permissions
3. Use the service account key instead of the API key

This gives you higher rate limits and better enterprise features.

