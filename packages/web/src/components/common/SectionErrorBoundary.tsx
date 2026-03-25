// 섹션 레벨 에러 바운더리 — 개별 컴포넌트 크래시가 전체 페이지를 깨뜨리지 않도록 격리

import React from 'react';

interface Props {
  readonly children: React.ReactNode;
  readonly label?: string;
}

interface State {
  readonly hasError: boolean;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
        <div style={{ marginBottom: 6 }}>⚠️ {this.props.label ?? '섹션'} 로딩 실패</div>
        <button
          type="button"
          onClick={this.handleRetry}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--ct-border)',
            background: 'var(--ct-card)',
            color: 'var(--ct-text)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }
}
