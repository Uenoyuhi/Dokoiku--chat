import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

// ══════════════════════════════════════════════
//  定数
// ══════════════════════════════════════════════
const MAX_TURNS    = 4;
const RETRY_DELAYS = [5000, 10000, 20000]; // retryAfterMs がない場合のフォールバック用

// ══════════════════════════════════════════════
//  システムプロンプト生成
// ══════════════════════════════════════════════
function buildSystemPrompt(location, turnCount, userProfile) {
    const hour = new Date().getHours();
    const time = hour < 12 ? '午前' : hour < 17 ? '午後' : '夜';
    const loc  = location
        ? `緯度${location.latitude.toFixed(3)},経度${location.longitude.toFixed(3)}`
        : '不明';
    const forceSuggest = turnCount >= MAX_TURNS
        ? '\n【重要】今が最終ターンです。必ず今すぐ提案してJSONを付けること。'
        : '';

    return `あなたはお出かけ提案AIです。
現在時刻:${time} 現在地:${loc}
${userProfile ? `
## ユーザーのパーソナル情報（最重要・必ず参照）
以下はユーザーが事前に登録した自己紹介です。提案・会話の全体を通してこの情報を活かすこと。
ただし、会話の中でユーザーが言及した情報はそちらを優先すること。

${userProfile}

---
` : ''}

## 絶対に守るルール
- 質問は1回につき1つだけ
- 短い日本語で話す。友達に話しかける感じで
- 最低3回質問してから提案する。4ターン目は必ず提案する
- 提案するときは会話文の後に必ずJSONブロックを付ける（省略禁止）
- 会話中はJSONを付けない

## 引き出すべき情報（最低限）
以下の3つだけ把握できれば十分。あとは自由に会話してよい。
1. 今の気分・テンション
2. 誰と行くか
3. 時間・予算の感覚

## 質問の自由度
定型文は使わなくていい。ユーザーの返答に合わせて自然に会話を展開すること。
たとえば愚痴を言ってきたら共感してから次の質問へ、
テンションが高ければそれに乗っかるなど、会話の流れを大切にする。
${forceSuggest}

## 提案フォーマット
提案するときは会話文の後に必ず以下のJSONコードブロックを付ける。

\`\`\`json
{"proposal":true,"name":"場所名","description":"この場所をすすめる理由を2文で","duration":"滞在時間の目安","budget":"費用の目安","people":"向いている人数","vibe":"一言で雰囲気","searchType":"Places API検索用の日本語ワード（例:カフェ、公園、映画館）"}
\`\`\``;
}

// ═══════════════════��══════════════════════════
//  距離計算
// ══════════════════════════════════════════════
function calcDist(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180)
               * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000);
}

