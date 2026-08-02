// 음성 강화 회귀 방지 스모크 — "화면이 아예 안 뜬다"를 코드로 잡는다.
//
// 배경: 팅커벨 음성 개편(#145/#146) 이후 "카우톡에 들어가지지 않는다"는 신고가 있었다.
// TinkerbellAssistant는 대시보드에 상시 마운트되므로, 이 컴포넌트가 렌더 중 throw하면
// 그 위의 페이지 전체가 하얗게 죽는다. 그 경로를 테스트로 고정한다.
//
// 브라우저 API(SpeechRecognition·MediaRecorder·AudioContext)가 없는 환경에서도
// 반드시 살아남아야 한다 — jsdom이 곧 "지원 안 하는 브라우저"의 대역이다.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@web/hooks/useUnifiedDashboard', () => ({
  useDashboardFarms: () => ({ data: { farms: [] }, isLoading: false, error: null }),
}));

vi.mock('@web/api/label-chat.api', () => ({
  getSovereignStats: () => Promise.resolve(null),
}));

describe('음성 모듈 로드', () => {
  it('stt-correction — 개체번호·전문어 보정이 동작한다', async () => {
    const m = await import('@web/lib/voice/stt-correction');
    expect(m.correctSttTranscript('사백이십삼번 소 발전 왔어').text).toBe('423번 소 발정 왔어');
  });

  it('sentence-chunker 로드', async () => {
    const m = await import('@web/lib/voice/sentence-chunker');
    expect(new m.ChunkAccumulator()).toBeTruthy();
  });

  it('vad 로드', async () => {
    const m = await import('@web/lib/voice/vad');
    expect(typeof m.createVad).toBe('function');
  });
});

describe('TinkerbellAssistant — 브라우저 API가 없어도 렌더된다', () => {
  beforeEach(() => {
    // jsdom에는 matchMedia가 없다 (실제 브라우저엔 있음) — useIsMobile이 쓰므로 최소 폴리필
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => { /* noop */ },
          removeEventListener: () => { /* noop */ },
          addListener: () => { /* noop */ },
          removeListener: () => { /* noop */ },
          dispatchEvent: () => false,
        }),
      });
    }
    // SpeechRecognition·MediaRecorder·AudioContext 모두 없는 환경 (구형 브라우저 대역)
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    delete (window as unknown as Record<string, unknown>).MediaRecorder;
    delete (window as unknown as Record<string, unknown>).AudioContext;
    delete (window as unknown as Record<string, unknown>).webkitAudioContext;
  });

  it('alwaysOpen 사이드바 모드가 throw 없이 마운트된다', async () => {
    const { TinkerbellAssistant } = await import('@web/components/unified-dashboard/TinkerbellAssistant');
    const { MemoryRouter } = await import('react-router-dom');

    expect(() =>
      render(
        <MemoryRouter>
          <TinkerbellAssistant alwaysOpen />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('플로팅 모드도 throw 없이 마운트된다', async () => {
    const { TinkerbellAssistant } = await import('@web/components/unified-dashboard/TinkerbellAssistant');
    const { MemoryRouter } = await import('react-router-dom');

    expect(() =>
      render(
        <MemoryRouter>
          <TinkerbellAssistant />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('음성 진입점(버튼)이 사라지지 않았다', async () => {
    const { TinkerbellAssistant } = await import('@web/components/unified-dashboard/TinkerbellAssistant');
    const { MemoryRouter } = await import('react-router-dom');

    render(
      <MemoryRouter>
        <TinkerbellAssistant alwaysOpen />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
