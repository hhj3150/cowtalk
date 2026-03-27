// 공용 Google Maps 로더 훅 — 전체 앱에서 단일 인스턴스로 로드
// @react-google-maps/api의 useJsApiLoader 대신 직접 script 태그 관리
// 이유: useJsApiLoader가 복수 컴포넌트에서 호출 시 로드 실패하는 이슈 해결

import { useState, useEffect } from 'react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const SCRIPT_ID = 'google-maps-script';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

let globalState: LoadState = 'idle';
let globalError: Error | null = null;
const listeners = new Set<() => void>();

function notifyAll(): void {
  for (const fn of listeners) fn();
}

function loadGoogleMapsScript(): void {
  if (globalState === 'loaded' || globalState === 'loading') return;

  // 이미 window.google.maps가 있으면 (다른 경로로 로드됨)
  if (typeof window !== 'undefined' && window.google?.maps) {
    globalState = 'loaded';
    notifyAll();
    return;
  }

  // 이미 script 태그가 존재하면 기다림
  if (document.getElementById(SCRIPT_ID)) {
    globalState = 'loading';
    return;
  }

  globalState = 'loading';
  notifyAll();

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&language=ko&region=KR`;
  script.async = true;
  script.defer = true;

  script.onload = () => {
    globalState = 'loaded';
    globalError = null;
    notifyAll();
  };

  script.onerror = () => {
    globalState = 'error';
    globalError = new Error('Google Maps JavaScript API를 불러올 수 없습니다');
    notifyAll();
  };

  document.head.appendChild(script);
}

/**
 * Google Maps 로드 상태를 반환하는 훅
 * 앱 전체에서 몇 번을 호출해도 script는 1번만 로드됨
 */
export function useGoogleMaps(): {
  readonly isLoaded: boolean;
  readonly loadError: Error | null;
} {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);

    // 첫 호출 시 로드 시작
    loadGoogleMapsScript();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    isLoaded: globalState === 'loaded',
    loadError: globalState === 'error' ? globalError : null,
  };
}
