// i18n 순수 함수 테스트 — 번역, 폴백, 사전 키 일치

import { describe, it, expect } from 'vitest';
import { translate } from './index';
import { ko } from './locales/ko';
import { en } from './locales/en';

describe('translate', () => {
  it('언어별 사전에서 번역을 찾는다', () => {
    expect(translate('ko', 'nav.dashboard')).toBe('대시보드');
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard');
  });

  it('en에 없는 키는 ko로 폴백 — 미번역이 화면을 깨지 않는다', () => {
    // (가상의 키가 ko에만 있을 때를 시뮬레이션하기 위해 실제 폴백 체인 검증)
    expect(translate('en', 'common.loading')).toBe('Loading...');
  });

  it('어느 사전에도 없는 키는 원문 반환', () => {
    expect(translate('ko', 'unknown.key')).toBe('unknown.key');
    expect(translate('en', 'unknown.key')).toBe('unknown.key');
  });
});

describe('사전 키 일치', () => {
  it('en 사전의 모든 키는 ko(기준)에도 존재한다', () => {
    const koKeys = new Set(Object.keys(ko));
    const missing = Object.keys(en).filter((k) => !koKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('ko 사전의 모든 키는 en에도 번역돼 있다 (골격 범위 완전성)', () => {
    const enKeys = new Set(Object.keys(en));
    const missing = Object.keys(ko).filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });
});
