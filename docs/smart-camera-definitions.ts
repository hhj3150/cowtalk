/**
 * CowTalk 지능형 카메라 연동 — 타입 정의 + API 명세
 *
 * 하원장님 비전: "센서가 알려주고, AI가 판단하고, 카메라가 보여준다"
 * 이 파일은 카메라 하드웨어가 연결되면 바로 사용할 수 있는 인터페이스 정의.
 *
 * 작성일: 2026-04-15
 */

// ─── 카메라 등록 ────────────────────────────────────────────────

export interface FarmCamera {
  readonly cameraId: string;
  readonly farmId: string;
  readonly name: string;                 // "1동 PTZ카메라"
  readonly location: string;             // "1동 서측", "분만실"
  readonly model: string;                // "Hikvision DS-2DE4225IW"
  readonly streamUrl: string;            // rtsp://192.168.1.100:554/stream
  readonly ptzControlUrl: string;        // http://192.168.1.100/ISAPI/PTZCtrl
  readonly snapshotUrl: string;          // http://192.168.1.100/ISAPI/Streaming
  readonly protocol: 'onvif' | 'rtsp' | 'hls' | 'webrtc';
  readonly capabilities: CameraCapabilities;
  readonly status: 'online' | 'offline' | 'error';
  readonly lastHeartbeat: string;        // ISO date
  readonly createdAt: string;
}

export interface CameraCapabilities {
  readonly ptz: boolean;                 // Pan-Tilt-Zoom 지원
  readonly ir: boolean;                  // 적외선(야간) 지원
  readonly ai: boolean;                  // Edge AI (개체 인식)
  readonly resolution: '1080p' | '4K';
  readonly zoomRange: number;            // 배율 (예: 25)
  readonly fieldOfViewDeg: number;       // 시야각 (예: 120°)
}

// ─── 개체 추적 ──────────────────────────────────────────────────

export type TrackingStatus = 'searching' | 'tracking' | 'lost' | 'completed' | 'cancelled';

export interface CameraTrackingRequest {
  readonly animalId: string;
  readonly cameraId?: string;            // 지정하지 않으면 최적 카메라 자동 선택
  readonly reason: string;               // "estrus_alarm", "mastitis_risk", "calving_imminent"
  readonly alarmId?: string;             // 트리거한 알람 ID
  readonly autoClipSeconds?: number;     // 자동 클립 저장 (기본 30초)
}

export interface CameraTrackingEvent {
  readonly trackingId: string;
  readonly cameraId: string;
  readonly animalId: string;
  readonly alarmId: string | null;
  readonly reason: string;
  readonly requestedAt: string;
  readonly locatedAt: string | null;       // 개체 발견 시각
  readonly trackingStatus: TrackingStatus;
  readonly identificationMethod: 'ear_tag_ocr' | 'body_pattern' | 'sensor_location' | 'manual';
  readonly confidence: number;             // 개체 식별 확신도 0~100
  readonly snapshotUrl: string | null;     // 발견 시 캡처 이미지
  readonly clipUrl: string | null;         // 30초 클립
  readonly ptzPosition: PTZPosition | null;
}

export interface PTZPosition {
  readonly pan: number;    // 수평 각도 (0~360°)
  readonly tilt: number;   // 수직 각도 (-90~+30°)
  readonly zoom: number;   // 줌 배율 (1~25x)
}

// ─── PTZ 제어 ───────────────────────────────────────────────────

export type PTZCommand =
  | { readonly action: 'move'; readonly pan: number; readonly tilt: number }
  | { readonly action: 'zoom'; readonly level: number }
  | { readonly action: 'preset'; readonly presetId: string }  // 미리 저장한 위치
  | { readonly action: 'home' }                                // 원위치
  | { readonly action: 'track'; readonly animalId: string };   // 자동 추적

// ─── 원격 진료 세션 ─────────────────────────────────────────────

export interface RemoteExamSession {
  readonly sessionId: string;
  readonly veterinarianId: string;
  readonly farmId: string;
  readonly animalId: string;
  readonly cameraId: string;
  readonly alarmId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly observations: readonly RemoteObservation[];
  readonly diagnosis: string | null;
  readonly treatment: string | null;
  readonly snapshots: readonly string[];   // 캡처 이미지 URL 목록
}

