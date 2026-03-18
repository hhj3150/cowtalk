// 신생 송아지 체크리스트

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as calvingApi from '@web/api/calving.api';

interface Props {
  readonly calfId: string;
}

interface CheckItem {
  readonly key: keyof calvingApi.NewbornChecklist;
  readonly label: string;
  readonly deadline: string;
}

const CHECKLIST_ITEMS: readonly CheckItem[] = [
  { key: 'colostrumFed', label: '초유 급여', deadline: '생후 2시간 이내' },
  { key: 'navelDisinfected', label: '제대 소독', deadline: '즉시' },
  { key: 'healthCheck', label: '건강 관찰 (활력/호흡/체온)', deadline: '생후 1시간' },
  { key: 'earTagApplied', label: '이표 부착', deadline: '생후 24시간' },
  { key: 'traceIdIssued', label: '이력번호 발급', deadline: '생후 72시간' },
];

export function NewbornChecklist({ calfId }: Props): React.JSX.Element {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const mutation = useMutation({
    mutationFn: (update: Partial<calvingApi.NewbornChecklist>) =>
      calvingApi.updateNewbornChecklist(calfId, update),
  });

  function handleToggle(key: string): void {
    const newValue = !checked[key];
    const updated = { ...checked, [key]: newValue };
    setChecked(updated);
    mutation.mutate({ [key]: newValue } as Partial<calvingApi.NewbornChecklist>);
  }

  const completedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">신생아 체크리스트</h4>
        <span className="text-xs text-gray-400">{completedCount}/{CHECKLIST_ITEMS.length} 완료</span>
      </div>

      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${(completedCount / CHECKLIST_ITEMS.length) * 100}%` }} />
      </div>

      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleToggle(item.key)}
            className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${checked[item.key] ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            <div className={`flex h-5 w-5 items-center justify-center rounded border ${checked[item.key] ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300'}`}>
              {checked[item.key] && (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm ${checked[item.key] ? 'text-green-700 line-through' : 'text-gray-800'}`}>{item.label}</p>
              <p className="text-[10px] text-gray-400">{item.deadline}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