// ══════════════════════════════════════════════
//  メインコンポーネント
// ══════════════════════════════════════════════
export default function ChatPage() {
    const router = useRouter();

    // ── 状態 ──
    const [messages,      setMessages]      = useState([]);
    const [inputText,     setInputText]     = useState('');
    const [isLoading,     setIsLoading]     = useState(false);
    const [location,      setLocation]      = useState(null);
    const [locStatus,     setLocStatus]     = useState('loading');
    const [locText,       setLocText]       = useState('位置情報: 取得中...');
    const [mapsLoaded,    setMapsLoaded]    = useState(false);
    const [proposal,      setProposal]      = useState(null);
    const [places,        setPlaces]        = useState([]);
    const [placesStatus,  setPlacesStatus]  = useState('idle');
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [travelMode,    setTravelMode]    = useState('transit');
    const [routeInfo,     setRouteInfo]     = useState(null);
    const [userProfile,   setUserProfile]   = useState('');

    const historyRef     = useRef([]);
    const turnRef        = useRef(0);
    const isSendingRef   = useRef(false);   // ✅ 修正⑤ 重複送信防止フラグ
    const isComposingRef = useRef(false);   // IME入力中フラグ
    const chatAreaRef    = useRef(null);
    const mapRef         = useRef(null);
    const inputRef       = useRef(null);

    // ── プロフィール読み込み ──
    useEffect(() => {
        const saved = localStorage.getItem('dokoiku_profile');
        if (saved) setUserProfile(saved);
    }, []);

    // ── スクロール ──
    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // ── 位置情報取得 ──
    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setLocStatus('err');
            setLocText('位置情報: 非対応');
            addAiMessage('こんにちは！気分から行き先を一緒に考えよう😊\n今日はどんな感じにしたい？');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                const loc = {
                    latitude:  pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy:  pos.coords.accuracy,
                };
                setLocation(loc);
                setLocStatus('ok');
                setLocText(`📍 取得済み (±${Math.round(pos.coords.accuracy)}m)`);
                loadMapsAPI();
                addAiMessage('こんにちは！今日はどこへ行きたい気分？気軽に話しかけてみて😊');
            },
            () => {
                setLocStatus('err');
                setLocText('位置情報: 取得できませんでした');
                addAiMessage('こんにちは！気分から行き先を一緒に考えよう😊\n今日はどんな感じにしたい？');
                loadMapsAPI();
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
    }, []);

    // ── Google Maps API 読み込み（重複防止）──
    function loadMapsAPI() {
        if (document.getElementById('gmaps-script')) {
            if (window.google?.maps) setMapsLoaded(true);
            return;
        }
        const s = document.createElement('script');
        s.id    = 'gmaps-script';
        s.src   = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places,marker&loading=async`;
        s.async = true;
        s.onload = () => setMapsLoaded(true);
        document.head.appendChild(s);
    }

    // ── 地図描画 ──
    useEffect(() => {
        if (!mapsLoaded || !selectedPlace || !location || !mapRef.current) return;
        const map = new window.google.maps.Map(mapRef.current, {
            zoom: 14,
            center: {
                lat: (location.latitude  + selectedPlace.location.latitude)  / 2,
                lng: (location.longitude + selectedPlace.location.longitude) / 2,
            },
            mapTypeControl: false, fullscreenControl: false, streetViewControl: false,
            mapId: 'dokoiku_map',
        });
        new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: location.latitude, lng: location.longitude },
            map, title: '現在地',
        });
        new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: selectedPlace.location.latitude, lng: selectedPlace.location.longitude },
            map, title: selectedPlace.displayName.text,
        });
        new window.google.maps.Polyline({
            path: [
                { lat: location.latitude,  lng: location.longitude },
                { lat: selectedPlace.location.latitude, lng: selectedPlace.location.longitude },
            ],
            geodesic: true, strokeColor: '#667eea', strokeOpacity: 0.5, strokeWeight: 3, map,
        });
    }, [mapsLoaded, selectedPlace, location]);

    // ── ルート情報更新 ──
    useEffect(() => {
        if (!selectedPlace || !location) return;
        const dist     = calcDist(location.latitude, location.longitude, selectedPlace.location.latitude, selectedPlace.location.longitude);
        const speed    = { transit: 3, walking: 1.4, driving: 15, bicycling: 6 }[travelMode];
        const minutes  = Math.ceil(dist / speed / 60);
        const distStr  = dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(2)}km`;
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${selectedPlace.location.latitude},${selectedPlace.location.longitude}&travelmode=${travelMode}`;
        setRouteInfo({ distStr, minutes, gmapsUrl });
    }, [selectedPlace, travelMode, location]);

    // ── メッセージ追加ヘルパー ──
    function addAiMessage(text) {
        setMessages(prev => [...prev, { role: 'ai', text }]);
    }

    // ── 送信処理 ──
    async function handleSend() {
        const text = inputText.trim();
        // ✅ 修正⑤ 重複送信・IME中・ロード中・提案済みをすべてガード
        if (!text || isLoading || proposal || isSendingRef.current || isComposingRef.current) return;

        isSendingRef.current = true;
        setInputText('');
        setMessages(prev => [...prev, { role: 'user', text }]);
        setIsLoading(true);
        setTimeout(() => inputRef.current?.focus(), 0);

        historyRef.current.push({ role: 'user', parts: [{ text }] });
        turnRef.current++;

        let reply = null;
        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            try {
                const res = await fetch('/api/gemini', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        // ✅ 修正④ 全履歴ではなく最新8件だけ送る（トークン節約・429対策）
                        conversationHistory: historyRef.current.slice(-8),
                        systemPrompt: buildSystemPrompt(location, turnRef.current, userProfile),
                    }),
                });
                const data = await res.json();

                if (!res.ok) {
                    const status = res.status;
                    if ((status === 429 || status === 500 || status === 503) && attempt < RETRY_DELAYS.length) {
                        // ✅ 修正③ Gemini が指定する retryAfterMs を優先、なければフォールバック値を使う
                        const waitMs  = data.retryAfterMs ?? RETRY_DELAYS[attempt];
                        const waitSec = Math.ceil(waitMs / 1000);
                        setMessages(prev => [...prev, { role: 'ai', text: `⏳ 混み合っています。${waitSec}秒後に再試行します...`, isRetry: true }]);
                        await new Promise(r => setTimeout(r, waitMs));
                        setMessages(prev => prev.filter(m => !m.isRetry));
                        continue;
                    }
                    throw new Error(data.error ?? `HTTPエラー ${status}`);
                }
                reply = data.reply;
                break;
            } catch (e) {
                if (attempt === RETRY_DELAYS.length) {
                    setMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${e.message}` }]);
                    historyRef.current.pop();
                    turnRef.current--;
                    setIsLoading(false);
                    isSendingRef.current = false;
                    return;
                }
            }
        }

        if (!reply) {
            setIsLoading(false);
            isSendingRef.current = false;
            return;
        }

        historyRef.current.push({ role: 'model', parts: [{ text: reply }] });

        const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
        const cleanText = reply.replace(/```json[\s\S]*?```/, '').trim();
        if (cleanText) setMessages(prev => [...prev, { role: 'ai', text: cleanText }]);

        setIsLoading(false);
        isSendingRef.current = false;
        setTimeout(() => inputRef.current?.focus(), 0);

        if (jsonMatch) {
            try {
                const p = JSON.parse(jsonMatch[1]);
                setProposal(p);
                if (location && p.searchType) searchNearby(p.searchType);
            } catch { /* JSONパース失敗は無視 */ }
        }
    }

    // ── Places API 検索 ──
    async function searchNearby(searchType) {
        if (!location) return;
        setPlacesStatus('loading');
        try {
            const res = await fetch('/api/places', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ searchType, latitude: location.latitude, longitude: location.longitude }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Places API error');
            setPlaces(data.places ?? []);
            setPlacesStatus('done');
        } catch (e) {
            console.error('Places error:', e);
            setPlacesStatus('error');
        }
    }

    // ── リセット ──
    function resetAll() {
        historyRef.current   = [];
        turnRef.current      = 0;
        isSendingRef.current = false;
        setMessages([]);
        setInputText('');
        setProposal(null);
        setPlaces([]);
        setPlacesStatus('idle');
        setSelectedPlace(null);
        setTravelMode('transit');
        setRouteInfo(null);
        const greeting = location
            ? 'こんにちは！今日はどこへ行きたい気分？気軽に話しかけてみて😊'
            : 'こんにちは！気分から行き先を一緒に考えよう😊\n今日はどんな感じにしたい？';
        setTimeout(() => addAiMessage(greeting), 100);
    }

    // ══════════════════════════════════════════════
    //  レンダリング
    // ══════════════════════════════════════════════
    return (
        <>
        <style>{`
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; }
            .container { background:white; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.3); max-width:600px; width:100%; overflow:hidden; }
            .header { background:linear-gradient(135deg,#667eea,#764ba2); color:white; padding:24px 30px 20px; text-align:center; }
            .header h1 { font-size:2em; margin-bottom:4px; }
            .header p  { font-size:0.85em; opacity:0.85; }
            .btn-top { background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.4); padding:5px 14px; border-radius:20px; font-size:0.78em; cursor:pointer; margin-bottom:10px; transition:all 0.2s; }
            .btn-top:hover { background:rgba(255,255,255,0.35); }
            .status-bar { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:12px; font-size:0.8em; background:rgba(255,255,255,0.15); padding:6px 14px; border-radius:20px; }
            .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
            .dot-loading { background:#ffa500; animation:pulse 1.4s infinite; }
            .dot-ok      { background:#4CAF50; }
            .dot-err     { background:#f44336; }
            @keyframes pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
            .chat-area { height:420px; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:14px; background:#fafafa; }
            .chat-area::-webkit-scrollbar { width:5px; }
            .chat-area::-webkit-scrollbar-thumb { background:#ddd; border-radius:10px; }
            .bubble { max-width:80%; padding:12px 16px; border-radius:18px; font-size:0.92em; line-height:1.65; white-space:pre-wrap; word-break:break-word; animation:fadeUp 0.3s ease; }
            @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
            .bubble-ai   { background:white; color:#333; border-bottom-left-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.08); align-self:flex-start; }
            .bubble-user { background:linear-gradient(135deg,#667eea,#764ba2); color:white; border-bottom-right-radius:4px; align-self:flex-end; }
            .typing { display:flex; align-items:center; gap:5px; padding:14px 16px; background:white; border-radius:18px; border-bottom-left-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.08); align-self:flex-start; width:fit-content; }
            .typing span { width:7px; height:7px; background:#aaa; border-radius:50%; animation:typing 1.2s infinite; }
            .typing span:nth-child(2) { animation-delay:0.2s; }
            .typing span:nth-child(3) { animation-delay:0.4s; }
            @keyframes typing { 0%,60%,100%{transform:translateY(0);background:#aaa} 30%{transform:translateY(-6px);background:#667eea} }
            .input-area { display:flex; gap:10px; padding:16px 20px; background:white; border-top:1px solid #eee; }
            .input-area textarea { flex:1; padding:12px 16px; border:2px solid #e0e0e0; border-radius:24px; font-size:0.95em; outline:none; resize:none; max-height:100px; font-family:inherit; line-height:1.5; transition:border-color 0.2s; }
            .input-area textarea:focus    { border-color:#667eea; }
            .input-area textarea:disabled { background:#f5f5f5; color:#aaa; }
            .send-btn { background:linear-gradient(135deg,#667eea,#764ba2); color:white; border:none; border-radius:50%; width:46px; height:46px; font-size:1.2em; cursor:pointer; flex-shrink:0; transition:all 0.2s; display:flex; align-items:center; justify-content:center; }
            .send-btn:hover:not(:disabled) { transform:scale(1.1); box-shadow:0 4px 12px rgba(102,126,234,0.4); }
            .send-btn:disabled { background:#ccc; cursor:not-allowed; }
            .result-card { margin:0 20px 16px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; border-radius:16px; padding:20px; animation:fadeUp 0.4s ease; }
            .result-card-title  { font-size:0.75em; opacity:0.8; margin-bottom:6px; letter-spacing:0.05em; }
            .result-destination { font-size:1.6em; font-weight:bold; margin-bottom:8px; }
            .result-description { font-size:0.85em; opacity:0.9; margin-bottom:12px; line-height:1.6; }
            .result-meta        { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .result-meta-item   { background:rgba(255,255,255,0.15); padding:8px 10px; border-radius:8px; font-size:0.8em; }
            .result-meta-label  { opacity:0.8; font-size:0.85em; margin-bottom:2px; }
            .result-meta-value  { font-weight:bold; }
            .nearby-section { margin:0 20px 16px; animation:fadeUp 0.4s ease; }
            .nearby-title   { font-size:0.85em; font-weight:bold; color:#555; margin-bottom:8px; padding-left:4px; }
            .place-card { background:white; border:1px solid #eee; border-left:3px solid #667eea; border-radius:10px; padding:12px 14px; margin-bottom:8px; cursor:pointer; transition:all 0.2s; }
            .place-card:hover { background:#f5f7ff; transform:translateX(4px); box-shadow:0 2px 8px rgba(102,126,234,0.15); }
            .place-card:last-child { margin-bottom:0; }
            .place-card-name { font-weight:bold; color:#333; font-size:0.88em; }
            .place-card-sub  { color:#888; font-size:0.78em; margin-top:3px; }
            .place-card-hint { color:#667eea; font-size:0.75em; margin-top:5px; font-weight:600; }
            .loading-places { color:#667eea; font-size:0.85em; display:flex; align-items:center; gap:8px; padding:8px 4px; }
            .spinner { width:14px; height:14px; border:2px solid #e0e0e0; border-top-color:#667eea; border-radius:50%; animation:spin 0.7s linear infinite; }
            @keyframes spin { to{transform:rotate(360deg)} }
            .route-section    { margin:0 20px 16px; animation:fadeUp 0.4s ease; }
            .route-header     { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
            .btn-back-route   { background:#f0f0f0; color:#555; border:none; padding:7px 14px; border-radius:20px; font-size:0.82em; cursor:pointer; }
            .btn-back-route:hover { background:#e0e0e0; }
            .route-place-name { font-weight:bold; color:#333; font-size:0.95em; }
            .route-map-box    { background:#eee; border-radius:12px; overflow:hidden; margin-bottom:12px; }
            .travel-mode-row  { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin-bottom:12px; }
            .mode-btn { background:white; border:2px solid #ddd; border-radius:8px; padding:8px 4px; font-size:0.75em; font-weight:bold; cursor:pointer; text-align:center; line-height:1.6; transition:all 0.2s; }
            .mode-btn:hover   { border-color:#667eea; background:#f0f4ff; }
            .mode-btn-active  { background:#667eea; color:white; border-color:#667eea; }
            .route-info-row   { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
            .route-info-box   { background:#f5f5f5; border-radius:8px; padding:10px 12px; font-size:0.82em; }
            .route-info-label { color:#999; margin-bottom:3px; }
            .route-info-val   { font-weight:bold; color:#333; }
            .btn-gmaps { display:block; width:100%; background:#ea4335; color:white; border:none; border-radius:10px; padding:12px; font-size:0.92em; font-weight:bold; cursor:pointer; text-align:center; text-decoration:none; }
            .btn-gmaps:hover { background:#c5221f; }
            .footer-btns { display:flex; gap:10px; padding:0 20px 20px; }
            .btn-reset { flex:1; background:#f0f0f0; color:#555; border:none; border-radius:10px; padding:11px; font-size:0.88em; font-weight:bold; cursor:pointer; }
            .btn-reset:hover { background:#e0e0e0; }
        `}</style>

        <div className="container">
            {/* ヘッダー */}
            <div className="header">
                <button className="btn-top" onClick={() => router.push('/')}>← トップに戻る</button>
                <h1>🗺️ Dokoiku? AI</h1>
                <p>AIに話しかけるだけで、今日の行き先が決まる。</p>
                <div className="status-bar">
                    <span className={`dot ${locStatus === 'loading' ? 'dot-loading' : locStatus === 'ok' ? 'dot-ok' : 'dot-err'}`}></span>
                    <span>{locText}</span>
                </div>
            </div>

            {/* チャット */}
            <div className="chat-area" ref={chatAreaRef}>
                {messages.map((msg, i) => (
                    <div key={i} className={`bubble ${msg.role === 'ai' ? 'bubble-ai' : 'bubble-user'}`}>
                        {msg.text}
                    </div>
                ))}
                {isLoading && (
                    <div className="typing"><span></span><span></span><span></span></div>
                )}
            </div>

            {/* 結果カード */}
            {proposal && (
                <div className="result-card">
                    <div className="result-card-title">🎯 おすすめの行き先</div>
                    <div className="result-destination">{proposal.name}</div>
                    <div className="result-description">{proposal.description}</div>
                    <div className="result-meta">
                        <div className="result-meta-item"><div className="result-meta-label">⏱ 目安時間</div><div className="result-meta-value">{proposal.duration}</div></div>
                        <div className="result-meta-item"><div className="result-meta-label">💰 予算</div><div className="result-meta-value">{proposal.budget}</div></div>
                        <div className="result-meta-item"><div className="result-meta-label">👥 人数</div><div className="result-meta-value">{proposal.people}</div></div>
                        <div className="result-meta-item"><div className="result-meta-label">✨ 雰囲気</div><div className="result-meta-value">{proposal.vibe}</div></div>
                    </div>
                </div>
            )}

            {/* 近くの施設 */}
            {proposal && location && (
                <div className="nearby-section">
                    <div className="nearby-title">📌 近くで見つかった施設</div>
                    {placesStatus === 'loading' && <div className="loading-places"><div className="spinner"></div>近くの施設を検索中...</div>}
                    {placesStatus === 'error'   && <p style={{color:'#c62828',fontSize:'0.85em',padding:'8px 4px'}}>⚠️ 施設の検索に失敗しました</p>}
                    {placesStatus === 'done' && places.length === 0 && <p style={{color:'#999',fontSize:'0.85em',padding:'8px 4px'}}>近くの施設が見つかりませんでした</p>}
                    {placesStatus === 'done' && !selectedPlace && places.slice(0, 4).map((place, i) => {
                        const dist    = calcDist(location.latitude, location.longitude, place.location.latitude, place.location.longitude);
                        const distStr = dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`;
                        const rating  = place.rating ? `⭐ ${place.rating.toFixed(1)}（${place.userRatingCount}件）` : '評価なし';
                        return (
                            <div key={i} className="place-card" onClick={() => setSelectedPlace(place)}>
                                <div className="place-card-name">{place.displayName.text}</div>
                                <div className="place-card-sub">📍 {distStr}先　{rating}</div>
                                {place.formattedAddress && <div className="place-card-sub">{place.formattedAddress}</div>}
                                <div className="place-card-hint">👉 タップするとルートを表示</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ルート */}
            {selectedPlace && routeInfo && (
                <div className="route-section">
                    <div className="route-header">
                        <button className="btn-back-route" onClick={() => setSelectedPlace(null)}>← 戻る</button>
                        <div className="route-place-name">{selectedPlace.displayName.text}</div>
                    </div>
                    <div className="route-map-box">
                        <div ref={mapRef} style={{width:'100%',height:'220px'}}></div>
                    </div>
                    <div className="travel-mode-row">
                        {[['transit','🚆','電車'],['walking','🚶','徒歩'],['driving','🚗','車'],['bicycling','🚲','自転車']].map(([mode, emoji, label]) => (
                            <button key={mode} className={`mode-btn ${travelMode === mode ? 'mode-btn-active' : ''}`} onClick={() => setTravelMode(mode)}>{emoji}<br/>{label}</button>
                        ))}
                    </div>
                    <div className="route-info-row">
                        <div className="route-info-box"><div className="route-info-label">距離</div><div className="route-info-val">{routeInfo.distStr}</div></div>
                        <div className="route-info-box"><div className="route-info-label">所要時間（目安）</div><div className="route-info-val">約{routeInfo.minutes}分</div></div>
                    </div>
                    <a className="btn-gmaps" href={routeInfo.gmapsUrl} target="_blank" rel="noreferrer">🔴 Google マップで開く</a>
                </div>
            )}

            {/* フッター */}
            {proposal && (
                <div className="footer-btns">
                    <button className="btn-reset" onClick={resetAll}>🔄 最初からやり直す</button>
                </div>
            )}

            {/* 入力欄 */}
            <div className="input-area">
                <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={() => { isComposingRef.current = false; }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    onInput={e => {
                        e.target.style.height = '';
                        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                    }}
                    placeholder={proposal ? '提案が完了しました' : '今日の気分を話しかけてみて...'}
                    disabled={!!proposal || isLoading}
                    rows={1}
                    autoFocus
                />
                <button className="send-btn" onClick={handleSend} disabled={!!proposal || isLoading || !inputText.trim()}>➤</button>
            </div>
        </div>
        </>
    );
}