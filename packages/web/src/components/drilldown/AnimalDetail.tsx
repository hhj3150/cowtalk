// 개체 상세 — 역할별 뷰 (Part C 핵심)
// 모든 역할이 같은 소를 클릭하면 이 화면이 열린다. 역할에 따라 보이는 섹션과 순서가 다르다.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnimalDetail } from '@web/hooks/useAnimal';
import { useAuthStore } from '@web/stores/auth.store';
import { TraceSection } from '@web/components/trace/TraceSection';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';
import { SensorChart } from '@web/components/data/SensorChart';
import { AiInsightPanel } from '@web/components/ai/AiInsightPanel';
import { ActionCard } from '@web/components/ai/ActionCard';
import { FeedbackButtons } from '@web/components/feedback/FeedbackButtons';
import { SemenRecommendation } from '@web/components/breeding/SemenRecommendation';
import { PedigreeTree } from '@web/components/breeding/PedigreeTree';
import { EventRecorder } from '@web/components/event/EventRecorder';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';
import type { Role } from '@cowtalk/shared';
import type { EventCategory } from '@web/api/event.api';

interface Props {
  readonly animalId: string;
}

// 역할별 센서 차트 메트릭 순서
const SENSOR_ORDER_BY_ROLE: Record<Role, readonly { key: string; label: string; color: string; unit: string }[]> = {
  farmer: [
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
    { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
  ],
  veterinarian: [
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
    { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
  ],
  inseminator: [
    { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
  ],
  government_admin: [
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
    { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
  ],
  quarantine_officer: [
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
    { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
  ],
  feed_company: [
    { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
    { key: 'waterIntake', label: '음수', color: '#06b6d4', unit: 'L' },
    { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
  ],
};

// 역할별 표시 섹션 (순서)
type SectionKey = 'sensor' | 'ai' | 'actions' | 'record' | 'pedigree' | 'semen' | 'breeding' | 'health' | 'production' | 'events' | 'timeline' | 'feedback' | 'trace' | 'insemination';

const SECTIONS_BY_ROLE: Record<Role, readonly SectionKey[]> = {
  farmer: ['sensor', 'ai', 'actions', 'record', 'trace', 'insemination', 'production', 'breeding', 'health', 'events', 'feedback'],
  veterinarian: ['sensor', 'ai', 'actions', 'record', 'trace', 'insemination', 'health', 'pedigree', 'breeding', 'production', 'events', 'timeline', 'feedback'],
  inseminator: ['sensor', 'ai', 'actions', 'record', 'trace', 'insemination', 'semen', 'pedigree', 'breeding', 'timeline', 'events', 'feedback'],
  government_admin: ['sensor', 'ai', 'record', 'trace', 'production', 'health', 'events'],
  quarantine_officer: ['sensor', 'ai', 'record', 'trace', 'health', 'events'],
  feed_company: ['sensor', 'ai', 'record', 'production', 'events'],
};

export function AnimalDetail({ animalId }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role) ?? 'farmer';
  const { data, isLoading, error, refetch } = useAnimalDetail(animalId);

  if (isLoading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />;
  // API는 { animalId, earTag, ..., recentEvents, interpretation } flat 구조로 반환
  // AnimalDetailData.animal은 타입 정의상 있지만, 실제 응답에서는 data 자체가 animal
  const rawData = data as unknown as Record<string, unknown>;
  if (!rawData?.animalId && !rawData?.animal) return <div className="text-sm text-gray-400">개체를 찾을 수 없습니다.</div>;

  const animal = (rawData.animal ?? rawData) as unknown as Record<string, unknown> & { earTag: string; breedType: string; breed: string; parity: number; sex: string; status: string; farmName: string; traceId: string | null; farmId: string; latestTemperature: number | null; latestActivity: number | null; latestRumination: number | null };
  const interpretation = (rawData.interpretation ?? null) as Record<string, unknown> | null;
  const metrics = SENSOR_ORDER_BY_ROLE[role];
  const sections = SECTIONS_BY_ROLE[role];

  return (
    <div className="space-y-6">
      {/* 공통 헤더 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">#{animal.earTag}</h2>
          <Badge label={animal.breedType === 'dairy' ? '젖소' : '한우'} variant="info" />
          <Badge label={animal.breed} variant="info" />
          <Badge label={`${animal.parity}산`} variant="info" />
          <Badge label={animal.sex === 'female' ? '암' : '수'} variant="info" />
          {animal.status && (
            <Badge
              label={STATUS_LABELS[animal.status] ?? animal.status}
              variant={STATUS_VARIANTS[animal.status] ?? 'info'}
            />
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {animal.traceId && (
            <span className="text-xs text-gray-400">이력번호: {animal.traceId}</span>
          )}
          <span className="text-xs text-gray-400">{animal.farmName}</span>
          <button
            type="button"
            onClick={() => navigate(`/cow/${animalId}`)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white ml-auto"
            style={{ background: '#16a34a' }}
          >
            🧚 팅커벨 AI
          </button>
        </div>

        {/* 최신 센서값 */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[
            { label: '체온', value: animal.latestTemperature, unit: '°C' },
            { label: '활동', value: animal.latestActivity, unit: '' },
            { label: '반추', value: animal.latestRumination, unit: 'min' },
          ].map((s) => (
            <div key={s.label} className="rounded bg-gray-50 p-2 text-center">
              <p className="text-[10px] text-gray-500">{s.label}</p>
              <p className="text-sm font-bold text-gray-800">{s.value ?? '-'}{s.value !== null ? s.unit : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 역할별 섹션 */}
      {sections.map((section) => (
        <SectionRenderer
          key={section}
          section={section}
          animalId={animalId}
          animal={animal as unknown as Record<string, unknown>}
          interpretation={interpretation}
          role={role}
          metrics={metrics}
          data={data as unknown as Record<string, unknown>}
        />
      ))}
    </div>
  );
}

// 섹션 렌더러
function SectionRenderer({
  section,
  animalId,
  animal,
  interpretation,
  role,
  metrics,
  data,
}: {
  section: SectionKey;
  animalId: string;
  animal: Record<string, unknown>;
  interpretation: Record<string, unknown> | null;
  role: Role;
  metrics: readonly { key: string; label: string; color: string; unit: string }[];
  data: Record<string, unknown>;
}): React.JSX.Element {
  switch (section) {
    case 'sensor':
      return (
        <Section title="센서 차트">
          <SensorChart animalId={animalId} metrics={metrics} />
        </Section>
      );

    case 'ai':
      return interpretation ? (
        <Section title="AI 해석">
          <AiInsightPanel
            summary={String(interpretation.summary ?? '')}
            interpretation={String(interpretation.interpretation ?? '')}
            risks={Array.isArray(interpretation.risks) ? interpretation.risks as string[] : []}
            source={String(interpretation.source ?? 'v4_fallback')}
            severity={typeof interpretation.severity === 'string' ? interpretation.severity : undefined}
            dataReferences={Array.isArray(interpretation.dataReferences) ? interpretation.dataReferences as string[] : undefined}
          />
        </Section>
      ) : <></>;

    case 'actions':
      return interpretation?.actions ? (
        <Section title="추천 행동">
          {typeof (interpretation.actions as Record<string, unknown>)[role] === 'string' && (
            <ActionCard
              action={String((interpretation.actions as Record<string, unknown>)[role])}
              target={`#${String(animal.earTag ?? '')}`}
              urgency={String(interpretation.severity ?? 'low')}
              animalId={animalId}
              farmId={String(animal.farmId ?? '')}
            />
          )}
        </Section>
      ) : <></>;

    case 'pedigree':
      return (
        <Section title="혈통/유전체">
          <PedigreeTree animalId={animalId} />
        </Section>
      );

    case 'semen':
      return (
        <Section title="정액 추천">
          <SemenRecommendation animalId={animalId} />
        </Section>
      );

    case 'breeding':
      return (
        <Section title="번식 이력">
          <BreedingHistoryList history={data.breedingHistory as readonly Record<string, unknown>[] ?? []} detailed={role === 'inseminator' || role === 'veterinarian'} />
        </Section>
      );

    case 'health':
      return (
        <Section title="진료 이력">
          <HealthHistoryList history={data.healthHistory as readonly Record<string, unknown>[] ?? []} detailed={role === 'veterinarian'} />
        </Section>
      );

    case 'production':
      return (
        <Section title="생산 데이터">
          <ProductionData data={data.production as Record<string, unknown> | null} growth={data.growth as Record<string, unknown> | null} breedType={String(animal.breedType ?? 'dairy')} />
        </Section>
      );

    case 'record':
      return (
        <Section title="이벤트 기록">
          <AnimalRecordPanel animalId={animalId} farmId={String(animal.farmId ?? '')} role={role} />
        </Section>
      );

    case 'events':
      return (
        <Section title="이벤트 이력">
          <EventTimeline events={data.events as readonly Record<string, unknown>[] ?? []} />
        </Section>
      );

    case 'timeline':
      return (
        <Section title="예측 타임라인">
          <PredictionTimeline interpretation={interpretation} />
        </Section>
      );

    case 'trace':
      return (
        <Section title="🏛️ 축산물이력추적">
          <TraceSection animalId={animalId} compact={false} />
        </Section>
      );

    case 'insemination':
      return (
        <Section title="💉 번식 관리 — 수정 추천">
          <InseminationPanel animalId={animalId} />
        </Section>
      );

    case 'feedback':
      return (
        <Section title="피드백">
          <FeedbackButtons animalId={animalId} farmId={String(animal.farmId ?? '')} />
        </Section>
      );

    default:
      return <></>;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

// ── 개체 이벤트 기록 패널 ──

const QUICK_ACTIONS: readonly {
  readonly label: string;
  readonly icon: string;
  readonly category: EventCategory;
  readonly color: string;
  readonly bg: string;
  readonly roles: readonly Role[];
}[] = [
  { label: '백신 접종', icon: '💉', category: 'health', color: '#E24B4A', bg: '#FEE2E2', roles: ['farmer', 'veterinarian', 'quarantine_officer', 'government_admin'] },
  { label: '분만 기록', icon: '🐄', category: 'breeding', color: '#D97706', bg: '#FEF3C7', roles: ['farmer', 'veterinarian', 'inseminator'] },
  { label: '건강 검진', icon: '🩺', category: 'health', color: '#378ADD', bg: '#DBEAFE', roles: ['farmer', 'veterinarian', 'quarantine_officer', 'government_admin'] },
  { label: '번식 기록', icon: '🧬', category: 'breeding', color: '#A855F7', bg: '#F3E8FF', roles: ['farmer', 'veterinarian', 'inseminator'] },
  { label: '사료 기록', icon: '🌾', category: 'feed', color: '#EA580C', bg: '#FFF7ED', roles: ['farmer', 'feed_company'] },
  { label: '이동 기록', icon: '🚛', category: 'movement', color: '#7C3AED', bg: '#EDE9FE', roles: ['farmer', 'government_admin', 'quarantine_officer'] },
  { label: '관리 기록', icon: '📋', category: 'management', color: '#1D9E75', bg: '#E1F5EE', roles: ['farmer', 'veterinarian', 'government_admin', 'quarantine_officer'] },
  { label: '기타', icon: '📝', category: 'other', color: '#888880', bg: '#F5F5F3', roles: ['farmer', 'veterinarian', 'inseminator', 'government_admin', 'quarantine_officer', 'feed_company'] },
];

function AnimalRecordPanel({
  animalId,
  farmId,
  role,
}: {
  readonly animalId: string;
  readonly farmId: string;
  readonly role: Role;
}): React.JSX.Element {
  const [activeCategory, setActiveCategory] = useState<EventCategory | null>(null);

  const visibleActions = QUICK_ACTIONS.filter((a) => a.roles.includes(role));

  if (activeCategory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className="mb-3 text-xs text-blue-500 hover:text-blue-700"
        >
          ← 다른 기록 선택
        </button>
        <EventRecorder
          farmId={farmId}
          animalId={animalId}
          initialCategory={activeCategory}
          onClose={() => setActiveCategory(null)}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {visibleActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => setActiveCategory(action.category)}
          className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:shadow-md"
          style={{
            borderColor: action.bg,
            background: action.bg,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = action.color; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = action.bg; }}
        >
          <span className="text-lg">{action.icon}</span>
          <span className="text-xs font-medium" style={{ color: action.color }}>
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// 간이 서브 컴포넌트들
function BreedingHistoryList({ history, detailed }: { history: readonly Record<string, unknown>[]; detailed: boolean }): React.JSX.Element {
  if (history.length === 0) return <p className="text-xs text-gray-400">번식 이력이 없습니다.</p>;
  const items = detailed ? history : history.slice(0, 3);
  return (
    <div className="space-y-2">
      {items.map((h, i) => (
        <div key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs">
          <span>{String(h.date ?? '')}</span>
          <span>{String(h.semenType ?? '-')}</span>
          <Badge label={String(h.result ?? '?')} variant={h.result === 'success' ? 'success' : 'info'} />
        </div>
      ))}
      {!detailed && history.length > 3 && <p className="text-[10px] text-gray-400">외 {history.length - 3}건</p>}
    </div>
  );
}

function HealthHistoryList({ history, detailed }: { history: readonly Record<string, unknown>[]; detailed: boolean }): React.JSX.Element {
  if (history.length === 0) return <p className="text-xs text-gray-400">진료 이력이 없습니다.</p>;
  const items = detailed ? history : history.slice(0, 3);
  return (
    <div className="space-y-2">
      {items.map((h, i) => (
        <div key={i} className="rounded bg-gray-50 px-3 py-2 text-xs">
          <p className="font-medium">{String(h.diagnosis ?? '')}</p>
          {detailed && Boolean(h.treatment) && <p className="text-gray-500">치료: {String(h.treatment)}</p>}
          <p className="text-gray-400">{String(h.date ?? '')}</p>
        </div>
      ))}
    </div>
  );
}

function ProductionData({ data, growth, breedType }: { data: Record<string, unknown> | null; growth: Record<string, unknown> | null; breedType: string }): React.JSX.Element {
  if (breedType === 'dairy' && data) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '유량', value: data.milkYield, unit: 'kg' },
          { label: '유지방', value: data.fat, unit: '%' },
          { label: '유단백', value: data.protein, unit: '%' },
          { label: 'SCC', value: data.scc, unit: '천' },
        ].map((item) => (
          <div key={item.label} className="rounded bg-gray-50 p-2 text-center">
            <p className="text-[10px] text-gray-500">{item.label}</p>
            <p className="text-sm font-bold">{item.value !== null ? `${String(item.value)}${item.unit}` : '-'}</p>
          </div>
        ))}
      </div>
    );
  }
  if (breedType === 'beef' && growth) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '체중', value: growth.weight, unit: 'kg' },
          { label: '일당증체량', value: growth.dailyGain, unit: 'kg' },
          { label: '등급 예상', value: growth.gradeEstimate, unit: '' },
        ].map((item) => (
          <div key={item.label} className="rounded bg-gray-50 p-2 text-center">
            <p className="text-[10px] text-gray-500">{item.label}</p>
            <p className="text-sm font-bold">{item.value ? `${String(item.value)}${item.unit}` : '-'}</p>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-xs text-gray-400">생산 데이터가 없습니다.</p>;
}

function EventTimeline({ events }: { events: readonly Record<string, unknown>[] }): React.JSX.Element {
  if (events.length === 0) return <p className="text-xs text-gray-400">이벤트가 없습니다.</p>;
  return (
    <div className="space-y-2">
      {events.slice(0, 10).map((e, i) => (
        <div key={i} className="flex items-center gap-3 rounded bg-gray-50 px-3 py-2 text-xs">
          <span className="text-gray-400">{String(e.detectedAt ?? e.timestamp ?? '')}</span>
          <Badge label={String(e.type ?? '')} variant="info" />
          <span className="text-gray-600">{String(e.details ?? '')}</span>
        </div>
      ))}
    </div>
  );
}

function PredictionTimeline({ interpretation }: { interpretation: Record<string, unknown> | null }): React.JSX.Element {
  // 예측 타임라인 — Claude 해석에서 추출
  if (!interpretation) return <p className="text-xs text-gray-400">예측 정보가 없습니다.</p>;
  return (
    <div className="rounded bg-blue-50 p-3 text-xs text-blue-800">
      {interpretation.timeline ? String(interpretation.timeline) : 'AI 예측 타임라인이 생성되면 여기에 표시됩니다.'}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  normal: '정상',
  estrus: '발정',
  health_risk: '건강이상',
  calving_soon: '분만징후',
};

const STATUS_VARIANTS: Record<string, 'normal' | 'high' | 'critical' | 'medium' | 'info'> = {
  normal: 'normal',
  estrus: 'medium',
  health_risk: 'high',
  calving_soon: 'critical',
};
