// 카카오 알림톡 발송 서비스 (Solapi API 기반)
// 테스트 모드: KAKAO_ALIMTALK_TEST_MODE=true → 실제 발송 없이 로그만
// 프로덕션: 카카오 채널 등록 + 템플릿 심사 승인 후 즉시 전환
//
// Solapi API 문서: https://developers.solapi.com/references/messages
// 카카오 비즈니스 채널 등록: https://business.kakao.com

import crypto from 'node:crypto';
import { logger } from './logger.js';
import { config } from '../config/index.js';

// ===========================
// 타입
// ===========================

export type AlimtalkTemplateId =
  | 'ESTRUS_ALERT'         // 발정 감지 알림
  | 'INSEMINATION_TIMING'  // 수정 적기 알림
  | 'PREGNANCY_CHECK_DUE'  // 임신감정 예정 알림
  | 'CALVING_IMMINENT'     // 분만 임박 알림
  | 'DISEASE_SUSPECTED'    // 질병 의심 알림
  | 'QUARANTINE_ALERT';    // 방역 경보

export interface AlimtalkVariable {
  readonly [key: string]: string;
}

export interface AlimtalkMessage {
  readonly to: string;               // 수신자 전화번호 (010-XXXX-XXXX)
  readonly templateId: AlimtalkTemplateId;
  readonly variables: AlimtalkVariable;
  readonly farmName?: string;        // 로그용
  readonly animalTag?: string;       // 로그용
}

export interface AlimtalkResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly error?: string;
  readonly testMode: boolean;
}

// ===========================
// 알림톡 템플릿 정의
// (카카오 채널 심사 승인 후 실제 templateCode 매핑)
// ===========================

interface TemplateConfig {
  readonly templateCode: string;   // Solapi에 등록된 템플릿 코드
  readonly content: string;        // 템플릿 내용 (변수 포함)
  readonly smsFailover: string;    // 알림톡 실패 시 SMS 대체 문자
}

const TEMPLATES: Readonly<Record<AlimtalkTemplateId, TemplateConfig>> = {
  ESTRUS_ALERT: {
    templateCode: 'CT_ESTRUS_V1',
    content: '[CowTalk] 발정 감지 알림\n\n목장: #{farmName}\n개체: #{earTag}번\n감지 시각: #{detectedAt}\n\n수정 적기: #{optimalTime}\n\n지금 바로 CowTalk에서 정액을 추천받으세요.',
    smsFailover: '[CowTalk] #{farmName} #{earTag}번 발정 감지. 수정 적기: #{optimalTime}',
  },
  INSEMINATION_TIMING: {
    templateCode: 'CT_INSEM_V1',
    content: '[CowTalk] 수정 적기 도래\n\n목장: #{farmName}\n개체: #{earTag}번\n수정 가능 시간: #{windowStart} ~ #{windowEnd}\n\n지금이 최적의 수정 시간입니다.\nCowTalk에서 추천 정액을 확인하세요.',
    smsFailover: '[CowTalk] #{farmName} #{earTag}번 수정 적기: #{windowStart}~#{windowEnd}',
  },
  PREGNANCY_CHECK_DUE: {
    templateCode: 'CT_PREG_CHECK_V1',
    content: '[CowTalk] 임신감정 예정 알림\n\n목장: #{farmName}\n개체: #{earTag}번\n수정일: #{inseminationDate}\n임신감정 예정일: #{checkDate} (수정 후 #{days}일)\n\nCowTalk에서 임신감정 결과를 기록해주세요.',
    smsFailover: '[CowTalk] #{farmName} #{earTag}번 임신감정 예정: #{checkDate}',
  },
  CALVING_IMMINENT: {
    templateCode: 'CT_CALVING_V1',
    content: '[CowTalk] 분만 임박 알림\n\n목장: #{farmName}\n개체: #{earTag}번 (#{parity}산)\n예상 분만일: #{calvingDate}\n\n분만 준비를 확인해주세요.\n이상 시 즉시 수의사에게 연락하세요.',
    smsFailover: '[CowTalk] #{farmName} #{earTag}번 분만 임박. 예상: #{calvingDate}',
  },
  DISEASE_SUSPECTED: {
    templateCode: 'CT_DISEASE_V1',
    content: '[CowTalk] 질병 의심 알림\n\n목장: #{farmName}\n개체: #{earTag}번\n의심 증상: #{symptom}\nAI 신뢰도: #{confidence}%\n\n즉시 수의사에게 상담하고\nCowTalk에서 세부 내용을 확인하세요.',
    smsFailover: '[CowTalk] #{farmName} #{earTag}번 #{symptom} 의심. CowTalk 확인 바람.',
  },
  QUARANTINE_ALERT: {
    templateCode: 'CT_QUARANTINE_V1',
    content: '[CowTalk] 방역 경보\n\n지역: #{region}\n의심 질병: #{disease}\n발생 농장: #{farmCount}개소\n경보 등급: #{level}\n\n즉시 방역 조치를 시행하고\n이상 개체 발견 시 신고해주세요.',
    smsFailover: '[CowTalk] 방역경보 — #{region} #{disease} 의심. 즉시 방역 조치 바람.',
  },
};