export interface RemoteObservation {
  readonly timestamp: string;
  readonly type: 'visual' | 'sensor' | 'ai_analysis';
  readonly description: string;
  readonly snapshotUrl: string | null;
}

// ─── 알람 → 카메라 자동 연동 규칙 ───────────────────────────────

export interface CameraAlarmTriggerRule {
  readonly alarmType: string;
  readonly minSeverity: 'info' | 'caution' | 'warning' | 'critical';
  readonly autoTrack: boolean;           // 자동 추적 시작
  readonly autoClip: boolean;            // 자동 클립 저장
  readonly autoSnapshot: boolean;        // 자동 스냅샷
  readonly notifyVet: boolean;           // 수의사 알림
}

/** 알람 타입별 카메라 자동 연동 규칙 */
export const CAMERA_TRIGGER_RULES: readonly CameraAlarmTriggerRule[] = [
  // 발정: 수정 적기 판단에 육안 확인 유용
  { alarmType: 'estrus',            minSeverity: 'info',     autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: false },
  // 분만: 난산 감시 필수
  { alarmType: 'calving_detection', minSeverity: 'warning',  autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: true },
  // 유방염: 유방 상태 육안 확인
  { alarmType: 'mastitis_risk',     minSeverity: 'caution',  autoTrack: true,  autoClip: false, autoSnapshot: true,  notifyVet: true },
  // 기립불능: 응급
  { alarmType: 'downer_cow',        minSeverity: 'critical', autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: true },
  // 유열: 응급
  { alarmType: 'milk_fever',        minSeverity: 'warning',  autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: true },
  // 건강 이상: 보행 관찰
  { alarmType: 'health_general',    minSeverity: 'warning',  autoTrack: false, autoClip: false, autoSnapshot: true,  notifyVet: false },
  { alarmType: 'clinical_condition', minSeverity: 'warning', autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: true },
  // 활동 감소: 파행 의심 → 보행 관찰
  { alarmType: 'activity_decrease', minSeverity: 'warning',  autoTrack: true,  autoClip: true,  autoSnapshot: true,  notifyVet: false },
];

// ─── 카메라 AI 분석 결과 ────────────────────────────────────────

export interface CameraAIAnalysis {
  readonly analysisId: string;
  readonly cameraId: string;
  readonly animalId: string;
  readonly timestamp: string;
  readonly detections: readonly VisualDetection[];
}

export interface VisualDetection {
  readonly type:
    | 'udder_swelling'        // 유방 부종
    | 'lameness'              // 파행 (보행 이상)
    | 'bcs_estimate'          // 체충실지수 추정
    | 'nasal_discharge'       // 콧물
    | 'coughing'              // 기침
    | 'lying_abnormal'        // 이상 기립/와위
    | 'eating_behavior'       // 섭식 행동
    | 'social_isolation'      // 우군 분리 (질병 징후)
    | 'estrus_mounting'       // 승가 행동 (발정)
    | 'calving_signs';        // 분만 징후 (꼬리 들기, 불안)
  readonly confidence: number; // 0~100
  readonly boundingBox?: { x: number; y: number; width: number; height: number };
  readonly description: string;
}

// ─── 수의사가 카메라로 관찰할 수 있는 진단 항목 ──────────────────

export const VISUAL_DIAGNOSTIC_CHECKLIST = {
  general: [
    'BCS (체충실지수) 1~5점 평가',
    '자세/기립 상태',
    '호흡 양상 (속도, 깊이, 복식호흡 여부)',
    '분변 상태 (설사, 혈변, 점막)',
    '피모 상태 (윤기, 탈모, 기생충)',
  ],
  udder: [
    '유방 부종 여부',
    '유방 좌우 대칭',
    '유두 상태 (상처, 유즙 누출)',
    '유방 피부색 변화',
  ],
  locomotion: [
    '보행 점수 (1~5점)',
    '체중 부하 비대칭',
    '발굽 상태 (가능 시)',
    '관절 부종',
  ],
  reproduction: [
    '외음부 부종/분비물',
    '승가 행동 (발정)',
    '꼬리 들기/불안 (분만)',
    '후산 배출 여부',
  ],
  respiratory: [
    '기침 빈도',
    '콧물 (장액성/점액성/화농성)',
    '호흡수 (분당)',
    '복식호흡 여부',
  ],
} as const;
