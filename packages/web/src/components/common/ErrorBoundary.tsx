// 에러 바운더리 — 렌더링 크래시 시 흰 화면 방지
// 사용자에게 친절한 에러 메시지 + 재시도 버튼 표시

import React from 'react';

interface Props {
  readonly children: React.ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private readonly handleReload = (): void => {
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
