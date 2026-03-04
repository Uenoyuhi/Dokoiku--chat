export default async function handler(req, res) {
    // POST以外は弾く
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { conversationHistory, systemPrompt } = req.body;

    // 入力チェック
    if (!conversationHistory || !systemPrompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const GEMINI_MODEL    = 'gemini-2.5-flash';
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    try {
        const response = await fetch(GEMINI_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemPrompt }],
                },
                contents: conversationHistory,
                generationConfig: {
                    temperature:     0.8,
                    maxOutputTokens: 2048,
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error?.message ?? 'Gemini API error'
            });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return res.status(200).json({ reply: replyText });

    } catch (e) {
        console.error('Gemini proxy error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}