// ===========================
// 전화번호 정규화
// ===========================

function normalizePhone(phone: string): string {
  // 010-1234-5678 → 01012345678 (Solapi 형식)
  return phone.replace(/[-\s]/g, '');
}

// ===========================
// Solapi HMAC 인증 헤더
// ===========================

function buildSolapiAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const message = `${date}${salt}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// ===========================
// 변수 치환
// ===========================

function applyVariables(template: string, variables: AlimtalkVariable): string {
  return template.replace(/\#\{(\w+)\}/g, (_, key: string) => variables[key] ?? `(${key})`);
}

// ===========================
// 실제 API 발송
// ===========================

async function sendViaSolapi(
  msg: AlimtalkMessage,
  template: TemplateConfig,
): Promise<AlimtalkResult> {
  const apiKey = config.KAKAO_ALIMTALK_API_KEY;
  const apiSecret = config.KAKAO_ALIMTALK_API_SECRET;
  const pfId = config.KAKAO_ALIMTALK_PFID;
  const from = config.KAKAO_ALIMTALK_FROM;

  if (!apiKey || !apiSecret || !pfId || !from) {
    logger.warn('[알림톡] Solapi 인증 정보 미설정 → 테스트 모드 전환');
    return sendTestMode(msg, template);
  }

  const payload = {
    message: {
      to: normalizePhone(msg.to),
      from,
      type: 'ATA',
      kakaoOptions: {
        pfId,
        templateId: template.templateCode,
        variables: msg.variables,
        disableSms: false, // 알림톡 실패 시 SMS로 자동 대체
        smsOptions: {
          type: 'SMS',
          from,
          content: applyVariables(template.smsFailover, msg.variables),
        },
      },
    },
  };

  try {
    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildSolapiAuthHeader(apiKey, apiSecret),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Solapi API 오류 ${response.status}: ${errorBody}`);
    }

    const result = await response.json() as { messageId?: string };

    logger.info({
      to: msg.to,
      templateId: msg.templateId,
      farmName: msg.farmName,
      animalTag: msg.animalTag,
      messageId: result.messageId,
    }, '[알림톡] 발송 성공');

    return { success: true, messageId: result.messageId, testMode: false };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg, templateId: msg.templateId }, '[알림톡] 발송 실패');
    return { success: false, error: errMsg, testMode: false };
  }
}

// ===========================
// 테스트 모드 (로그만)
// ===========================

