// 역할별 질문 예시

import React from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import type { Role } from '@cowtalk/shared';

interface Props {
  readonly onSelect: (question: string) => void;
}

const SUGGESTIONS: Record<Role, readonly string[]> = {
  farmer: [
    '오늘 할 일 요약해 줘',
    '건강이상 소 있어?',
    '발정 후보 알려줘',
    '117번 소 상태 어때?',
  ],
  veterinarian: [
    '오늘 긴급 진료 대상은?',
    '이번 주 주의 농장 알려줘',
    '312번 체온 추이 분석해 줘',
    '유방염 의심 케이스 있어?',
  ],
  inseminator: [
    '오늘 수정할 소 목록',
    '발정적기 소 있어?',
    '임신 재검 대상 알려줘',
    '117번 정액 추천해 줘',
  ],
  government_admin: [
    '관할 지역 현황 요약',
    '주의 농장 순위 보여줘',
    '국가 지표 비교 분석',
    '이번 달 보고서 요약',
  ],
  quarantine_officer: [
    '체온이상 농장 현황',
    '집단감염 의심 신호 있어?',
    '질병 클러스터 분석',
    '방역 조치 우선순위',
  ],
  feed_company: [
    '반추이상 동물 현황',
    '사료 효율 분석',
    '농장별 사양 리스크',
    'pH 이상 동물 확인',
  ],
};

export function SuggestedQuestions({ onSelect }: Props): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role) ?? 'farmer';
  const questions = SUGGESTIONS[role];

  return (
    <div className="space-y-4">
      {/* 환영 메시지 */}
      <div className="text-center">
        <div
          className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: 'var(--ct-ai-bg)' }}
        >
          <svg className="h-5 w-5" style={{ color: 'var(--ct-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>
          CowTalk AI에게 질문하세요
        </p>
        <p className="mt-0.5 text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
          대시보드 데이터 기반으로 답변합니다
        </p>
      </div>

      {/* 추천 질문 */}
      <div className="grid gap-2">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="rounded-lg px-3 py-2.5 text-left text-sm transition-all"
            style={{
              background: 'var(--ct-card)',
              color: 'var(--ct-text)',
              border: '1px solid var(--ct-border)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)';
              (e.currentTarget as HTMLElement).style.background = 'var(--ct-ai-bg)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)';
              (e.currentTarget as HTMLElement).style.background = 'var(--ct-card)';
            }}
          >
            <span className="mr-1.5" style={{ color: 'var(--ct-primary)' }}>→</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
