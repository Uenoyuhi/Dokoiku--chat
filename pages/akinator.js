import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function Akinator() {
  const router = useRouter();
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [phase, setPhase] = useState('question');
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('waiting');
  const [locationText, setLocationText] = useState('位置情報: 取得待機中...');
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [currentPlace, setCurrentPlace] = useState(null);
  const [travelMode, setTravelMode] = useState('transit');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const routeMapRef = useRef(null);

  const MAX_QUESTIONS = 4;
  const progress = Math.min((answers.length / MAX_QUESTIONS) * 100, 100);

  const fetchInitialQuestion = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/akinator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [], location: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError('AIの応答に失敗しました。もう一度試してください。');
      } else if (data.type === 'question') {
        setCurrentQuestion(data);
      }
    } catch {
      setAiError('AIの応答に失敗しました。もう一度試してください。');
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialQuestion();
  }, [fetchInitialQuestion]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationText('位置情報: 非対応');
      return;
    }
    setLocationStatus('loading');
    setLocationText('位置情報: 取得中...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setUserLocation(loc);
        setLocationStatus('success');
        setLocationText(`位置情報: 取得済み (精度: ±${Math.round(pos.coords.accuracy)}m)`);
        loadGoogleMaps();
      },
      (err) => {
        setLocationStatus('error');
        setLocationText(err.code === 1 ? '位置情報: 許可がありません' : err.code === 3 ? '位置情報: タイムアウト（続行します）' : '位置情報: 取得失敗');
        loadGoogleMaps();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  function loadGoogleMaps() {
    if (document.getElementById('gmaps-script')) return;
    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,marker&loading=async`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }

  useEffect(() => {
    if (!mapsLoaded || !currentPlace || !userLocation || !routeMapRef.current) return;
    const map = new window.google.maps.Map(routeMapRef.current, {
      zoom: 14,
      center: {
        lat: (userLocation.latitude + currentPlace.location.latitude) / 2,
        lng: (userLocation.longitude + currentPlace.location.longitude) / 2,
      },
      mapTypeControl: false, fullscreenControl: false, streetViewControl: false,
      mapId: 'dokoiku_map',
    });
    new window.google.maps.marker.AdvancedMarkerElement({
      position: { lat: userLocation.latitude, lng: userLocation.longitude },
      map, title: '現在地',
    });
    new window.google.maps.marker.AdvancedMarkerElement({
      position: { lat: currentPlace.location.latitude, lng: currentPlace.location.longitude },
      map, title: currentPlace.displayName.text,
    });
    new window.google.maps.Polyline({
      path: [
        { lat: userLocation.latitude, lng: userLocation.longitude },
        { lat: currentPlace.location.latitude, lng: currentPlace.location.longitude },
      ],
      geodesic: true, strokeColor: '#f5576c', strokeOpacity: 0.5, strokeWeight: 3, map,
    });
  }, [mapsLoaded, currentPlace, userLocation]);

  async function fetchNextStep(answersToSend) {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/akinator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersToSend, location: userLocation }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAiError('AIの応答に失敗しました。もう一度試してください。');
        return;
      }

      if (data.type === 'question') {
        setCurrentQuestion(data);
      } else if (data.type === 'destination') {
        setDestination(data.destination);
        setPhase('result');
        if (userLocation) searchNearbyPlaces(data.destination.searchType, userLocation);
      }
    } catch {
      setAiError('AIの応答に失敗しました。もう一度試してください。');
    } finally {
      setAiLoading(false);
    }
  }

  function handleOptionClick(selectedOption) {
    const newAnswers = [...answers, { question: currentQuestion.question, selectedOption }];
    setAnswers(newAnswers);
    fetchNextStep(newAnswers);
  }

  function handleRetry() {
    fetchNextStep(answers);
  }

  async function searchNearbyPlaces(searchType, loc) {
    if (!GOOGLE_MAPS_API_KEY) return;
    setPlacesLoading(true);
    setPlacesError('');
    setNearbyPlaces([]);
    const searchQueries = {
      cafe: 'cafe', park: 'park', spa: 'spa or hot spring', restaurant: 'restaurant',
      art_gallery: 'art gallery or museum', hiking: 'hiking trail or national park',
      karaoke: 'karaoke', bar: 'bar or pub', bowling_alley: 'bowling alley',
      gym: 'gym or fitness center', amusement_park: 'amusement park',
      art_studio: 'art studio or workshop', shopping_mall: 'shopping mall',
      temple: 'temple or shrine', beach: 'beach',
    };
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.formattedAddress,places.displayName,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
          textQuery: searchQueries[searchType] || searchType,
          locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 2000 } },
        }),
      });
      const data = await res.json();
      if (data.places && data.places.length > 0) {
        setNearbyPlaces(data.places.slice(0, 3));
      } else {
        setPlacesError('近くの施設が見つかりませんでした');
      }
    } catch {
      setPlacesError('施設の検索に失敗しました');
    } finally {
      setPlacesLoading(false);
    }
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000);
  }

  function getRouteDuration(distance, mode) {
    const speeds = { transit: 3, walking: 1.4, driving: 15, bicycling: 6 };
    return Math.ceil(distance / speeds[mode] / 60);
  }

  function getMapsLink(place, mode) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${place.location.latitude},${place.location.longitude}&travelmode=${mode}`;
  }

  function reset() {
    setAnswers([]);
    setCurrentQuestion(null);
    setPhase('question');
    setDestination(null);
    setNearbyPlaces([]);
    setPlacesError('');
    setCurrentPlace(null);
    setTravelMode('transit');
    setAiError('');
    fetchInitialQuestion();
  }

  const indicatorColor = { waiting: '#ccc', loading: '#ffa500', success: '#4CAF50', error: '#f44336' }[locationStatus];
  const accentColor = '#f5576c';

  return (
    <>
      <Head>
        <title>Dokoiku? - アキネーター形式</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
        @keyframes pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>

      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: 600, width: '100%', padding: 40, textAlign: 'center' }}>
        {/* ヘッダー */}
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: '0.85em', cursor: 'pointer', marginBottom: 10, display: 'block' }}>← トップに戻る</button>
        <h1 style={{ color: accentColor, marginBottom: 10, fontSize: '2.5em' }}>🔮 Dokoiku?</h1>
        <p style={{ color: '#999', marginBottom: 20, fontSize: '0.9em' }}>質問に答えるだけで行き先が決まる。</p>

        {/* 位置情報 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, fontSize: '0.85em', color: '#666', background: '#f5f5f5', padding: 10, borderRadius: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: indicatorColor, display: 'inline-block', animation: locationStatus === 'loading' ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />
          <span>{locationText}</span>
        </div>

        {/* プログレスバー */}
        <div style={{ width: '100%', height: 8, background: '#e0e0e0', borderRadius: 10, marginBottom: 30, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, #f093fb, #f5576c)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
        </div>

        {/* 質問フェーズ */}
        {phase === 'question' && (
          <>
            <div style={{ marginBottom: 30, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {aiLoading ? (
                <span style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid #e0e0e0', borderTop: `3px solid ${accentColor}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <div style={{ fontSize: '1.3em', color: '#333', fontWeight: 500, lineHeight: 1.6 }}>{currentQuestion?.question}</div>
              )}
            </div>

            {aiError ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: '#f44336', fontSize: '0.9em', marginBottom: 12 }}>{aiError}</div>
                <button onClick={handleRetry} disabled={aiLoading}
                  style={{ background: accentColor, color: 'white', padding: '12px 24px', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.95em' }}>
                  再試行
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {currentQuestion?.options.map((option, i) => (
                  <button key={i} onClick={() => handleOptionClick(option)} disabled={aiLoading}
                    style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)', color: 'white', padding: '18px 25px', border: 'none', borderRadius: 10, cursor: aiLoading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '1em', transition: 'all 0.3s ease', opacity: aiLoading ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!aiLoading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 20px rgba(245,87,108,0.3)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                    {option}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* 結果フェーズ */}
        {phase === 'result' && destination && (
          <div style={{ animation: 'slideIn 0.5s ease' }}>
            {userLocation && (
              <div style={{ background: '#e3f2fd', padding: 12, borderRadius: 8, fontSize: '0.85em', color: '#1976d2', marginBottom: 15, borderLeft: '4px solid #1976d2', textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 5 }}>📍 あなたの現在地</div>
                <div>ご利用地域で利用可能な施設を提案しています</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8em', marginTop: 5 }}>座標: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}</div>
              </div>
            )}
            <div style={{ fontSize: '4em', marginBottom: 20 }}>{destination.name.split(' ')[0]}</div>
            <div style={{ fontSize: '2em', color: accentColor, fontWeight: 'bold', marginBottom: 15 }}>{destination.name}</div>
            <div style={{ color: '#666', fontSize: '0.95em', lineHeight: 1.8, marginBottom: 20 }}>{destination.description}</div>
            <div style={{ background: '#f9f9f9', padding: 15, borderRadius: 10, textAlign: 'left', marginBottom: 20 }}>
              <div style={{ fontWeight: 'bold', color: '#333', marginBottom: 10, fontSize: '0.9em' }}>💡 このアクティビティについて:</div>
              {[['⏱️', destination.duration], ['💰', destination.budget], ['👥', destination.people], ['✨', destination.vibe]].map(([icon, val]) => (
                <div key={icon} style={{ color: '#666', fontSize: '0.85em', padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ minWidth: 20 }}>{icon}</span><span>{val}</span>
                </div>
              ))}
            </div>

            {/* 近くの施設 */}
            {userLocation && (
              <div style={{ background: '#fff0f3', padding: 15, borderRadius: 10, textAlign: 'left', marginBottom: 15, borderLeft: `4px solid ${accentColor}` }}>
                <div style={{ fontWeight: 'bold', color: '#333', marginBottom: 10, fontSize: '0.95em' }}>📌 近くの施設</div>
                {placesLoading && <div style={{ color: accentColor, fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #e0e0e0', borderTop: `2px solid ${accentColor}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />施設を検索中...</div>}
                {placesError && <div style={{ color: '#999', fontSize: '0.85em', padding: 10, background: '#fafafa', borderRadius: 8 }}>{placesError}</div>}
                {nearbyPlaces.map((place, i) => {
                  const dist = calculateDistance(userLocation.latitude, userLocation.longitude, place.location.latitude, place.location.longitude);
                  return (
                    <div key={i} onClick={() => { setCurrentPlace(place); setPhase('route'); }}
                      style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${accentColor}`, cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(5px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(245,87,108,0.2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                      <div style={{ fontWeight: 'bold', color: '#333', fontSize: '0.9em', marginBottom: 3 }}>{place.displayName.text}</div>
                      <div style={{ color: '#666', fontSize: '0.8em' }}>📍 {dist}m先</div>
                      {place.formattedAddress && <div style={{ color: '#999', fontSize: '0.75em', marginTop: 3 }}>{place.formattedAddress}</div>}
                      {place.rating && <div style={{ color: '#ffa500', fontSize: '0.8em', marginTop: 3 }}>⭐ {place.rating.toFixed(1)} ({place.userRatingCount}件)</div>}
                      <div style={{ color: accentColor, fontSize: '0.75em', marginTop: 5, fontWeight: 500 }}>👉 クリックするとルートが表示されます</div>
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={reset} style={{ background: accentColor, color: 'white', padding: '15px 25px', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '1em', width: '100%', marginTop: 10 }}>別の場所をさがす</button>
          </div>
        )}

        {/* ルートフェーズ */}
        {phase === 'route' && currentPlace && userLocation && (
          <div style={{ animation: 'slideIn 0.5s ease' }}>
            <button onClick={() => setPhase('result')} style={{ background: '#999', color: 'white', padding: '15px 25px', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '1em', width: '100%', marginBottom: 10 }}>← 戻る</button>
            <div style={{ background: `linear-gradient(135deg, #f093fb, #f5576c)`, color: 'white', padding: 15, borderRadius: 10, marginBottom: 15, textAlign: 'left' }}>
              <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: 10 }}>{currentPlace.displayName.text}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85em' }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 6 }}>
                  <div style={{ fontSize: '0.75em', opacity: 0.9, marginBottom: 3 }}>距離</div>
                  <div style={{ fontWeight: 'bold' }}>{(calculateDistance(userLocation.latitude, userLocation.longitude, currentPlace.location.latitude, currentPlace.location.longitude) / 1000).toFixed(2)}km</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 6 }}>
                  <div style={{ fontSize: '0.75em', opacity: 0.9, marginBottom: 3 }}>所要時間（目安）</div>
                  <div style={{ fontWeight: 'bold' }}>約{getRouteDuration(calculateDistance(userLocation.latitude, userLocation.longitude, currentPlace.location.latitude, currentPlace.location.longitude), travelMode)}分</div>
                </div>
              </div>
            </div>

            {/* 移動手段 */}
            <div style={{ background: '#f9f9f9', padding: 12, borderRadius: 10, marginBottom: 15, borderLeft: `4px solid ${accentColor}` }}>
              <div style={{ fontWeight: 'bold', color: '#333', marginBottom: 8, fontSize: '0.85em', textAlign: 'left' }}>🚆 移動手段を選択</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {[['transit', '🚆', '公共交通'], ['walking', '🚶', '徒歩'], ['driving', '🚗', '車'], ['bicycling', '🚲', '自転車']].map(([mode, icon, label]) => (
                  <button key={mode} onClick={() => setTravelMode(mode)}
                    style={{ background: travelMode === mode ? accentColor : 'white', color: travelMode === mode ? 'white' : '#333', padding: 10, border: `2px solid ${travelMode === mode ? accentColor : '#ddd'}`, borderRadius: 6, cursor: 'pointer', fontSize: '0.8em', fontWeight: 600 }}>
                    {icon}<br />{label}
                  </button>
                ))}
              </div>
            </div>

            {/* 地図 */}
            <div style={{ background: '#f5f5f5', borderRadius: 10, marginBottom: 15, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <div ref={routeMapRef} style={{ width: '100%', height: 250 }} />
            </div>

            <div style={{ background: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 15, borderLeft: `4px solid ${accentColor}`, textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold', color: '#333', marginBottom: 8, fontSize: '0.9em' }}>📍 施設情報</div>
              <div style={{ background: 'white', padding: 10, borderRadius: 6, fontSize: '0.85em', color: '#666', marginBottom: 10 }}>{currentPlace.formattedAddress || '住所情報なし'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85em' }}>
                <div style={{ background: 'white', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: '0.75em', color: '#999', marginBottom: 3 }}>評価</div>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{currentPlace.rating ? `⭐ ${currentPlace.rating.toFixed(1)} (${currentPlace.userRatingCount}件)` : '評価情報なし'}</div>
                </div>
                <div style={{ background: 'white', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: '0.75em', color: '#999', marginBottom: 3 }}>現在地から</div>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{calculateDistance(userLocation.latitude, userLocation.longitude, currentPlace.location.latitude, currentPlace.location.longitude)}m</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <a href={getMapsLink(currentPlace, travelMode)} target="_blank" rel="noreferrer"
                style={{ background: '#ea4335', color: 'white', padding: 12, borderRadius: 8, textDecoration: 'none', fontSize: '0.9em', display: 'inline-block', textAlign: 'center' }}>
                🔴 Googleマップで開く
              </a>
              <button onClick={reset} style={{ background: accentColor, color: 'white', padding: 12, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9em', fontWeight: 600 }}>別の場所をさがす</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
