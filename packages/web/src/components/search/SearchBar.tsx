// 통합 검색바 — 이력번호/이표번호/농장명 즉시 검색

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDrilldown } from '@web/hooks/useDrilldown';
import * as searchApi from '@web/api/search.api';
import type { SearchResult } from '@web/api/search.api';

const RECENT_KEY = 'cowtalk-recent-search';
const MAX_RECENT = 10;

function loadRecent(): readonly SearchResult[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as SearchResult[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(results: readonly SearchResult[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(results.slice(0, MAX_RECENT)));
}

export function SearchBar(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [recentItems, setRecentItems] = useState<readonly SearchResult[]>(loadRecent);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { navigateToDetail, openDrilldown } = useDrilldown();

  // 자동완성 디바운스
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchApi.searchAutocomplete(query.trim());
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback((item: SearchResult) => {
    const updated = [item, ...recentItems.filter((r) => r.id !== item.id)].slice(0, MAX_RECENT);
    setRecentItems(updated);
    saveRecent(updated);
    setQuery('');
    setIsOpen(false);

    if (item.type === 'animal') {
      navigateToDetail(item.id, item.earTag ?? item.label);
    } else {
      openDrilldown('all', item.label);
    }
  }, [recentItems, navigateToDetail, openDrilldown]);

  const displayItems = query.trim().length >= 2 ? results : recentItems;
  const hasQuery = query.trim().length >= 2;
  const showDropdown = isOpen && (displayItems.length > 0 || isLoading || hasQuery);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ct-text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          role="combobox"
          aria-expanded={showDropdown}
          aria-label="이력번호 / 귀표번호 / 농장명 검색"
          aria-autocomplete="list"
          placeholder="이력번호 / 귀표번호 / 농장명 검색..."
          className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--ct-border)',
            background: 'var(--ct-bg)',
            color: 'var(--ct-text)',
          }}
          onFocusCapture={(e) => { e.target.style.borderColor = 'var(--ct-primary)'; e.target.style.background = 'var(--ct-card)'; }}
          onBlurCapture={(e) => { e.target.style.borderColor = 'var(--ct-border)'; e.target.style.background = 'var(--ct-bg)'; }}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--ct-primary)', borderTopColor: 'transparent' }} />
          </div>
        )}
      </div>

      {showDropdown && (
        <div role="listbox" aria-label="검색 결과" className="absolute top-full z-50 mt-1 w-full rounded-xl py-1 shadow-lg ct-card">
          {query.trim().length < 2 && recentItems.length > 0 && (
            <p className="px-3 py-1 text-[10px] font-medium" style={{ color: 'var(--ct-text-secondary)' }}>최근 검색</p>
          )}
          {displayItems.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => handleSelect(item)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F0FAF5]"
            >
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={item.type === 'animal'
                  ? { background: '#DBEAFE', color: 'var(--ct-info)' }
                  : { background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }
                }
              >
                {item.type === 'animal' ? '개체' : '농장'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" style={{ color: 'var(--ct-text)' }}>{item.label}</p>
                {item.subLabel && <p className="truncate text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{item.subLabel}</p>}
              </div>
              {item.traceId && <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{item.traceId}</span>}
            </button>
          ))}
          {isLoading && displayItems.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>검색 중...</p>
          )}
          {!isLoading && query.trim().length >= 2 && displayItems.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>검색 결과가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
