// Whisper 도메인 프롬프트 — 코드스위칭 견고성 회귀 테스트.
//
// 검증:
// 1) 각 지원 언어에 대해 브랜드 어휘가 포함됨 (코드스위칭의 핵심)
// 2) 언어 미지정 시 한국어 + 영어 통합 프롬프트
// 3) 알려지지 않은 언어 코드 fallback

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: { LOG_LEVEL: 'silent' },
}));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getDomainPrompt } from '../stt.service.js';

describe('Whisper 도메인 프롬프트', () => {
  it('한국어 — 브랜드 + 한국어 도메인 어휘 포함', () => {
    const p = getDomainPrompt('ko');
    expect(p).toContain('CowTalk');
    expect(p).toContain('smaXtec');
    expect(p).toContain('팅커벨');
    expect(p).toContain('한우');
    expect(p).toContain('해돋이목장');
  });

  it('영어 — 브랜드 + 영어 도메인 어휘 포함', () => {
    const p = getDomainPrompt('en');
    expect(p).toContain('CowTalk');
    expect(p).toContain('Tinkerbell');
    expect(p).toContain('Holstein');
    expect(p).toContain('mastitis');
  });

  it('우즈벡어 — 브랜드 + 우즈벡 어휘 포함', () => {
    const p = getDomainPrompt('uz');
    expect(p).toContain('CowTalk');
    expect(p).toContain("O'zbekiston");
    expect(p).toContain('qoramol');
  });

  it('러시아어 — 브랜드는 라틴 유지', () => {
    const p = getDomainPrompt('ru');
    expect(p).toContain('CowTalk');
    expect(p).toContain('smaXtec');
    expect(p).toContain('Узбекистан');
  });

  it('몽골어 — 브랜드는 라틴 유지', () => {
    const p = getDomainPrompt('mn');
    expect(p).toContain('CowTalk');
    expect(p).toContain('Тинкербелл');
  });

  it('미지원 언어 코드 → 한국어 + 영어 통합 fallback', () => {
    const p = getDomainPrompt('fr');
    expect(p).toContain('CowTalk');
    expect(p).toContain('팅커벨'); // 한국어 포함
    expect(p).toContain('Tinkerbell'); // 영어 포함
  });

  it('언어 미지정 → 한국어 프롬프트', () => {
    const p = getDomainPrompt();
    expect(p).toContain('팅커벨');
  });

  it('대소문자 무관 — KO / ko 동일', () => {
    expect(getDomainPrompt('KO')).toBe(getDomainPrompt('ko'));
  });

  it('약어(DIM/SCC/THI) 모든 언어에 포함 — 코드스위칭 핵심', () => {
    for (const lang of ['ko', 'en', 'uz', 'ru', 'mn']) {
      const p = getDomainPrompt(lang);
      expect(p, `lang=${lang}`).toContain('DIM');
      expect(p, `lang=${lang}`).toContain('SCC');
      expect(p, `lang=${lang}`).toContain('THI');
    }
  });
});
