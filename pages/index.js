import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [profileSet, setProfileSet] = useState(false);

  useEffect(() => {
    setProfileSet(!!localStorage.getItem('dokoiku_profile'));
  }, []);

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
          align-items: center;
          padding: 20px;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: 600, width: '100%', padding: 40, textAlign: 'center', animation: 'slideIn 0.5s ease' }}>
        <div style={{ fontSize: '3em', marginBottom: 10 }}>🗺️</div>
        <h1 style={{ color: '#667eea', marginBottom: 10, fontSize: '2.5em' }}>Dokoiku?</h1>
        <p style={{ color: '#999', marginBottom: 40, fontSize: '0.95em', lineHeight: 1.7 }}>
          やることがない。でも、どこかに行きたい。<br />そんなあなたへ。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            onClick={() => router.push('/chat')}
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', padding: '24px 25px', border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 600, fontSize: '1.1em', transition: 'all 0.3s ease', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 15px 30px rgba(102,126,234,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ fontSize: '1.8em', marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: '1.2em', marginBottom: 6 }}>AIチャット形式</div>
            <div style={{ fontSize: '0.8em', opacity: 0.85, fontWeight: 400, lineHeight: 1.5 }}>
              AIと会話しながら行き先を決める。<br />気分や状況を自由に話しかけてみよう。
            </div>
          </button>

          <button
            onClick={() => router.push('/akinator')}
            style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)', color: 'white', padding: '24px 25px', border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 600, fontSize: '1.1em', transition: 'all 0.3s ease', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 15px 30px rgba(245,87,108,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ fontSize: '1.8em', marginBottom: 8 }}>🔮</div>
            <div style={{ fontSize: '1.2em', marginBottom: 6 }}>アキネーター形式</div>
            <div style={{ fontSize: '0.8em', opacity: 0.85, fontWeight: 400, lineHeight: 1.5 }}>
              質問に答えるだけで行き先が決まる。<br />選択肢を選んでいくシンプルな診断。
            </div>
          </button>

          <button
            onClick={() => router.push('/profile')}
            style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)', color: 'white', padding: '24px 25px', border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 600, fontSize: '1.1em', transition: 'all 0.3s ease', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 15px 30px rgba(56,249,215,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ fontSize: '1.8em', marginBottom: 8 }}>🧑</div>
            <div style={{ fontSize: '1.2em', marginBottom: 6 }}>プロフィール設定</div>
            <div style={{ fontSize: '0.8em', opacity: 0.85, fontWeight: 400, lineHeight: 1.5 }}>
              あなたの情報を登録して、より的確な提案を受け取ろう。<br />
              {profileSet ? '✅ 設定済み' : '未設定'}
            </div>
          </button>
        </div>

        <p style={{ color: '#ccc', fontSize: '0.75em', marginTop: 30 }}>
          位置情報を使って近くの施設も提案します
        </p>
      </div>
    </>
  );
}