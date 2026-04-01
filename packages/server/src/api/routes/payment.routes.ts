// 구독 결제 라우트 — 토스페이먼츠 빌링
// POST /payments/billing/confirm  — 빌링키 확인 후 구독 생성
// GET  /payments/subscription     — 현재 구독 상태 조회
// DELETE /payments/subscription   — 구독 취소
// GET  /payments/history          — 결제 내역
// POST /payments/charge           — 수동 즉시 결제 (관리자용)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { subscriptions, paymentHistory } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import {
  confirmBillingAuth,
  chargeBilling,
  generateOrderId,
  SUBSCRIPTION_PLANS,
} from '../../lib/toss-payments.js';
import { logger } from '../../lib/logger.js';

export const paymentRouter = Router();
paymentRouter.use(authenticate);

// ===========================
// 플랜 목록 (공개)
// ===========================

paymentRouter.get('/plans', (_req: Request, res: Response) => {
  const plans = Object.values(SUBSCRIPTION_PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    nameKo: p.nameKo,
    priceMonthly: p.priceMonthly,
    description: p.description,
    features: p.features,
    badge: 'badge' in p ? p.badge : undefined,
  }));
  res.json({ data: plans });
});

// ===========================
// 현재 구독 상태
// ===========================

paymentRouter.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (!sub) {
      res.json({ data: null });
      return;
    }

    const plan = SUBSCRIPTION_PLANS[sub.plan as keyof typeof SUBSCRIPTION_PLANS];

    res.json({
      data: {
        subscriptionId: sub.subscriptionId,
        plan: sub.plan,
        planName: plan?.nameKo ?? sub.plan,
        status: sub.status,
        priceMonthly: sub.priceMonthly,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        trialEndsAt: sub.trialEndsAt,
        cardMasked: (sub.metadata as { cardNumber?: string })?.cardNumber,
        cardCompany: (sub.metadata as { cardCompany?: string })?.cardCompany,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===========================
// 빌링키 확인 + 구독 생성
// authKey: 프론트에서 카드 등록 후 받은 키
// ===========================

const confirmBillingSchema = z.object({
  authKey: z.string().min(1),
  customerKey: z.string().min(1),
  plan: z.enum(['basic', 'pro', 'enterprise']),
  farmId: z.string().uuid().optional(),
});

paymentRouter.post('/billing/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = confirmBillingSchema.parse(req.body);
    const userId = req.user!.userId;
    const db = getDb();

    const selectedPlan = SUBSCRIPTION_PLANS[body.plan];

    // 엔터프라이즈는 별도 협의 (자동 결제 미지원)
    if (body.plan === 'enterprise') {
      res.status(400).json({ error: '엔터프라이즈 플랜은 별도 문의가 필요합니다. ha@d2o.kr로 연락해주세요.' });
      return;
    }

    // 기존 활성 구독 확인
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: '이미 활성 구독이 있습니다. 기존 구독을 취소 후 새로 가입해주세요.' });
      return;
    }

    // 빌링키 발급
    const billingResult = await confirmBillingAuth({
      authKey: body.authKey,
      customerKey: body.customerKey,
    });

    // 구독 레코드 생성 (첫 달 결제 전 pending 상태)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [newSub] = await db.insert(subscriptions).values({
      userId,
      farmId: body.farmId ?? null,
      plan: body.plan,
      status: 'pending',
      billingKey: billingResult.billingKey,
      customerKey: body.customerKey,
      priceMonthly: selectedPlan.priceMonthly,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      metadata: {
        cardCompany: billingResult.cardCompany ?? '',
        cardNumber: billingResult.cardNumber ?? '',
      },
    }).returning();

    // 첫 달 즉시 결제
    const orderId = generateOrderId('CT-SUB');
    let chargeSuccess = false;
    let tossPaymentKey: string | undefined;
    let receiptUrl: string | undefined;

    try {
      const charge = await chargeBilling({
        billingKey: billingResult.billingKey,
        customerKey: body.customerKey,
        amount: selectedPlan.priceMonthly,
        orderId,
        orderName: `CowTalk ${selectedPlan.nameKo} 구독 (1개월)`,
      });

      tossPaymentKey = charge.paymentKey;
      receiptUrl = charge.receiptUrl;
      chargeSuccess = charge.status === 'DONE';
    } catch (chargeErr) {
      logger.error({ error: chargeErr }, '[결제] 첫 달 결제 실패');
    }

    // 결제 내역 기록
    await db.insert(paymentHistory).values({
      subscriptionId: newSub!.subscriptionId,
      userId,
      tossOrderId: orderId,
      tossPaymentKey: tossPaymentKey ?? null,
      amount: selectedPlan.priceMonthly,
      status: chargeSuccess ? 'done' : 'failed',
      paidAt: chargeSuccess ? now : null,
      periodStart: now,
      periodEnd,
      receiptUrl: receiptUrl ?? null,
    });

    // 구독 상태 업데이트
    await db
      .update(subscriptions)
      .set({ status: chargeSuccess ? 'active' : 'past_due', updatedAt: now })
      .where(eq(subscriptions.subscriptionId, newSub!.subscriptionId));

    logger.info({ userId, plan: body.plan, chargeSuccess }, '[구독] 신규 구독 처리 완료');

    res.json({
      data: {
        subscriptionId: newSub!.subscriptionId,
        plan: body.plan,
        status: chargeSuccess ? 'active' : 'past_due',
        charged: chargeSuccess,
        amount: selectedPlan.priceMonthly,
        receiptUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===========================
// 구독 취소
// ===========================

paymentRouter.delete('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .limit(1);

    if (!sub) {
      res.status(404).json({ error: '활성 구독이 없습니다' });
      return;
    }

    const now = new Date();
    await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(eq(subscriptions.subscriptionId, sub.subscriptionId));

    logger.info({ userId, subscriptionId: sub.subscriptionId }, '[구독] 취소 완료');

    res.json({
      data: {
        message: '구독이 취소되었습니다. 현재 기간 만료일까지 서비스를 이용할 수 있습니다.',
        currentPeriodEnd: sub.currentPeriodEnd,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===========================
// 결제 내역
// ===========================

paymentRouter.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;

    const history = await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.userId, userId))
      .orderBy(desc(paymentHistory.createdAt))
      .limit(24); // 최대 2년치

    res.json({ data: history });
  } catch (err) {
    next(err);
  }
});
