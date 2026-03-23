// Socket.IO 클라이언트 — 실시간 알람 연결
// JWT 인증 + 자동 재연결 + 연결 상태 관리

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@web/stores/auth.store';
import { useQueryClient } from '@tanstack/react-query';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSocketReturn {
  readonly socket: Socket | null;
  readonly connectionState: ConnectionState;
  readonly connectedCount: number;
}

// 싱글턴 소켓 인스턴스
let sharedSocket: Socket | null = null;
let socketRefCount = 0;

function getOrCreateSocket(token: string): Socket {
  if (sharedSocket?.connected) return sharedSocket;

  sharedSocket?.disconnect();

  sharedSocket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
  });

  return sharedSocket;
}

export function useSocket(): UseSocketReturn {
  const token = useAuthStore((s) => s.accessToken);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectedCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      setConnectionState('disconnected');
      return;
    }

    const socket = getOrCreateSocket(token);
    socketRef.current = socket;
    socketRefCount++;

    setConnectionState(socket.connected ? 'connected' : 'connecting');

    const onConnect = () => setConnectionState('connected');
    const onDisconnect = () => setConnectionState('disconnected');
    const onError = () => setConnectionState('error');
    const onReconnect = () => setConnectionState('connected');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.io.on('reconnect', onReconnect);

    return () => {
      socketRefCount--;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.io.off('reconnect', onReconnect);

      if (socketRefCount <= 0) {
        socket.disconnect();
        sharedSocket = null;
        socketRefCount = 0;
      }
    };
  }, [token]);

  return {
    socket: socketRef.current,
    connectionState,
    connectedCount,
  };
}

// 특정 이벤트 구독 훅
export function useSocketEvent<T = unknown>(
  event: string,
  callback: (data: T) => void,
): void {
  const { socket } = useSocket();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!socket) return;

    const handler = (data: T) => callbackRef.current(data);
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [socket, event]);
}

// WebSocket → React Query 알람 캐시 동기화 (대시보드에서 1회 호출)
export function useSocketAlarmSync(): void {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handler = (alarm: Record<string, unknown>) => {
      queryClient.setQueriesData(
        { queryKey: ['live-alarms'] },
        (prev: { alarms: readonly Record<string, unknown>[] } | undefined) => {
          if (!prev) return prev;
          const exists = prev.alarms.some((a) => a.eventId === alarm.eventId);
          if (exists) return prev;
          return { alarms: [alarm, ...prev.alarms].slice(0, 50) };
        },
      );
    };

    socket.on('alarm:new', handler);
    return () => { socket.off('alarm:new', handler); };
  }, [socket, queryClient]);
}
