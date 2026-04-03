// 농장 상세 페이지 — 지도 → 농장 → 개체 드릴다운의 중간 단계
// 농장 헤더 + KPI 카드 + 개체 목록 테이블

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFarmProfile, type FarmProfile } from '../../api/farm.api';
import { listAnimals, type AnimalSummary } from '../../api/animal.api';

// ===========================
// 타입
// ===========================

interface FarmAnimalsState {
  readonly animals: readonly AnimalSummary[];
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | null;
}

// ===========================
// 위험등급 배지
// ===========================

function HealthBadge({ score }: { readonly score: number }) {
  const level =
    score >= 80 ? { label: '양호', color: 'bg-green-100 text-green-800' } :
    score >= 60 ? { label: '주의', color: 'bg-yellow-100 text-yellow-800' } :
    score >= 40 ? { label: '경고', color: 'bg-orange-100 text-orange-800' } :
    { label: '위험', color: 'bg-red-100 text-red-800' };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${level.color}`}>
      {level.label} ({score})
    </span>
  );
}

// ===========================
// KPI 카드
// ===========================

function KpiCard({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: string | number | null;
  readonly unit?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">
        {value ?? '-'}
        {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

// ===========================
// 번식 상태 배지
// ===========================

function StatusBadge({ status }: { readonly status: string }) {
  const colorMap: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    milking: 'bg-blue-100 text-blue-700',
    dry: 'bg-amber-100 text-amber-700',
    heifer: 'bg-purple-100 text-purple-700',
    sold: 'bg-gray-100 text-gray-500',
    dead: 'bg-red-100 text-red-500',
  };
  const color = colorMap[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{status}</span>;
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function FarmDetailPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const [farm, setFarm] = useState<FarmProfile | null>(null);
  const [farmLoading, setFarmLoading] = useState(true);
  const [farmError, setFarmError] = useState<string | null>(null);

  const [animalState, setAnimalState] = useState<FarmAnimalsState>({
    animals: [],
    total: 0,
    loading: true,
    error: null,
  });

  const [searchQuery, setSearchQuery] = useState('');

  // 농장 프로필 로드
  useEffect(() => {
    if (!farmId) return;
    setFarmLoading(true);
    setFarmError(null);

    getFarmProfile(farmId)
      .then((data) => {
        setFarm(data);
        setFarmLoading(false);
      })
      .catch((err) => {
        setFarmError(err instanceof Error ? err.message : '농장 정보를 불러올 수 없습니다.');
        setFarmLoading(false);
      });
  }, [farmId]);

  // 개체 목록 로드
  const loadAnimals = useCallback(() => {
    if (!farmId) return;
    setAnimalState((prev) => ({ ...prev, loading: true, error: null }));

    listAnimals({ farmId, limit: 200, status: 'active' })
      .then((result) => {
        setAnimalState({
          animals: result.data,
          total: result.total,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        setAnimalState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : '개체 목록을 불러올 수 없습니다.',
        }));
      });
  }, [farmId]);

  useEffect(() => {
    loadAnimals();
  }, [loadAnimals]);

  // 검색 필터
  const filteredAnimals = searchQuery
    ? animalState.animals.filter(
        (a) =>
          a.earTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.traceId ?? '').includes(searchQuery),
      )
    : animalState.animals;

  // 두수 집계
  const headCounts = {
    total: animalState.animals.length,
    dairy: animalState.animals.filter((a) => a.breedType === 'dairy').length,
    beef: animalState.animals.filter((a) => a.breedType === 'beef').length,
  };

  // 로딩
  if (farmLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // 에러
  if (farmError) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
        <p className="text-red-600 dark:text-red-400 font-medium">{farmError}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded text-sm"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="뒤로 가기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {farm?.farmName ?? '농장'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {farm?.address ?? ''} · {farm?.ownerName ?? ''}
            </p>
          </div>
        </div>
        {farm && <HealthBadge score={farm.healthScore} />}
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="총 두수" value={farm?.totalAnimals ?? headCounts.total} unit="두" />
        <KpiCard
          label="수태율"
          value={farm?.conceptionRate != null ? `${farm.conceptionRate}` : null}
          unit="%"
        />
        <KpiCard
          label="평균공태일"
          value={farm?.avgOpenDays != null ? `${farm.avgOpenDays}` : null}
          unit="일"
        />
        <KpiCard
          label="폐사율"
          value={farm?.mortalityRate != null ? `${(farm.mortalityRate * 100).toFixed(1)}` : null}
          unit="%"
        />
      </div>

      {/* 개체 목록 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            개체 목록 ({filteredAnimals.length}두)
          </h2>
          <input
            type="text"
            placeholder="귀번호/이력번호 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="개체 검색"
          />
        </div>

        {animalState.loading ? (
          <div className="p-8 text-center text-gray-500">불러오는 중...</div>
        ) : animalState.error ? (
          <div className="p-8 text-center text-red-500">{animalState.error}</div>
        ) : filteredAnimals.length === 0 ? (
          <div className="p-8 text-center text-gray-400">등록된 개체가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">귀번호</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">이력번호</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">품종</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">산차</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">상태</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">체온</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredAnimals.map((animal) => (
                  <tr
                    key={animal.animalId}
                    onClick={() => navigate(`/cow/${animal.animalId}`)}
                    className="hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition"
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/cow/${animal.animalId}`);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      #{animal.earTag}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">
                      {animal.traceId ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{animal.breed}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{animal.parity}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={animal.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {animal.latestTemperature != null ? (
                        <span
                          className={
                            animal.latestTemperature >= 39.5
                              ? 'text-red-600 font-semibold'
                              : 'text-gray-600 dark:text-gray-300'
                          }
                        >
                          {animal.latestTemperature.toFixed(1)}°
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
