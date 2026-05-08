// 첫 방문 시 한 번만 표시되는 팅커벨 음성 onboarding 카드
//
// 목적: "팅커벨"이라 부르면 응답하려면 마이크 권한이 필요함을 안내하고,
// 권한 prompt를 적절한 사용자 제스처(버튼 클릭) 직후에 트리거하여
// 브라우저 정책에 안전하게 동작하도록 함.
//
// localStorage 'cowtalk:tinkerbell:onboarded' 가 '1'이면 표시되지 않음.

import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'cowtalk:tinkerbell:onboarded';
const WAKE_KEY = 'cowtalk:tinkerbell:wake-enabled';

type PermState = 'unknown' | 'prompt' | 'granted' | 'denied';

export function TinkerbellOnboarding(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [permState, setPermState] = useState<PermState>('unknown');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      // 이전에 onboarding을 본 사용자는 다시 안 띄움
      let onboarded = false;
      try {
        onboarded = localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        // localStorage 비활성 환경 — onboarding 안 띄우는 게 안전
        onboarded = true;
      }
      if (onboarded) return;

      // 브라우저가 SpeechRecognition 미지원이면 onboarding 의미 없음
      const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!supported) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
        return;
      }

      // 마이크 권한 상태 확인
      let state: PermState = 'unknown';
      try {
        const permApi = (navigator as { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
        if (permApi?.query) {
          const status = await permApi.query({ name: 'microphone' as PermissionName });
          state = status.state as PermState;
        }
      } catch {
        // permissions API 미지원 → unknown
      }

      if (cancelled) return;

      // 이미 권한 있으면 onboarding 건너뜀 (조용히 활성화)
      if (state === 'granted') {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
        return;
      }

      setPermState(state);
      // 살짝 지연 후 띄움 — 페이지 로딩 직후 갑작스러운 모달 회피
      setTimeout(() => { if (!cancelled) setVisible(true); }, 800);
    };
    void decide();
    return () => { cancelled = true; };
  }, []);

  const handleAllow = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      // 사용자 제스처(버튼 클릭) 직후이므로 권한 요청이 안전하게 발생
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한만 받고 즉시 정지 (실제 사용은 useWakeWord/마이크 버튼이 함)
      for (const track of stream.getTracks()) track.stop();

      // wake word 기본 ON 보장
      try { localStorage.setItem(WAKE_KEY, '1'); } catch { /* noop */ }
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
      setVisible(false);
      // wake recognition은 useWakeWord 훅이 enabled prop 변경 때 시작.
      // 여기서는 권한만 확보. 페이지 새로고침 없이도 다음 enable 사이클부터 작동.
      window.dispatchEvent(new CustomEvent('tinkerbell:onboarded'));
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg('마이크 권한이 거부되었어요. 브라우저 주소창의 자물쇠 아이콘에서 다시 허용해 주세요.');
        setPermState('denied');
      } else {
        setErrorMsg('마이크 접근 중 오류가 발생했습니다. 마이크 장치를 확인해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    // 호출 기능을 끄고 마이크 버튼만 사용
    try { localStorage.setItem(WAKE_KEY, '0'); } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="팅커벨 음성 권한 안내"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--ct-card, #1e293b)',
          color: 'var(--ct-text, #f1f5f9)',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(167,139,250,0.3)',
        }}
      >
        {/* 별 아이콘 + 제목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(167,139,250,0.4)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>팅커벨이 곁에서 들어줄까요?</div>
            <div style={{ fontSize: 12, color: 'var(--ct-text-muted, #94a3b8)', marginTop: 2 }}>
              피터팬의 팅커벨처럼 — 부르면 바로 응답해요
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 16 }}>
          <strong>"팅커벨"</strong>이라고 부르면 음성 마이크가 자동으로 켜져 질문을 받아요.
          외양간에서, 운전 중에, 손이 자유롭지 않을 때 편하게 쓸 수 있어요.
        </div>

        <div style={{
          fontSize: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.2)',
          color: 'var(--ct-text-secondary, #cbd5e1)',
          marginBottom: 16,
        }}>
          마이크 권한이 필요해요. 브라우저가 묻는 창이 뜨면 <strong>"허용"</strong>을 눌러 주세요.
          음성 데이터는 답변에만 사용되고 저장되지 않아요.
        </div>

        {errorMsg && (
          <div style={{
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
            marginBottom: 12,
          }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy}
            style={{
              flex: '0 0 auto',
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--ct-border, #334155)',
              background: 'transparent',
              color: 'var(--ct-text-muted, #94a3b8)',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => { void handleAllow(); }}
            disabled={busy || permState === 'denied'}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: permState === 'denied'
                ? 'rgba(100,116,139,0.4)'
                : 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              color: 'white',
              cursor: busy || permState === 'denied' ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: permState === 'denied' ? 'none' : '0 4px 14px rgba(167,139,250,0.35)',
            }}
          >
            {busy ? '권한 요청 중...' : permState === 'denied' ? '브라우저 설정에서 허용' : '마이크 허용하고 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}
