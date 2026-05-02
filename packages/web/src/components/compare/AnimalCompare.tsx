// 소 비교 — 2~3마리 센서 차트 겹쳐 비교

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as animalApi from '@web/api/animal.api';
import { SensorChart } from '@web/components/data/SensorChart';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly initialAnimalIds?: readonly string[];
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e'];

export function AnimalCompare({ initialAnimalIds = [] }: Props): React.JSX.Element {
  const [animalIds, setAnimalIds] = useState<readonly string[]>(initialAnimalIds);
  const [addInput, setAddInput] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 각 개체 데이터 로드 (최대 3마리 — hook 순서 보장 위해 고정 호출)
  const id0 = animalIds[0] ?? '';
  const id1 = animalIds[1] ?? '';
  const id2 = animalIds[2] ?? '';
  const query0 = useQuery({
    queryKey: ['animal', 'detail', id0],
    queryFn: () => animalApi.getAnimalDetail(id0),
    enabled: Boolean(id0),
  });
  const query1 = useQuery({
    queryKey: ['animal', 'detail', id1],
    queryFn: () => animalApi.getAnimalDetail(id1),
    enabled: Boolean(id1),
  });
  const query2 = useQuery({
    queryKey: ['animal', 'detail', id2],
    queryFn: () => animalApi.getAnimalDetail(id2),
    enabled: Boolean(id2),
  });
  const animalQueries = [
    { id: id0, query: query0 },
    { id: id1, query: query1 },
    { id: id2, query: query2 },
  ].filter((entry) => entry.id);

  function handleAdd(): void {
    const trimmed = addInput.trim();
    if (!trimmed || animalIds.length >= 3 || animalIds.includes(trimmed)) return;
    setAnimalIds([...animalIds, trimmed]);
    setAddInput('');
  }

  function handleRemove(id: string): void {
    setAnimalIds(animalIds.filter((a) => a !== id));
    setAiAnalysis(null);
  }

  async function handleAiCompare(): Promise<void> {
    if (animalIds.length < 2) return;
    setIsAnalyzing(true);
    try {
      const { sendChatMessage } = await import('@web/api/chat.api');
      const response = await sendChatMessage({
        question: `다음 ${animalIds.length}두의 차이점을 분석해주세요: ${animalIds.join(', ')}`,
        role: undefined,
        conversationHistory: [],
      });
      setAiAnalysis(response.answer);
    } catch {
      setAiAnalysis('AI 분석을 수행할 수 없습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">개체 비교</h1>
        {animalIds.length >= 2 && (
          <button
            type="button"
            onClick={handleAiCompare}
            disabled={isAnalyzing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isAnalyzing ? 'AI 분석 중...' : 'AI 차이점 분석'}
          </button>
        )}
      </div>

      {/* 개체 추가 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="동물 ID 또는 이표번호 입력..."
          disabled={animalIds.length >= 3}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={animalIds.length >= 3}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          추가 ({animalIds.length}/3)
        </button>
      </div>

      {/* 선택된 개체 태그 */}
      {animalIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {animalIds.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: `${COLORS[i]}20`, color: COLORS[i] }}>
              {id}
              <button type="button" onClick={() => handleRemove(id)} className="ml-1 text-xs hover:opacity-70">&times;</button>
            </span>
          ))}
        </div>
      )}

      {animalIds.length === 0 && <EmptyState message="비교할 개체를 2~3마리 추가하세요." />}

      {/* 비교 헤더 */}
      {animalIds.length >= 2 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${animalIds.length}, 1fr)` }}>
          {animalQueries.map(({ id, query }, i) => (
            <div key={id} className="rounded-lg border-2 p-3" style={{ borderColor: COLORS[i] }}>
              {query.isLoading ? <LoadingSkeleton lines={3} /> : query.data ? (
                <div>
                  <p className="text-sm font-bold" style={{ color: COLORS[i] }}>#{query.data.animal.earTag}</p>
                  <p className="text-xs text-gray-500">{query.data.animal.breed} / {query.data.animal.breedType === 'dairy' ? '젖소' : '한우'}</p>
                  <p className="text-xs text-gray-400">{query.data.animal.parity}산 / {query.data.animal.sex === 'female' ? '암' : '수'}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="rounded bg-gray-50 p-1">
                      <p className="text-gray-400">체온</p>
                      <p className="font-bold">{query.data.animal.latestTemperature ?? '-'}°C</p>
                    </div>
                    <div className="rounded bg-gray-50 p-1">
                      <p className="text-gray-400">활동</p>
                      <p className="font-bold">{query.data.animal.latestActivity ?? '-'}</p>
                    </div>
                    <div className="rounded bg-gray-50 p-1">
                      <p className="text-gray-400">반추</p>
                      <p className="font-bold">{query.data.animal.latestRumination ?? '-'}min</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">데이터 없음</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 센서 비교 차트 */}
      {animalIds.length >= 2 && (
        <div className="space-y-4">
          {['temperature', 'activity', 'rumination'].map((metric) => (
            <div key={metric} className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">
                {metric === 'temperature' ? '체온 비교' : metric === 'activity' ? '활동 비교' : '반추 비교'}
              </h3>
              <SensorChart
                animalId={animalIds[0]!}
                metrics={[{ key: metric, label: metric, color: COLORS[0]!, unit: metric === 'temperature' ? '°C' : metric === 'rumination' ? 'min' : '' }]}
              />
            </div>
          ))}
        </div>
      )}

      {/* AI 분석 결과 */}
      {aiAnalysis && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-800">AI 비교 분석</h3>
          <p className="whitespace-pre-wrap text-sm text-blue-700">{aiAnalysis}</p>
        </div>
      )}
    </div>
  );
}
