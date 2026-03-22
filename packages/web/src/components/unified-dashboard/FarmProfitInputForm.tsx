// 농장 수익성 데이터 입력 모달
// 개별 농장의 실제 수입/지출 데이터를 입력하는 폼

import React, { useState, useEffect, useCallback } from 'react';
import type { FarmProfitEntryInput, FarmProfitEntry } from '@cowtalk/shared';

// ── 수입 항목 정의 ──

// 숫자 필드만 (farmId, period 제외)
type NumericFieldKey = Exclude<keyof FarmProfitEntryInput, 'farmId' | 'period'>;

interface FieldDef {
  readonly key: NumericFieldKey;
  readonly label: string;
  readonly placeholder: string;
  readonly color: string;
}

const REVENUE_FIELDS: readonly FieldDef[] = [
  { key: 'revenueMilk', label: '원유 판매', placeholder: '예: 15000000', color: '#22c55e' },
  { key: 'revenueCalves', label: '송아지 판매', placeholder: '예: 2000000', color: '#3b82f6' },
  { key: 'revenueSubsidies', label: '정부 보조금', placeholder: '예: 500000', color: '#8b5cf6' },
  { key: 'revenueCullSales', label: '도태우 판매', placeholder: '예: 3000000', color: '#f97316' },
  { key: 'revenueOther', label: '기타 수입', placeholder: '예: 100000', color: '#94a3b8' },
];

const COST_FIELDS: readonly FieldDef[] = [
  { key: 'costFeed', label: '사료비', placeholder: '예: 8000000', color: '#ef4444' },
  { key: 'costVet', label: '수의료비', placeholder: '예: 500000', color: '#f97316' },
  { key: 'costBreeding', label: '번식비', placeholder: '예: 300000', color: '#eab308' },
  { key: 'costLabor', label: '인건비', placeholder: '예: 3000000', color: '#3b82f6' },
  { key: 'costFacility', label: '시설비', placeholder: '예: 500000', color: '#8b5cf6' },
  { key: 'costOther', label: '기타 지출', placeholder: '예: 200000', color: '#94a3b8' },
];

// ── 유틸리티 ──

function formatKrwInput(value: number): string {
  if (value === 0) return '';
  return value.toLocaleString('ko-KR');
}

function parseKrwInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9]/g, '');
  return cleaned === '' ? 0 : parseInt(cleaned, 10);
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(period: string): string {
  const parts = period.split('-');
  const year = parts[0] ?? '';
  const month = parts[1] ?? '1';
  return `${year}년 ${parseInt(month, 10)}월`;
}

// ── Props ──

interface Props {
  readonly farmId: string;
  readonly farmName: string;
  readonly existingEntry: FarmProfitEntry | null | undefined;
  readonly onSave: (input: FarmProfitEntryInput) => void;
  readonly onClose: () => void;
  readonly isSaving: boolean;
}

// ── 금액 입력 필드 ──

function AmountField({ field, value, onChange }: {
  readonly field: FieldDef;
  readonly value: number;
  readonly onChange: (key: NumericFieldKey, value: number) => void;
}): React.JSX.Element {
  const [displayValue, setDisplayValue] = useState(formatKrwInput(value));

  useEffect(() => {
    setDisplayValue(formatKrwInput(value));
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseKrwInput(raw);
    setDisplayValue(raw === '' ? '' : parsed.toLocaleString('ko-KR'));
    onChange(field.key, parsed);
  }, [field.key, onChange]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (value === 0) {
      setDisplayValue('');
    }
    e.target.select();
  }, [value]);

  const handleBlur = useCallback(() => {
    setDisplayValue(formatKrwInput(value));
  }, [value]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{
        width: 4,
        height: 32,
        borderRadius: 2,
        background: field.color,
        flexShrink: 0,
      }} />
      <label style={{
        width: 90,
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ct-text)',
        flexShrink: 0,
      }}>
        {field.label}
      </label>
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={field.placeholder}
          style={{
            width: '100%',
            padding: '8px 36px 8px 12px',
            borderRadius: 8,
            border: '1px solid var(--ct-border)',
            background: 'rgba(0,0,0,0.15)',
            color: 'var(--ct-text)',
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
            textAlign: 'right',
          }}
        />
        <span style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 11,
          color: 'var(--ct-text-muted)',
          pointerEvents: 'none',
        }}>
          원
        </span>
      </div>
    </div>
  );
}

// ── 메인 폼 컴포넌트 ──

