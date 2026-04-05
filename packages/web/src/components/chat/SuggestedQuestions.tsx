// 역할별 인사 + 추천 질문
// 시연용: 역할에 맞는 첫 인사와 핵심 질문으로 AI 역량 시연

import React from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import type { Role } from '@cowtalk/shared';

interface Props {
  readonly onSelect: (question: string) => void;
}

interface RoleConfig {
  readonly greeting: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly questions: readonly string[];
}

const ROLE_CONFIGS: Record<Role, RoleConfig> = {
  farmer: {
    greeting: '안녕하세요, 목장주님! 🐄',
    subtitle: '오늘 목장 현황을 요약해 드릴게요',
    icon: '🏡',
    questions: [
      '오늘 급한 거 뭐 있어?',
      '발정 감지된 소 알려줘',
      '아픈 소 있어?',
      '번식 성적 어때?',
    ],
  },
  veterinarian: {
    greeting: '선생님, 진료 브리핑 드릴게요 🩺',
    subtitle: '담당 농장 건강 현황과 긴급 케이스입니다',
    icon: '🩺',
    questions: [
      '오늘 긴급 진료 대상은?',
      '이번 주 주의 농장 알려줘',
      '유방염 의심 케이스 있어?',
      '체온이상 소 추이 분석해 줘',
    ],
  },
  government_admin: {
    greeting: '행정관님, 축산 현황 보고입니다 📊',
    subtitle: '관할 지역 핵심 지표와 현황을 안내합니다',
    icon: '📊',
    questions: [
      '관할 지역 현황 요약',
      '주의 농장 순위 보여줘',
      '국가 축산 지표 분석',
      '이번 달 보고서 요약',
    ],
  },
  quarantine_officer: {
    greeting: '방역관님, 역학 상황 브리핑입니다 🛡️',
    subtitle: '전국 발열 현황과 위험 농장을 실시간 모니터링 중입니다',
    icon: '🛡️',
    questions: [
      '전국 발열 현황 보고',
      '집단감염 의심 농장 있어?',
      '시도별 위험도 분석',
      '긴급 방역 조치 우선순위',
    ],
  },
};

export function SuggestedQuestions({ onSelect }: Props): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role) ?? 'farmer';
  const config = ROLE_CONFIGS[role];

  return (
    <div className="space-y-4">
      {/* 역할별 인사 */}
      <div className="text-center">
        <div
          className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full text-xl"
          style={{ background: 'var(--ct-ai-bg)' }}
        >
          {config.icon}
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
          {config.greeting}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {config.subtitle}
        </p>
      </div>

      {/* 자동 브리핑 버튼 */}
      <button
        type="button"
        onClick={() => onSelect('오늘 전체 브리핑 해줘')}
        className="w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-all"
        style={{
          background: 'rgba(59,130,246,0.08)',
          color: 'var(--ct-primary)',
          border: '1px solid rgba(59,130,246,0.2)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.15)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.08)';
        }}
      >
        <span className="mr-2">✨</span>
        오늘 전체 브리핑 받기
        <span className="ml-1 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          — 긴급 현황 + 할 일 요약
        </span>
      </button>

      {/* 추천 질문 */}
      <div className="grid gap-2">
        {config.questions.map((q) => (
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
