// 토스페이먼츠 빌링(자동결제) API 클라이언트
// 공식 문서: https://docs.tosspayments.com/reference/billing
//
// 흐름:
// 1. 카드 등록: requestBillingAuth (프론트) → authKey 발급
// 2. 빌링키 확인: POST /v1/billing/authorizations/confirm (서버) → billingKey 저장
// 3. 정기 결제:   POST /v1/billing/{billingKey} (서버, 매월)

import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { logger } from './logger.js';

const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

// ===========================
// 타입
// ===========================

export interface BillingAuthConfirmParams {
  readonly authKey: string;
  readonly customerKey: string;
}

export interface BillingAuthResult {
  readonly billingKey: string;
  readonly customerKey: string;
  readonly cardCompany?: string;
  readonly cardNumber?: string;
}

export interface BillingChargeParams {
  readonly billingKey: string;
  readonly customerKey: string;
  readonly amount: number;
  readonly orderId: string;
  readonly orderName: string;
  readonly customerName?: string;
  readonly customerEmail?: string;
}

export interface BillingChargeResult {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
  readonly approvedAt?: string;
  readonly receiptUrl?: string;
  readonly totalAmount: number;
}

export interface TossErrorBody {
  readonly code: string;
  readonly message: string;
}

// ===========================
// 인증 헤더 생성
// Base64(secretKey + ":")
// ===========================

function buildAuthHeader(): string {
  const secretKey = config.TOSS_PAYMENTS_SECRET_KEY;
  if (!secretKey) {
    throw new Error('TOSS_PAYMENTS_SECRET_KEY가 설정되지 않았습니다');
  }
  const encoded = Buffer.from(`${secretKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

// ===========================
// 공통 fetch 래퍼
// ===========================

async function tossPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${TOSS_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as T | TossErrorBody;

  if (!response.ok) {
    const err = data as TossErrorBody;
    logger.error({ code: err.code, message: err.message, path }, '[토스페이먼츠] API 오류');
    throw new Error(`토스페이먼츠 오류 [${err.code}]: ${err.message}`);
  }

  return data as T;
}

// ===========================
// 빌링키 발급 확인
// authKey (프론트에서 전달) → billingKey
// ===========================

export async function confirmBillingAuth(
  params: BillingAuthConfirmParams,
): Promise<BillingAuthResult> {
  interface TossAuthResponse {
    readonly billingKey: string;
    readonly customerKey: string;
    readonly card?: { readonly company: string; readonly number: string };
  }

  const result = await tossPost<TossAuthResponse>(
    '/billing/authorizations/confirm',
    {
      authKey: params.authKey,
      customerKey: params.customerKey,
    },
  );

  logger.info({ customerKey: params.customerKey, billingKey: result.billingKey.slice(0, 10) + '...' },
    '[토스페이먼츠] 빌링키 발급 완료');

  return {
    billingKey: result.billingKey,
    customerKey: result.customerKey,
    cardCompany: result.card?.company,
    cardNumber: result.card?.number,
  };
}

// ===========================
// 빌링키로 자동결제
// ===========================

export async function chargeBilling(
  params: BillingChargeParams,
): Promise<BillingChargeResult> {
  interface TossChargeResponse {
    readonly paymentKey: string;
    readonly orderId: string;
    readonly status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
    readonly approvedAt?: string;
    readonly receipt?: { readonly url: string };
    readonly totalAmount: number;
  }

  const result = await tossPost<TossChargeResponse>(
    `/billing/${encodeURIComponent(params.billingKey)}`,
    {
      customerKey: params.customerKey,
      amount: params.amount,
      orderId: params.orderId,
      orderName: params.orderName,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    },
  );

  logger.info({
    paymentKey: result.paymentKey,
    orderId: result.orderId,
    amount: result.totalAmount,
    status: result.status,
  }, '[토스페이먼츠] 자동결제 완료');

  return {
    paymentKey: result.paymentKey,
    orderId: result.orderId,
    status: result.status,
    approvedAt: result.approvedAt,
    receiptUrl: result.receipt?.url,
    totalAmount: result.totalAmount,
  };
}

// ===========================
// 주문 ID 생성 (중복 방지)
// ===========================

export function generateOrderId(prefix = 'CT'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ===========================
// 구독 플랜 정의
// ===========================

export const SUBSCRIPTION_PLANS = {
  basic: {
    id: 'basic' as const,
    name: 'Basic',
    nameKo: '베이직',
    priceMonthly: 50_000,
    description: '소규모 목장용 기본 모니터링',
    features: [
      'smaXtec 센서 실시간 모니터링',
      '발정·분만 알림 (카카오톡)',
      '개체 건강 대시보드',
      '최대 1개 농장',
    ],
    limit: { farms: 1, animals: 100 },
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    nameKo: '프로',
    priceMonthly: 100_000,
    description: 'AI 번식관리 + 분석 리포트',
    features: [
      'Basic 전체 포함',
      'AI 번식 커맨드센터',
      '정액 추천 AI (혈통·유전체 분석)',
      '경제성 분석 대시보드',
      '공공데이터 자동 연동 (이력제·DHI)',
      '최대 1개 농장',
    ],
    limit: { farms: 1, animals: 500 },
    badge: '가장 인기',
  },
  enterprise: {
    id: 'enterprise' as const,
    name: 'Enterprise',
    nameKo: '엔터프라이즈',
    priceMonthly: 0, // 별도 협의
    description: '다농장·수의사·방역기관·지자체',
    features: [
      'Pro 전체 포함',
      '무제한 농장 연결',
      '역할별 다중 계정 (6개 역할)',
      '방역 드릴다운 대시보드',
      '지역 방역 일괄 알림',
      '전용 API · SLA 보장',
    ],
    limit: { farms: -1, animals: -1 },
  },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;
