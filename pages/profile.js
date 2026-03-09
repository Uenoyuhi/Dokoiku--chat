import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const PROFILE_PROMPT = `私のことを、以下のフォーマットに従ってまとめてください。
今までの会話から読み取れる情報を使い、わからない項目は「不明」としてください。
推測できる場合は「〜と思われる」と書いてください。

---

## 【Dokoiku? パーソナルプロフィール】

### 基本情報
- 年齢層: 
- よく一緒に行く人: 
- 移動手段: 
- 予算感: 
- 使える時間: 

### 思考・性格
- 一言で: 
- 行動スタイル: 
- 感性の傾向: 

### 好き・得意
- 好きなジャンル: 
- 好きな雰囲気: 
- 印象に残った体験: 

### 苦手・避けたいこと
- 苦手なもの: 
- 避けたい状況: 

### 価値観・志向
- お出かけに何を求めるか: 
- 理想の過ごし方: `;

export default function ProfilePage() {
  const router = useRouter();
  const [profileText, setProfileText] = useState('');
  const [savedProfile, setSavedProfile] = useState('');
  const [copyLabel, setCopyLabel] = useState('📋 プロンプトをコピー');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('dokoiku_profile');
    if (saved) setSavedProfile(saved);
  }, []);

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(PROFILE_PROMPT).then(() => {
        setCopyLabel('コピーしました！');
        setTimeout(() => setCopyLabel('📋 プロンプトをコピー'), 2000);
      }).catch(() => {
        fallbackCopy();
      });
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    const el = document.createElement('textarea');
    el.value = PROFILE_PROMPT;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      document.execCommand('copy');
      setCopyLabel('コピーしました！');
      setTimeout(() => setCopyLabel('📋 プロンプトをコピー'), 2000);
    } catch {
      setCopyLabel('コピーに失敗しました');
      setTimeout(() => setCopyLabel('📋 プロンプトをコピー'), 2000);
    }
    document.body.removeChild(el);
  }

  function handleSave() {
    const text = profileText.trim();
    if (!text) return;
    localStorage.setItem('dokoiku_profile', text);
    setSavedProfile(text);
    setSaveMessage('✅ 保存しました！');
    setTimeout(() => setSaveMessage(''), 2500);
  }

  function handleDelete() {
    localStorage.removeItem('dokoiku_profile');
    setSavedProfile('');
    setProfileText('');
    setSaveMessage('🗑️ プロフィールを削除しました');
    setTimeout(() => setSaveMessage(''), 2500);
  }

  return (
    <>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 30px 20px;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: 640, width: '100%', padding: 36, animation: 'slideIn 0.5s ease' }}>

        {/* ナビゲーション */}
        <button
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '0.95em', fontWeight: 600, marginBottom: 20, padding: 0 }}
        >
          ← トップに戻る
        </button>

        {/* タイトル */}
        <h1 style={{ color: '#667eea', fontSize: '1.8em', marginBottom: 6 }}>🧑 プロフィール設定</h1>
        <p style={{ color: '#999', fontSize: '0.9em', lineHeight: 1.6, marginBottom: 32 }}>
          あなたの情報を登録して、AIにより的確な提案をしてもらおう。
        </p>

        {/* セクション① AIプロンプトのコピーUI */}
        <div style={{ background: '#f8f8ff', borderRadius: 14, padding: 24, marginBottom: 28, border: '1px solid #e8e8f0' }}>
          <p style={{ color: '#555', fontSize: '0.9em', lineHeight: 1.7, marginBottom: 14 }}>
            まず、使っている生成AI（ChatGPT・Geminiなど）に以下のプロンプトを送ってください。
          </p>
          <pre style={{ background: '#1e1e2e', color: '#cdd6f4', borderRadius: 10, padding: 16, fontSize: '0.78em', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 14 }}>
            {PROFILE_PROMPT}
          </pre>
          <button
            onClick={handleCopy}
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {copyLabel}
          </button>
        </div>

        {/* セクション② プロフィール貼り付けUI */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', color: '#444', fontWeight: 600, fontSize: '0.95em', marginBottom: 10 }}>
            生成AIが出力したプロフィール文をここに貼り付けてください
          </label>
          <textarea
            value={profileText}
            onChange={e => setProfileText(e.target.value)}
            placeholder="AIが生成したプロフィールをここに貼り付けてください..."
            style={{ width: '100%', minHeight: 200, borderRadius: 12, border: '1.5px solid #ddd', padding: 14, fontSize: '0.88em', lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: '#333' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#667eea'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#ddd'; }}
          />
          <button
            onClick={handleSave}
            style={{ marginTop: 12, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 28px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95em', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            💾 保存する
          </button>
          {saveMessage && (
            <p style={{ color: '#667eea', fontWeight: 600, marginTop: 10, fontSize: '0.9em' }}>{saveMessage}</p>
          )}
        </div>

        {/* セクション③ 現在の設定確認 */}
        {savedProfile && (
          <div style={{ background: '#f0fff4', borderRadius: 14, padding: 20, border: '1px solid #b2f5c8' }}>
            <p style={{ color: '#2d8a4e', fontWeight: 600, fontSize: '0.95em', marginBottom: 12 }}>✅ プロフィール設定済み</p>
            <button
              onClick={handleDelete}
              style={{ background: 'none', border: '1.5px solid #e05a5a', color: '#e05a5a', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88em', transition: 'all 0.2s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e05a5a'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#e05a5a'; }}
            >
              🗑️ プロフィールを削除
            </button>
          </div>
        )}
      </div>
    </>
  );
}
