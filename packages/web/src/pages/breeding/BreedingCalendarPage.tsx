// 번식 캘린더 — 월간/주간 뷰로 예정 이벤트를 시간축 기반으로 표시
// 임신감정, 건유, 분만, 발정 예상 등을 날짜별로 한눈에 확인

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBreedingCalendar, getBreedingPipeline } from '@web/api/breeding.api';
import { useFarmStore } from '@web/stores/farm.store';
import type { CalendarEvent, CalendarEventType, BreedingUrgentAction } from '@cowtalk/shared';

// ===========================
// 상수
// ===========================

const EVENT_META: Readonly<Record<CalendarEventType, { label: string; icon: string; color: string; bg: string }>> = {
  estrus_expected:       { label: '발정 예상',   icon: '🔴', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  insemination:          { label: '수정',        icon: '💉', color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
  pregnancy_check_due:   { label: '임신감정',    icon: '🔍', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  pregnancy_check_done:  { label: '감정 완료',   icon: '✅', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  dry_off:               { label: '건유',        icon: '🥛', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  calving_expected:      { label: '분만 예정',   icon: '🐄', color: '#ea580c', bg: 'rgba(234,88,12,0.08)' },
  calving_done:          { label: '분만 완료',   icon: '🎉', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  recheck_due:           { label: '재검사',      icon: '🔄', color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
};

const URGENCY_BORDER: Readonly<Record<string, string>> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: 'var(--ct-border)',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

type ViewMode = 'month' | 'week';

// ===========================
// 유틸
// ===========================

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  return addDays(d, -day);
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

function formatMonth(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function BreedingCalendarPage(): React.JSX.Element {
  const nav = useNavigate();
  const { selectedFarmId } = useFarmStore();

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 날짜 범위 계산
  const { rangeStart, rangeEnd, calendarDays } = useMemo(() => {
    if (viewMode === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const gridStart = startOfWeek(monthStart);
      const gridEnd = addDays(startOfWeek(addDays(monthEnd, 6)), 6);

      const days: Date[] = [];
      let cursor = gridStart;
      while (cursor <= gridEnd) {
        days.push(cursor);
        cursor = addDays(cursor, 1);
      }

      return {
        rangeStart: toDateStr(gridStart),
        rangeEnd: toDateStr(gridEnd),
        calendarDays: days,
      };
    }

    // week view
    const weekStart = startOfWeek(currentDate);
    const weekEnd = addDays(weekStart, 6);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }

    return {
      rangeStart: toDateStr(weekStart),
      rangeEnd: toDateStr(weekEnd),
      calendarDays: days,
    };
  }, [currentDate, viewMode]);

  // API 호출
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['breeding-calendar', rangeStart, rangeEnd, selectedFarmId],
    queryFn: () => getBreedingCalendar(rangeStart, rangeEnd, selectedFarmId || undefined),
    staleTime: 60_000,
  });

  // 오늘 긴급 조치 (파이프라인에서)
  const { data: pipeline } = useQuery({
    queryKey: ['breeding-pipeline', selectedFarmId],
    queryFn: () => getBreedingPipeline(selectedFarmId || undefined),
    staleTime: 5 * 60_000,
  });

  // 날짜별 이벤트 그룹핑
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const list = map.get(evt.date) ?? [];
      map.set(evt.date, [...list, evt]);
    }
    return map;
  }, [events]);

  // 선택된 날짜의 이벤트
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  const todayStr = toDateStr(new Date());
  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  // 네비게이션
  function navigatePrev(): void {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      setCurrentDate(addDays(currentDate, -7));
    }
    setSelectedDate(null);
  }

  function navigateNext(): void {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      setCurrentDate(addDays(currentDate, 7));
    }
    setSelectedDate(null);
  }

  function navigateToday(): void {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
            📅 번식 캘린더
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
            임신감정 · 건유 · 분만 · 발정 예정 일정
          </p>
        </div>

        {/* 뷰 모드 토글 */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--ct-bg)' }}>
          {(['month', 'week'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setViewMode(mode); setSelectedDate(null); }}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={
                viewMode === mode
                  ? { background: 'var(--ct-card)', color: 'var(--ct-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--ct-text-secondary)' }
              }
            >
              {mode === 'month' ? '월간' : '주간'}
            </button>
          ))}
        </div>
      </div>

      {/* 월 네비게이터 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={navigatePrev}
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
            {formatMonth(currentDate)}
          </h2>
          <button
            type="button"
            onClick={navigateToday}
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: 'var(--ct-primary)', color: 'white' }}
          >
            오늘
          </button>
        </div>
        <button
          type="button"
          onClick={navigateNext}
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
        >
          →
        </button>
      </div>

      <div className="flex gap-4">
        {/* 캘린더 그리드 */}
        <div className="flex-1">
          {viewMode === 'month' ? (
            <MonthGrid
              days={calendarDays}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              selectedDate={selectedDate}
              isCurrentMonth={isCurrentMonth}
              onSelectDate={setSelectedDate}
              isLoading={isLoading}
            />
          ) : (
            <WeekView
              days={calendarDays}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onAnimalClick={(animalId) => nav(`/cow/${animalId}`)}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* 사이드바 — 오늘 긴급 조치 (lg 이상) */}
        <div className="hidden lg:block w-72 flex-shrink-0">
          <TodaySidebar
            urgentActions={pipeline?.urgentActions ?? []}
            onAnimalClick={(animalId) => nav(`/cow/${animalId}`)}
          />
        </div>
      </div>

      {/* 선택 날짜 이벤트 목록 */}
      {selectedDate && (
        <SelectedDateEvents
          date={selectedDate}
          events={selectedEvents}
          onAnimalClick={(animalId) => nav(`/cow/${animalId}`)}
        />
      )}

      {/* 범례 */}
      <div
        className="rounded-xl border p-3 flex flex-wrap gap-3"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        {Object.entries(EVENT_META).map(([type, meta]) => (
          <span key={type} className="flex items-center gap-1 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ===========================
// 월간 그리드
// ===========================

interface MonthGridProps {
  readonly days: readonly Date[];
  readonly eventsByDate: ReadonlyMap<string, readonly CalendarEvent[]>;
  readonly todayStr: string;
  readonly selectedDate: string | null;
  readonly isCurrentMonth: (d: Date) => boolean;
  readonly onSelectDate: (date: string) => void;
  readonly isLoading: boolean;
}

function MonthGrid({ days, eventsByDate, todayStr, selectedDate, isCurrentMonth, onSelectDate, isLoading }: MonthGridProps): React.JSX.Element {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--ct-border)' }}
    >
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7" style={{ background: 'var(--ct-bg)' }}>
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className="text-center text-xs font-semibold py-2"
            style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--ct-text-secondary)' }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const isToday = isSameDay(dateStr, todayStr);
          const isSelected = selectedDate != null && isSameDay(dateStr, selectedDate);
          const inMonth = isCurrentMonth(day);

          // 이벤트 유형별 카운트
          const typeCounts = new Map<CalendarEventType, number>();
          for (const evt of dayEvents) {
            typeCounts.set(evt.type, (typeCounts.get(evt.type) ?? 0) + 1);
          }
          const hasOverdue = dayEvents.some((e) => e.status === 'overdue');
          const hasCritical = dayEvents.some((e) => e.urgency === 'critical');

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className="relative min-h-[72px] p-1 text-left transition-colors"
              style={{
                background: isSelected ? 'var(--ct-primary-light, rgba(59,130,246,0.08))' : 'var(--ct-card)',
                borderTop: '1px solid var(--ct-border)',
                borderRight: '1px solid var(--ct-border)',
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              {/* 날짜 번호 */}
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                  isToday ? 'text-white' : ''
                }`}
                style={
                  isToday
                    ? { background: 'var(--ct-primary)' }
                    : { color: day.getDay() === 0 ? '#dc2626' : day.getDay() === 6 ? '#2563eb' : 'var(--ct-text)' }
                }
              >
                {day.getDate()}
              </span>

              {/* 이벤트 배지 */}
              {isLoading ? (
                <div className="mt-0.5 h-3 w-10 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
              ) : dayEvents.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {[...typeCounts.entries()].slice(0, 3).map(([type, cnt]) => {
                    const meta = EVENT_META[type] as { label: string; icon: string; color: string; bg: string } | undefined;
                    if (!meta) return null;
                    return (
                      <span
                        key={type}
                        className="text-[9px] px-1 rounded"
                        style={{ background: meta.bg, color: meta.color }}
                        title={`${meta.label} ${cnt}건`}
                      >
                        {meta.icon}{cnt > 1 ? cnt : ''}
                      </span>
                    );
                  })}
                  {typeCounts.size > 3 && (
                    <span className="text-[9px] px-1" style={{ color: 'var(--ct-text-secondary)' }}>
                      +{typeCounts.size - 3}
                    </span>
                  )}
                </div>
              )}

              {/* 긴급/초과 마커 */}
              {(hasOverdue || hasCritical) && (
                <div
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ background: hasOverdue ? '#dc2626' : '#ea580c' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================
// 주간 뷰
// ===========================

interface WeekViewProps {
  readonly days: readonly Date[];
  readonly eventsByDate: ReadonlyMap<string, readonly CalendarEvent[]>;
  readonly todayStr: string;
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly onAnimalClick: (animalId: string) => void;
  readonly isLoading: boolean;
}

function WeekView({ days, eventsByDate, todayStr, selectedDate, onSelectDate, onAnimalClick, isLoading }: WeekViewProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      {days.map((day) => {
        const dateStr = toDateStr(day);
        const dayEvents = eventsByDate.get(dateStr) ?? [];
        const isToday = isSameDay(dateStr, todayStr);
        const isSelected = selectedDate != null && isSameDay(dateStr, selectedDate);

        return (
          <div
            key={dateStr}
            className="rounded-xl border p-3 transition-colors"
            style={{
              background: isSelected ? 'var(--ct-primary-light, rgba(59,130,246,0.06))' : 'var(--ct-card)',
              borderColor: isToday ? 'var(--ct-primary)' : 'var(--ct-border)',
              borderWidth: isToday ? '2px' : '1px',
            }}
          >
            {/* 날짜 헤더 */}
            <button
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className="flex items-center gap-2 mb-2 w-full text-left"
            >
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  isToday ? 'text-white' : ''
                }`}
                style={
                  isToday
                    ? { background: 'var(--ct-primary)' }
                    : { color: day.getDay() === 0 ? '#dc2626' : 'var(--ct-text)' }
                }
              >
                {day.getDate()}
              </span>
              <span className="text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
                {WEEKDAYS[day.getDay()]}요일
              </span>
              {dayEvents.length > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'var(--ct-primary)', color: 'white' }}
                >
                  {dayEvents.length}
                </span>
              )}
            </button>

            {/* 이벤트 카드 목록 */}
            {isLoading ? (
              <div className="space-y-1">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
                ))}
              </div>
            ) : dayEvents.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--ct-text-secondary)' }}>예정된 이벤트 없음</p>
            ) : (
              <div className="space-y-1">
                {dayEvents.map((evt) => (
                  <EventCard key={evt.eventId} event={evt} onAnimalClick={onAnimalClick} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================
// 이벤트 카드
// ===========================

interface EventCardProps {
  readonly event: CalendarEvent;
  readonly onAnimalClick: (animalId: string) => void;
}

function EventCard({ event, onAnimalClick }: EventCardProps): React.JSX.Element {
  const meta = EVENT_META[event.type] ?? { label: event.type, icon: '📌', color: '#6b7280', bg: 'var(--ct-bg)' };
  const borderColor = URGENCY_BORDER[event.urgency] ?? 'var(--ct-border)';

  return (
    <button
      type="button"
      onClick={() => onAnimalClick(event.animalId)}
      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:opacity-80"
      style={{
        background: meta.bg,
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <span className="text-base flex-shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold truncate" style={{ color: 'var(--ct-text)' }}>
            {event.earTag}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.label}
          </span>
          {event.status === 'overdue' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex-shrink-0">
              초과
            </span>
          )}
        </div>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ct-text-secondary)' }}>
          {event.description}
        </p>
      </div>
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--ct-text-secondary)' }}>›</span>
    </button>
  );
}

// ===========================
// 선택 날짜 이벤트 목록
// ===========================

interface SelectedDateEventsProps {
  readonly date: string;
  readonly events: readonly CalendarEvent[];
  readonly onAnimalClick: (animalId: string) => void;
}

function SelectedDateEvents({ date, events, onAnimalClick }: SelectedDateEventsProps): React.JSX.Element {
  const d = new Date(date);
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

  // 유형별 그룹
  const grouped = useMemo(() => {
    const map = new Map<CalendarEventType, CalendarEvent[]>();
    for (const evt of events) {
      const list = map.get(evt.type) ?? [];
      map.set(evt.type, [...list, evt]);
    }
    return map;
  }, [events]);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
        📋 {label} — {events.length}건
      </h3>

      {events.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
          예정된 이벤트가 없습니다
        </p>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([type, typeEvents]) => {
            const meta = EVENT_META[type] ?? { label: type, icon: '📌', color: '#6b7280', bg: 'var(--ct-bg)' };
            return (
              <div key={type}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span>{meta.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: meta.color }}>
                    {meta.label} ({typeEvents.length})
                  </span>
                </div>
                <div className="space-y-1 ml-5">
                  {typeEvents.map((evt) => (
                    <EventCard key={evt.eventId} event={evt} onAnimalClick={onAnimalClick} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================
// 오늘 긴급 조치 사이드바
// ===========================

interface TodaySidebarProps {
  readonly urgentActions: readonly BreedingUrgentAction[];
  readonly onAnimalClick: (animalId: string) => void;
}

function TodaySidebar({ urgentActions, onAnimalClick }: TodaySidebarProps): React.JSX.Element {
  return (
    <div
      className="rounded-xl border p-4 sticky top-4"
      style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
        🚨 오늘 긴급 조치
      </h3>

      {urgentActions.length === 0 ? (
        <div className="text-center py-6">
          <span className="text-2xl">✅</span>
          <p className="text-xs mt-2" style={{ color: 'var(--ct-text-secondary)' }}>
            긴급 조치 없음
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {urgentActions.slice(0, 10).map((action) => (
            <button
              key={`${action.animalId}-${action.actionType}`}
              type="button"
              onClick={() => onAnimalClick(action.animalId)}
              className="w-full text-left rounded-lg border p-2.5 transition-colors hover:opacity-80"
              style={{
                borderColor: URGENCY_BORDER[action.actionType === 'inseminate_now' ? 'critical' : 'high'],
                borderLeftWidth: '3px',
                background: 'var(--ct-bg)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold" style={{ color: 'var(--ct-text)' }}>
                  {action.earTag}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  {action.hoursRemaining > 0 ? `${Math.round(action.hoursRemaining)}h` : '즉시'}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>
                {action.description}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
