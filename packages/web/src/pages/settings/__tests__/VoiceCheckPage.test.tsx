import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@web/api/client', () => ({
  apiGet: vi.fn(async () => ({
    ready: false,
    checkedAt: '2026-11-05T05:00:00.000Z',
    totalMs: 2100,
    checks: [
      { name: 'claude', label: '대화 모델 (팅커벨 답변)', status: 'ok', latencyMs: 900, detail: 'claude-x' },
      { name: 'tts', label: '음성 합성 (답변 읽어주기)', status: 'ok', latencyMs: 700, detail: '12KB audio/mpeg' },
      { name: 'stt', label: '음성 인식 (말로 질문하기 — 서버 인식)', status: 'fail', latencyMs: 500, detail: '실패: HTTP 429' },
    ],
  })),
  describeColdPathError: () => '오류',
}));
vi.mock('@web/api/audio.api', () => ({ speak: vi.fn() }));

import VoiceCheckPage from '../VoiceCheckPage';

describe('VoiceCheckPage', () => {
  it('서버 점검 결과·문제 표시·강연 모드 토글이 보인다', async () => {
    render(<VoiceCheckPage />);
    await waitFor(() => expect(screen.getByText('문제 있음')).toBeTruthy());
    expect(screen.getByText(/실패: HTTP 429/)).toBeTruthy();
    expect(screen.getByText('강연 모드 (스피커가 큰 곳)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '소리 시험' })).toBeTruthy();
  });
});
