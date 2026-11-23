require('dotenv').config();

const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 15000,
  maxRetries: 0
});

async function askLokalBitesAI(message) {
  if (!process.env.GROQ_API_KEY) {
    return 'Groq API key is missing.';
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content:
            'You are LokalBites AI, a friendly farmers market assistant. ' +
            'Help customers with products, shopping and ordering. ' +
            'Reply in English or Cebuano. ' +
            'Do not invent prices, stock, or payment confirmations.'
        },
        {
          role: 'user',
          content: String(message)
        }
      ],
      max_completion_tokens: 300
    });

    return response.choices[0]?.message?.content ||
      'No response available.';
  } catch (error) {
    console.error('Groq error:', error.status || error.message);
    return 'LokalBites AI is temporarily unavailable.';
  }
}

module.exports = { askLokalBitesAI };