export function FarmProfitInputForm({ farmId, farmName, existingEntry, onSave, onClose, isSaving }: Props): React.JSX.Element {
  const [period] = useState(existingEntry?.period ?? getCurrentPeriod());

  // 초기값: 기존 데이터가 있으면 채움, 없으면 0
  const [values, setValues] = useState<Record<string, number>>(() => {
    if (existingEntry) {
      return {
        revenueMilk: existingEntry.revenueMilk,
        revenueCalves: existingEntry.revenueCalves,
        revenueSubsidies: existingEntry.revenueSubsidies,
        revenueCullSales: existingEntry.revenueCullSales,
        revenueOther: existingEntry.revenueOther,
        costFeed: existingEntry.costFeed,
        costVet: existingEntry.costVet,
        costBreeding: existingEntry.costBreeding,
        costLabor: existingEntry.costLabor,
        costFacility: existingEntry.costFacility,
        costOther: existingEntry.costOther,
      };
    }
    return {
      revenueMilk: 0, revenueCalves: 0, revenueSubsidies: 0,
      revenueCullSales: 0, revenueOther: 0,
      costFeed: 0, costVet: 0, costBreeding: 0,
      costLabor: 0, costFacility: 0, costOther: 0,
    };
  });

  const handleFieldChange = useCallback((key: NumericFieldKey, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const totalRevenue = (values.revenueMilk ?? 0) + (values.revenueCalves ?? 0)
    + (values.revenueSubsidies ?? 0) + (values.revenueCullSales ?? 0)
    + (values.revenueOther ?? 0);
  const totalCost = (values.costFeed ?? 0) + (values.costVet ?? 0)
    + (values.costBreeding ?? 0) + (values.costLabor ?? 0)
    + (values.costFacility ?? 0) + (values.costOther ?? 0);
  const netProfit = totalRevenue - totalCost;

  const handleSubmit = useCallback(() => {
    const input: FarmProfitEntryInput = {
      farmId,
      period,
      revenueMilk: values.revenueMilk ?? 0,
      revenueCalves: values.revenueCalves ?? 0,
      revenueSubsidies: values.revenueSubsidies ?? 0,
      revenueCullSales: values.revenueCullSales ?? 0,
      revenueOther: values.revenueOther ?? 0,
      costFeed: values.costFeed ?? 0,
      costVet: values.costVet ?? 0,
      costBreeding: values.costBreeding ?? 0,
      costLabor: values.costLabor ?? 0,
      costFacility: values.costFacility ?? 0,
      costOther: values.costOther ?? 0,
    };
    onSave(input);
  }, [farmId, period, values, onSave]);

  const formatSummary = (amount: number): string => {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억원`;
    if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString('ko-KR')}만원`;
    return `${sign}${abs.toLocaleString('ko-KR')}원`;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--ct-card)',
        borderRadius: 16,
        border: '1px solid var(--ct-border)',
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '24px 20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ct-text)' }}>
              수익성 데이터 입력
            </div>
            <div style={{ fontSize: 12, color: 'var(--ct-text-secondary)', marginTop: 4 }}>
              {farmName} &middot; {formatPeriodLabel(period)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'transparent',
              color: 'var(--ct-text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &times;
          </button>
        </div>

        {/* 수입 섹션 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#22c55e',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>&#x1F4C8;</span> 수입 항목
          </div>
          {REVENUE_FIELDS.map((field) => (
            <AmountField
              key={field.key}
              field={field}
              value={values[field.key] ?? 0}
              onChange={handleFieldChange}
            />
          ))}
          <div style={{
            textAlign: 'right',
            fontSize: 13,
            fontWeight: 700,
            color: '#22c55e',
            padding: '8px 0',
            borderTop: '1px solid var(--ct-border)',
          }}>
            수입 합계: {formatSummary(totalRevenue)}
          </div>
        </div>

        {/* 지출 섹션 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#ef4444',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>&#x1F4C9;</span> 지출 항목
          </div>
          {COST_FIELDS.map((field) => (
            <AmountField
              key={field.key}
              field={field}
              value={values[field.key] ?? 0}
              onChange={handleFieldChange}
            />
          ))}
          <div style={{
            textAlign: 'right',
            fontSize: 13,
            fontWeight: 700,
            color: '#ef4444',
            padding: '8px 0',
            borderTop: '1px solid var(--ct-border)',
          }}>
            지출 합계: {formatSummary(totalCost)}
          </div>
        </div>

        {/* 요약 */}
        <div style={{
          background: netProfit >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${netProfit >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 4 }}>순이익</div>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: netProfit >= 0 ? '#22c55e' : '#ef4444',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatSummary(netProfit)}
          </div>
          {totalRevenue > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginTop: 4 }}>
              마진율 {Math.round((netProfit / totalRevenue) * 1000) / 10}%
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--ct-border)',
              background: 'transparent',
              color: 'var(--ct-text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || (totalRevenue === 0 && totalCost === 0)}
            style={{
              flex: 2,
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: isSaving ? 'var(--ct-text-muted)' : 'var(--ct-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: (totalRevenue === 0 && totalCost === 0) ? 0.5 : 1,
            }}
          >
            {isSaving ? '저장 중...' : existingEntry ? '수정 저장' : '저장'}
          </button>
        </div>

        {existingEntry && (
          <div style={{
            fontSize: 10,
            color: 'var(--ct-text-muted)',
            textAlign: 'center',
            marginTop: 10,
          }}>
            마지막 수정: {new Date(existingEntry.updatedAt).toLocaleString('ko-KR')}
          </div>
        )}
      </div>
    </div>
  );
}
