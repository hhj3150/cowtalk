// 경제성 데이터 입력 — 월별 수입/비용

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as economicsApi from '@web/api/economics.api';

interface Props {
  readonly farmId: string;
  readonly onClose?: () => void;
}

const INCOME_ITEMS = [
  { key: 'milkSales', label: '우유 판매' },
  { key: 'animalSales', label: '개체 판매' },
  { key: 'carcassSales', label: '도체 판매' },
  { key: 'byproducts', label: '부산물' },
  { key: 'subsidies', label: '보조금' },
];

const EXPENSE_ITEMS = [
  { key: 'feed', label: '사료비' },
  { key: 'labor', label: '인건비' },
  { key: 'veterinary', label: '수의/약품비' },
  { key: 'breeding', label: '번식비' },
  { key: 'facility', label: '시설비/감가상각' },
  { key: 'utilities', label: '전기/수도/연료' },
  { key: 'manure', label: '분뇨처리비' },
  { key: 'insurance', label: '보험료' },
  { key: 'transport', label: '운송비' },
  { key: 'other', label: '기타' },
];

export function FarmEconomicInput({ farmId, onClose }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [income, setIncome] = useState<Record<string, number>>({});
  const [expense, setExpense] = useState<Record<string, number>>({});

  const mutation = useMutation({
    mutationFn: () => economicsApi.saveEconomicEntry({ farmId, month, income, expense }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economics', farmId] });
      onClose?.();
    },
  });

  const totalIncome = Object.values(income).reduce((a, b) => a + b, 0);
  const totalExpense = Object.values(expense).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">경제 데이터 입력</h3>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border px-2 py-1 text-sm" />
      </div>

      {/* 수입 */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <h4 className="text-xs font-semibold text-green-800">수입 항목</h4>
        <div className="mt-2 space-y-1.5">
          {INCOME_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <label className="w-24 text-xs text-gray-600">{item.label}</label>
              <input
                type="number"
                value={income[item.key] ?? ''}
                onChange={(e) => setIncome({ ...income, [item.key]: Number(e.target.value) })}
                placeholder="0"
                className="flex-1 rounded border px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-gray-400">원</span>
            </div>
          ))}
          <p className="text-right text-xs font-bold text-green-700">합계: {totalIncome.toLocaleString()}원</p>
        </div>
      </div>

      {/* 비용 */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <h4 className="text-xs font-semibold text-red-800">비용 항목</h4>
        <div className="mt-2 space-y-1.5">
          {EXPENSE_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <label className="w-24 text-xs text-gray-600">{item.label}</label>
              <input
                type="number"
                value={expense[item.key] ?? ''}
                onChange={(e) => setExpense({ ...expense, [item.key]: Number(e.target.value) })}
                placeholder="0"
                className="flex-1 rounded border px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-gray-400">원</span>
            </div>
          ))}
          <p className="text-right text-xs font-bold text-red-700">합계: {totalExpense.toLocaleString()}원</p>
        </div>
      </div>

      {/* 순이익 */}
      <div className={`rounded-lg p-3 text-center ${totalIncome - totalExpense >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
        <p className="text-xs text-gray-500">순이익</p>
        <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
          {(totalIncome - totalExpense).toLocaleString()}원
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? '저장 중...' : '저장'}
        </button>
        {onClose && <button type="button" onClick={onClose} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-600">취소</button>}
      </div>
    </div>
  );
}
