// D5 UI 렌더링 통일 컴포넌트 (BUG-006).
// metrics-contract.md §15 / Decision D5·D13.
//
// 사용 규칙:
// 1. server result가 D5 패턴 (`{ displayValue, status }`)을 가진 경우 이 컴포넌트로 렌더.
// 2. status='ok' → displayValue + unit 표시.
// 3. status='data_insufficient' → "—" (em dash) + unit 숨김 + neutral 색.
// 4. **"정상 운영" / "이상 없음" / "양호" 같은 긍정 라벨을 status='ok'에 부활시키지 말 것.**
// 5. 0두 농장 (D13 실측 0) ≠ data_insufficient. status='ok' + displayValue='0'으로 표시됨.

import React from 'react';

/** server-side result 표준 (fertility-service / herd-service / alert-aggregator 등 공통). */
export interface MetricResult {
  /** UI 직접 표시 문자열. status='ok' → "0", "10,666", "83.0%" 등. status='data_insufficient' → "—". */
  readonly displayValue: string;
  /** D5/D13 상태. 0건도 'ok'. NaN/측정 불가만 'data_insufficient'. */
  readonly status: 'ok' | 'data_insufficient';
}

interface Props {
  /** Server에서 받은 D5 표준 result. */
  readonly result: MetricResult;
  /** 단위 (예: '두', '%', '건'). status='data_insufficient' 시 숨김. */
  readonly unit?: string;
  /** 외부 className (Tailwind 등). */
  readonly className?: string;
  /** 인라인 style (값 자체에 적용). */
  readonly style?: React.CSSProperties;
}

/**
 * D5 일관성 강제 컴포넌트.
 * - 'ok': displayValue + unit (caller가 색·크기·폰트 결정).
 * - 'data_insufficient': "—" + neutral 색 + tooltip "데이터 부족" + unit 미표시.
 * caller는 절대 "정상 운영"/"안전"/"양호" 등 긍정 라벨로 status='ok' 자리를 덮어쓰지 말 것.
 */
export function MetricValue({ result, unit, className, style }: Props): React.JSX.Element {
  const isInsufficient = result.status === 'data_insufficient';

  if (isInsufficient) {
    return (
      <span
        role="status"
        aria-label="데이터 부족"
        title="충분한 데이터가 없습니다"
        className={className}
        style={{
          color: 'var(--ct-text-secondary)',
          ...style,
        }}
      >
        —
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={`${result.displayValue}${unit ?? ''}`}
      className={className}
      style={style}
    >
      {result.displayValue}
      {unit && (
        <span style={{ marginLeft: 2, fontSize: '0.85em', color: 'var(--ct-text-secondary)' }}>
          {unit}
        </span>
      )}
    </span>
  );
}
