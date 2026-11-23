
require('dotenv').config();

const Groq = require('groq-sdk');

async function askLokalBitesAI(message) {
  if (!process.env.GROQ_API_KEY) {
    return 'Groq API key is missing. Please check your .env file.';
  }

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 15000,
    maxRetries: 0
  });

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content:
  'You are LokalBites AI, a friendly farmers market assistant. ' +
  'Always respond in clear, simple English. ' +
  'Use short paragraphs and simple numbered lists when helpful. ' +
  'Do not use Markdown formatting, asterisks, tables, or pipe symbols. ' +
  'Help customers with fresh produce, healthy eating, and shopping. ' +
  'Do not invent product prices, availability, or payment confirmations.'
        },
        {
          role: 'user',
          content: String(message)
        }
      ],
      max_completion_tokens: 300
    });

    return response.choices[0]?.message?.content ||
      'Sorry, I could not generate a response.';

  } catch (error) {
    console.error('Groq error status:', error.status || 'unknown');

    return '🌱 LokalBites AI is temporarily unavailable. Please try again.';
  }
}

module.exports = { askLokalBitesAI };
