export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { answers, location } = req.body;

    if (!Array.isArray(answers)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const GEMINI_MODEL    = 'gemma-3-27b-it';
    const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const now = new Date();
    const timeStr = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    const locationInfo = location
        ? `ユーザーの現在地: 緯度 ${location.latitude.toFixed(4)}, 経度 ${location.longitude.toFixed(4)}`
        : 'ユーザーの現在地: 不明';

    const systemPrompt = `あなたはアキネイター形式のお出かけ提案AIです。
現在時刻: ${timeStr}
${locationInfo}

ルール:
- 最初の質問は必ず「今どんな気分ですか？」から始める
- 最低2回・最大4回質問して情報を収集してから行き先を提案する
- 前の回答を踏まえて次の質問・選択肢を動的に変える（文脈を考慮して絞り込む）
- 選択肢は3〜4個、簡潔な日本語で
- 現在時刻と位置情報（ある場合）を考慮した提案をする
- 回答は必ず以下2種類のJSONのどちらかのみを返す（余計なテキスト・マークダウン不要）

質問フェーズ（まだ情報収集中の場合）:
{"type":"question","question":"次の質問文","options":["選択肢A","選択肢B","選択肢C"]}

提案フェーズ（情報が揃い行き先を提案できる場合）:
{"type":"destination","destination":{"name":"☕ カフェ","description":"説明文","duration":"1〜2時間","budget":"500〜1500円","people":"一人がおすすめ","vibe":"リラックス","searchType":"cafe"}}

searchType は次のいずれかを使う: cafe, park, spa, restaurant, art_gallery, hiking, karaoke, bar, bowling_alley, gym, amusement_park, art_studio, shopping_mall, temple, beach`;

    // Build conversation history from answers
    const conversationHistory = [];
    for (const answer of answers) {
        conversationHistory.push({ role: 'model', parts: [{ text: JSON.stringify({ type: 'question', question: answer.question, options: [] }) }] });
        conversationHistory.push({ role: 'user',  parts: [{ text: answer.selectedOption }] });
    }

    const contentsWithSystem = [
        { role: 'user',  parts: [{ text: `[システム設定]\n${systemPrompt}` }] },
        { role: 'model', parts: [{ text: '了解しました。設定に従って会話を進めます。' }] },
        ...conversationHistory,
        { role: 'user',  parts: [{ text: answers.length === 0 ? '開始してください。最初の質問をしてください。' : '次の質問または提案をしてください。' }] },
    ];

    try {
        const response = await fetch(GEMINI_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contentsWithSystem,
                generationConfig: {
                    temperature:     0.8,
                    maxOutputTokens: 512,
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

        // Extract JSON from the reply (strip markdown code fences if present)
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: 'Invalid response format from AI' });
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
        }

        if (parsed.type !== 'question' && parsed.type !== 'destination') {
            return res.status(500).json({ error: 'Unexpected response type from AI' });
        }

        return res.status(200).json(parsed);

    } catch (e) {
        console.error('Akinator proxy error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
