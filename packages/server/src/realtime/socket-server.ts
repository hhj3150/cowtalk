// Socket.IO 서버 — 실시간 알람 push
// JWT 인증 + farmId별 room 자동 구독

import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { getDb } from '../config/database.js';
import { userFarmAccess } from '../db/schema.js';
import { eq } from 'drizzle-orm';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null {
  return io;
}

interface TokenPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
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

      const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as TokenPayload;
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      socket.data.email = payload.email;

      // 사용자의 farmIds 조회 (user_farm_access 테이블)
      const db = getDb();
      const farmAccessRows = await db
        .select({ farmId: userFarmAccess.farmId })
        .from(userFarmAccess)
        .where(eq(userFarmAccess.userId, payload.userId));

      socket.data.farmIds = farmAccessRows.map((r) => r.farmId);

      next();
    } catch (err) {
      logger.warn({ err }, '[Socket] Auth failed');
      next(new Error('Invalid token'));
    }
  });

  // ── 연결 핸들러 ──
  io.on('connection', (socket) => {
    const { userId, role, farmIds } = socket.data as {
      userId: string;
      role: string;
      farmIds: readonly string[];
    };

    logger.info({ userId, role, farmCount: farmIds.length }, '[Socket] Connected');

    // farmId별 room 자동 join
    for (const farmId of farmIds) {
      socket.join(`farm:${farmId}`);
    }

    // 전체 알람 room (관리자용)
    if (role === 'government_admin' || role === 'quarantine_officer') {
      socket.join('alarms:all');
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
