// Railway cold start 로딩 화면 — 서버가 깨어날 때까지 앱 로드를 차단

import React from 'react';
import { useServerWarmup } from '@web/hooks/useServerWarmup';

interface Props {
  readonly children: React.ReactNode;
}

export function ServerWarmupGate({ children }: Props): React.JSX.Element {
  const { status, elapsed } = useServerWarmup();

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'failed') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <span style={{ fontSize: 48 }}>&#x26A0;&#xFE0F;</span>
          <h2 style={{ margin: '12px 0 8px', fontSize: 18, color: '#1a1a1a' }}>
            서버 연결 실패
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#666', lineHeight: 1.5 }}>
            서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={buttonStyle}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // checking
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={spinnerStyle} />
        <h2 style={{ margin: '16px 0 8px', fontSize: 18, color: '#1a1a1a' }}>
          CowTalk 서버 연결 중
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: '#666', lineHeight: 1.5 }}>
          {seconds < 3
            ? '서버에 연결하고 있습니다...'
            : `서버가 시작되고 있습니다... (${seconds}초)`}
        </p>
        {seconds >= 5 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#999' }}>
            첫 접속 시 최대 20초 소요될 수 있습니다
          </p>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#f5f5f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '40px 32px',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  maxWidth: 360,
  textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '8px 24px',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: '#2563eb',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const spinnerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  border: '3px solid #e5e7eb',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

// CSS @keyframes를 인라인으로 주입
if (typeof document !== 'undefined' && !document.getElementById('warmup-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'warmup-spinner-style';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }';
  document.head.appendChild(style);
}