function sendTestMode(msg: AlimtalkMessage, template: TemplateConfig): AlimtalkResult {
  const content = applyVariables(template.content, msg.variables);

  logger.info({
    testMode: true,
    to: msg.to,
    templateId: msg.templateId,
    farmName: msg.farmName,
    animalTag: msg.animalTag,
    content,
  }, '[알림톡 테스트] 발송 시뮬레이션 (실제 미발송)');

  return { success: true, messageId: `TEST-${Date.now()}`, testMode: true };
}

// ===========================
// 공개 API
// ===========================

export async function sendAlimtalk(msg: AlimtalkMessage): Promise<AlimtalkResult> {
  const template = TEMPLATES[msg.templateId];

  if (config.KAKAO_ALIMTALK_TEST_MODE) {
    return sendTestMode(msg, template);
  }

  return sendViaSolapi(msg, template);
}

export async function sendBatchAlimtalk(
  messages: readonly AlimtalkMessage[],
): Promise<readonly AlimtalkResult[]> {
  const results: AlimtalkResult[] = [];
  for (const msg of messages) {
    const result = await sendAlimtalk(msg);
    results.push(result);
  }
  return results;
}

// ===========================
// 편의 함수 — 이벤트별 빠른 발송
// ===========================

export async function notifyEstrus(params: {
  phone: string;
  farmName: string;
  earTag: string;
  detectedAt: string;
  optimalTime: string;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: params.phone,
    templateId: 'ESTRUS_ALERT',
    variables: {
      farmName: params.farmName,
      earTag: params.earTag,
      detectedAt: params.detectedAt,
      optimalTime: params.optimalTime,
    },
    farmName: params.farmName,
    animalTag: params.earTag,
  });
}

export async function notifyInseminationTiming(params: {
  phone: string;
  farmName: string;
  earTag: string;
  windowStart: string;
  windowEnd: string;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: params.phone,
    templateId: 'INSEMINATION_TIMING',
    variables: {
      farmName: params.farmName,
      earTag: params.earTag,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
    },
    farmName: params.farmName,
    animalTag: params.earTag,
  });
}

export async function notifyPregnancyCheckDue(params: {
  phone: string;
  farmName: string;
  earTag: string;
  inseminationDate: string;
  checkDate: string;
  days: number;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: params.phone,
    templateId: 'PREGNANCY_CHECK_DUE',
    variables: {
      farmName: params.farmName,
      earTag: params.earTag,
      inseminationDate: params.inseminationDate,
      checkDate: params.checkDate,
      days: String(params.days),
    },
    farmName: params.farmName,
    animalTag: params.earTag,
  });
}

export async function notifyCalvingImminent(params: {
  phone: string;
  farmName: string;
  earTag: string;
  parity: number;
  calvingDate: string;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: params.phone,
    templateId: 'CALVING_IMMINENT',
    variables: {
      farmName: params.farmName,
      earTag: params.earTag,
      parity: String(params.parity),
      calvingDate: params.calvingDate,
    },
    farmName: params.farmName,
    animalTag: params.earTag,
  });
}

export async function notifyDiseaseSuspected(params: {
  phone: string;
  farmName: string;
  earTag: string;
  symptom: string;
  confidence: number;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: params.phone,
    templateId: 'DISEASE_SUSPECTED',
    variables: {
      farmName: params.farmName,
      earTag: params.earTag,
      symptom: params.symptom,
      confidence: String(Math.round(params.confidence)),
    },
    farmName: params.farmName,
    animalTag: params.earTag,
  });
}

export async function notifyQuarantineAlert(params: {
  phones: readonly string[];
  region: string;
  disease: string;
  farmCount: number;
  level: '주의' | '경계' | '심각';
}): Promise<readonly AlimtalkResult[]> {
  const variables = {
    region: params.region,
    disease: params.disease,
    farmCount: String(params.farmCount),
    level: params.level,
  };
  return sendBatchAlimtalk(
    params.phones.map((phone) => ({
      to: phone,
      templateId: 'QUARANTINE_ALERT' as AlimtalkTemplateId,
      variables,
    })),
  );
}
