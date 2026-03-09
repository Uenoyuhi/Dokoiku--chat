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
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const timeStr = jstNow.toISOString().replace('T', ' ').substring(0, 16) + ' JST';

    const locationStr = location
        ? `ユーザーの現在地: 緯度 ${location.latitude.toFixed(4)}, 経度 ${location.longitude.toFixed(4)}`
        : 'ユーザーの現在地: 不明';

    const systemPrompt = `あなたはアキネイター形式のお出かけ提案AIです。

現在時刻: ${timeStr}
${locationStr}

ルール:
- 最初の質問は必ず「今どんな気分ですか？」から始める
- 最低2回・最大4回質問して情報を収集してから提案する
- 前の回答を踏まえて次の質問・選択肢を変える（動的に絞り込む）
- 選択肢は3〜4個、簡潔な日本語で
- 現在時刻と位置情報（ある場合）を考慮した提案をする
- 回答は必ず以下のJSONのみを返す（余計なテキスト不要、マークダウン不要）

情報収集中（まだ質問が必要な場合）:
{"type":"question","question":"次の質問文","options":["選択肢A","選択肢B","選択肢C"]}

情報が揃った時（提案する場合）:
{"type":"destination","destination":{"name":"☕ カフェ","description":"説明文","duration":"1〜2時間","budget":"500〜1500円","people":"一人がおすすすめ","vibe":"リラックス","searchType":"cafe"}}

searchTypeは以下のいずれか: cafe, park, spa, restaurant, art_gallery, hiking, karaoke, bar, bowling_alley, gym, amusement_park, art_studio, shopping_mall, temple, beach`;

    const conversationHistory = [];

    if (answers.length === 0) {
        // 初回: 最初の質問を生成させる
        conversationHistory.push({
            role: 'user',
            parts: [{ text: '今の状況に合ったお出かけ先を提案してください。まず最初の質問をしてください。' }],
        });
    } else {
        // 過去の質問と回答を会話履歴として構築
        conversationHistory.push({
            role: 'user',
            parts: [{ text: '今の状況に合ったお出かけ先を提案してください。まず最初の質問をしてください。' }],
        });
        for (const ans of answers) {
            // AIの質問（質問文のみ）
            conversationHistory.push({
                role: 'model',
                parts: [{ text: `{"type":"question","question":${JSON.stringify(ans.question)},"options":[]}` }],
            });
            // ユーザーの回答
            conversationHistory.push({
                role: 'user',
                parts: [{ text: `「${ans.selectedOption}」を選びました。次の質問または提案をしてください。` }],
            });
        }
    }

    const contentsWithSystem = [
        { role: 'user',  parts: [{ text: `[システム設定]\n${systemPrompt}` }] },
        { role: 'model', parts: [{ text: '了解しました。設定に従ってアキネイター形式で進めます。' }] },
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

        // JSONを抽出してパース
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: 'AIの応答をパースできませんでした' });
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            return res.status(500).json({ error: 'AIの応答が無効なJSONです' });
        }

        return res.status(200).json(parsed);

    } catch (e) {
        console.error('Akinator API error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
