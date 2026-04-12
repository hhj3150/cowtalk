// 에러 바운더리 — 렌더링 크래시 시 흰 화면 방지
// 사용자에게 친절한 에러 메시지 + 재시도 버튼 표시
// stale chunk 감지 시 1회 자동 리로드 (Netlify 재배포 후 캐시 불일치 대응)

import React from 'react';

interface Props {
  readonly children: React.ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

// dynamic import 실패 메시지 (브라우저/번들러별)
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk \d+ failed/i,
  /Importing a module script failed/i,
];

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name}: ${error.message}`;
  return CHUNK_ERROR_PATTERNS.some((p) => p.test(msg));
}

const RELOAD_FLAG = 'cowtalk_chunk_reload_once';

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    // stale chunk 에러면 1회 자동 하드 리로드 (세션당 1회 가드)
    if (isChunkLoadError(error)) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        // URL에 캐시버스터 추가해서 index.html 재요청 강제
        const url = new URL(window.location.href);
        url.searchParams.set('_cb', String(Date.now()));
        window.location.replace(url.toString());
      }
    }
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private readonly handleReload = (): void => {
    sessionStorage.removeItem(RELOAD_FLAG);
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#0f1419',
          color: '#e7e9ea',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #1D9E75, #22c55e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            marginBottom: 20,
          }}
        >
          🐄
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          일시적인 오류가 발생했습니다
        </h2>
        <p style={{ fontSize: 14, color: '#8b98a5', marginBottom: 24, maxWidth: 400 }}>
          CowTalk 시스템에 일시적인 문제가 발생했습니다. 아래 버튼으로 다시 시도해 주세요.
        </p>
        {this.state.error && (
          <p
            style={{
              fontSize: 11,
              color: '#6b7280',
              marginBottom: 20,
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              maxWidth: 500,
              wordBreak: 'break-all',
            }}
          >
            {this.state.error.message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#1D9E75',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #333',
              background: 'transparent',
              color: '#8b98a5',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            페이지 새로고침
          </button>
        </div>
      </div>
    );
  }
}
