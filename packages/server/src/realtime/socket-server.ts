// Socket.IO 서버 — 실시간 알람 push
// JWT 인증 + farmId별 room 자동 구독

import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/auth.js';
import { isUserApproved } from '../services/auth/approval.service.js';
import type { AuthTokenPayload } from '@cowtalk/shared';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null {
  return io;
}

/**
 * SEC-14: 소켓 방 = 데이터 범위. HTTP API 와 같은 배정 우선 규칙을 따른다.
 *   - 마스터 토큰, 또는 배정 없는 행정·방역관 → 전체 알람 방
 *   - 그 외 → 토큰의 배정 목장 방만 (예전: 배정이 걸린 행정관도 alarms:all 에 들어갔다)
 */
export function socketRoomsFor(payload: Pick<AuthTokenPayload, 'role' | 'farmIds' | 'isMaster'>): string[] {
  const farmIds = payload.farmIds ?? [];
  const adminRole = payload.role === 'government_admin' || payload.role === 'quarantine_officer';
  if (payload.isMaster || (adminRole && farmIds.length === 0)) return ['alarms:all'];
  return farmIds.map((id) => `farm:${id}`);
}

/** 토큰 만료까지 남은 ms (만료 정보가 없으면 null) */
export function msUntilExpiry(token: string, now: number = Date.now()): number | null {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? decoded.exp * 1000 - now : null;
}

const CORS_ORIGINS = config.NODE_ENV === 'production'
  ? [/\.netlify\.app$/, /cowtalk\.kr$/, /cowtalk\.netlify\.app$/]
  : ['http://localhost:5173', 'http://localhost:3000'];

export function createSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: CORS_ORIGINS as (string | RegExp)[],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // ── JWT 인증 미들웨어 ──
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string | undefined;
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }

      const payload = verifyAccessToken(token);
      // SEC-14: HTTP API 와 같은 승인 게이트 — 승인 대기·차단 계정은 실시간 알람도 받지 못한다
      if (!(await isUserApproved(payload.userId))) {
        next(new Error('Account not approved'));
        return;
      }
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      socket.data.farmIds = payload.farmIds ?? [];
      socket.data.rooms = socketRoomsFor(payload);
      socket.data.expiresInMs = msUntilExpiry(token);

      next();
    } catch (err) {
      logger.warn({ err }, '[Socket] Auth failed');
      next(new Error('Invalid token'));
    }
  });

  // ── 연결 핸들러 ──
  io.on('connection', (socket) => {
    const { userId, role, farmIds, rooms, expiresInMs } = socket.data as {
      userId: string;
      role: string;
      farmIds: readonly string[];
      rooms: readonly string[];
      expiresInMs: number | null;
    };

    logger.info({ userId, role, farmCount: farmIds.length, rooms: rooms.length }, '[Socket] Connected');

    for (const room of rooms) {
      void socket.join(room);
    }

    // SEC-14: 토큰이 만료되면 연결을 끊는다 — 클라이언트는 새 토큰으로 재연결한다
    // (예전: 한 번 연결되면 토큰 만료·승인 해제 후에도 계속 알람을 받았다)
    if (expiresInMs !== null) {
      const timer = setTimeout(() => socket.disconnect(true), Math.max(0, expiresInMs));
      socket.on('disconnect', () => clearTimeout(timer));
    }

    // ── 클라이언트 → 서버 이벤트 ──

    socket.on('alarm:acknowledge', (data: { eventId: string }) => {
      // 해당 farmId room에 확인 처리 broadcast
      for (const farmId of farmIds) {
        socket.to(`farm:${farmId}`).emit('alarm:acknowledged', {
          eventId: data.eventId,
          acknowledgedBy: userId,
          at: new Date().toISOString(),
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, '[Socket] Disconnected');
    });
  });

  logger.info('[Socket.IO] Server initialized');

  return io;
}
