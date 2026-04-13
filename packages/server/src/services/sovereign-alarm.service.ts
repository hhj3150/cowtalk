/**
 * 소버린 AI 알람 생성 서비스 — 재수출 shim
 * 실제 구현은 sovereign-alarm/ 디렉토리로 이동됨.
 * 기존 import 호환성 유지.
 */

export {
  generateSovereignAlarms,
  saveSovereignAlarmLabel,
  getSovereignAlarmAccuracy,
} from './sovereign-alarm/index.js';

export type {
  SovereignAlarm,
  AnimalProfile,
  SaveSovereignLabelInput,
  SovereignAlarmAccuracy,
} from './sovereign-alarm/index.js';
