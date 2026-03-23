// 브라우저 푸시 알림 관리 훅
// Service Worker 등록 → 구독 → 서버에 전달

import { useState, useEffect, useCallback } from 'react';
import { apiPost } from '@web/api/client';

type PushState = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed';

interface UsePushNotificationReturn {
  readonly pushState: PushState;
  readonly isSupported: boolean;
  readonly subscribe: () => Promise<void>;
  readonly unsubscribe: () => Promise<void>;
}

function getPermissionState(): PushState {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'prompt';
  return 'unsubscribed'; // granted but may not be subscribed yet
}

export function usePushNotification(): UsePushNotificationReturn {
  const [pushState, setPushState] = useState<PushState>(getPermissionState);

  // 초기 상태: 기존 구독 확인
  useEffect(() => {
    if (pushState === 'unsupported' || pushState === 'denied') return;

    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setPushState(existing ? 'subscribed' : (Notification.permission === 'granted' ? 'unsubscribed' : 'prompt'));
    }).catch(() => {
      setPushState('unsupported');
    });
  }, []);

  const subscribe = useCallback(async () => {
    try {
      // 권한 요청
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState('denied');
        return;
      }

      // VAPID public key 가져오기
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidKey) {
        console.warn('[Push] VAPID public key not configured');
        return;
      }

      // URL-safe base64 → Uint8Array
      const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
      const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }

      // Service Worker push 구독
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 서버에 구독 등록
      await apiPost('/notifications/subscribe', {
        subscription: subscription.toJSON(),
        minSeverity: 'high',
      });

      setPushState('subscribed');
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await apiPost('/notifications/unsubscribe', { endpoint: subscription.endpoint });
      }

      setPushState('unsubscribed');
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    }
  }, []);

  return {
    pushState,
    isSupported: pushState !== 'unsupported',
    subscribe,
    unsubscribe,
  };
}
