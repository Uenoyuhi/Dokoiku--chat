export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { conversationHistory, systemPrompt } = req.body;

    if (!conversationHistory || !systemPrompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const GEMINI_MODEL    = 'gemma-3-27b-it';
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    // ✅ Gemma 3 は system_instruction 非対応のため、
    //    システムプロンプトを会話履歴の先頭に user/model のペアとして埋め込む
    const contentsWithSystem = [
        { role: 'user',  parts: [{ text: `[システム設定]\n${systemPrompt}` }] },
        { role: 'model', parts: [{ text: '了解しました。設定に従って会話を進めます。' }] },
        ...conversationHistory,
    ];

    try {
        const response = await fetch(GEMINI_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contentsWithSystem,
                generationConfig: {
                    temperature:     0.8,
                    maxOutputTokens: 2048,
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const retryDelay = data?.error?.details
                ?.find(d => d['@type']?.includes('RetryInfo'))
                ?.retryDelay;
            const retryAfterMs = retryDelay
                ? Math.ceil(parseFloat(retryDelay) * 1000)
                : null;

            return res.status(response.status).json({
                error:        data?.error?.message ?? 'Gemini API error',
                retryAfterMs: retryAfterMs,
            });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return res.status(200).json({ reply: replyText });

    } catch (e) {
        console.error('Gemini proxy error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}