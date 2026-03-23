// 알람 이벤트 발행 — Socket.IO room에 push
// smaXtec 이벤트 INSERT 또는 기상 경보 발생 시 호출

import { getIO } from './socket-server.js';
import { logger } from '../lib/logger.js';

export interface AlarmPayload {
  readonly eventId: string;
  readonly eventType: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly animalId?: string;
  readonly earTag?: string;
  readonly severity: string;
  readonly confidence: number;
  readonly detectedAt: string;
  readonly details?: unknown;
}

export interface WeatherAlertPayload {
  readonly farmId: string;
  readonly farmName: string;
  readonly alertType: 'heat_stress' | 'cold_stress';
  readonly temperature: number;
  readonly thi?: number;
  readonly level: string;
  readonly message: string;
  readonly detectedAt: string;
}

/** 새 알람을 해당 농장 room + 전체 room에 push */
export function emitNewAlarm(alarm: AlarmPayload): void {
  const io = getIO();
  if (!io) return;

  try {
    // 해당 농장 room
    io.to(`farm:${alarm.farmId}`).emit('alarm:new', alarm);

    // 관리자 전체 room
    io.to('alarms:all').emit('alarm:new', alarm);

    logger.debug(
      { eventId: alarm.eventId, farmId: alarm.farmId, eventType: alarm.eventType },
      '[Emitter] Alarm pushed',
    );
  } catch (err) {
    logger.error({ err }, '[Emitter] Failed to emit alarm');
  }
}

/** 기상 경보를 해당 농장 room에 push */
export function emitWeatherAlert(alert: WeatherAlertPayload): void {
  const io = getIO();
  if (!io) return;

  try {
    io.to(`farm:${alert.farmId}`).emit('alarm:weather', alert);
    io.to('alarms:all').emit('alarm:weather', alert);

    logger.info(
      { farmId: alert.farmId, alertType: alert.alertType, level: alert.level },
      '[Emitter] Weather alert pushed',
    );
  } catch (err) {
    logger.error({ err }, '[Emitter] Failed to emit weather alert');
  }
}

/** 연결된 클라이언트 수 조회 */
export async function getConnectedCount(): Promise<number> {
  const io = getIO();
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  return sockets.length;
}
