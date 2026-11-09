const express = require('express');
const OpenAI = require('openai');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const supported = new Set(['user', 'assistant']);

router.post('/', limiter, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12 ||
      messages.some(message => !message || !supported.has(message.role) || typeof message.content !== 'string' || message.content.length > 3000)) {
    return res.status(400).json({ error: 'Send up to 12 valid messages, each under 3,000 characters.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'The AI tutor is not configured yet. Add OPENAI_API_KEY and OPENAI_MODEL to your .env file, then restart CodePath.' });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 700,
      messages: [
        { role: 'system', content: 'You are CodePath AI Tutor, a patient web development teacher. Explain concepts clearly, give short code examples, help debug errors, and respond in the language and script the student uses, including English, Urdu, and Roman Urdu. Keep answers focused on HTML, CSS, SEO, JavaScript, Node.js, and learning paths.' },
        ...messages
      ]
    });
    return res.json({ reply: completion.choices[0].message.content || 'I could not form a reply. Please try asking another way.' });
  } catch (error) {
    console.error('AI tutor request failed:', error.message);
    return res.status(502).json({ error: 'The AI tutor could not respond right now. Check your API configuration and try again.' });
  }
});

module.exports = router;