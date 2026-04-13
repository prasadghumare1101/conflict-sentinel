const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { systemPrompt, userPrompt } = req.body || {};
  if (!systemPrompt && !userPrompt) return res.status(400).json({ error: 'systemPrompt and userPrompt are required.' });
  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) return res.status(500).json({ error: 'HF_TOKEN not configured.' });

  try {
    const response = await axios.post(
      'https://router.huggingface.co/v1/chat/completions',
      {
        model: 'moonshotai/Kimi-K2.5:novita',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 55000,
      }
    );
    res.json({ text: response.data.choices[0].message.content });
  } catch (error) {
    console.error('HuggingFace error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'HuggingFace API error',
      details: error.response?.data,
    });
  }
};
