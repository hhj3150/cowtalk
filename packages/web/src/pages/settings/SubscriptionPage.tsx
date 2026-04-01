// 구독 결제 페이지 — 토스페이먼츠 빌링
// 농림부 공모사업 시연용: 플랜 선택 → 카드 등록 → 즉시 결제 시연

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@web/api/client';

// ===========================
// 타입
// ===========================

interface PlanData {
  readonly id: string;
  readonly name: string;
  readonly nameKo: string;
  readonly priceMonthly: number;
  readonly description: string;
  readonly features: readonly string[];
  readonly badge?: string;
}

interface SubscriptionData {
  readonly subscriptionId: string;
  readonly plan: string;
  readonly planName: string;
  readonly status: string;
  readonly priceMonthly: number;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly trialEndsAt: string | null;
  readonly cardMasked?: string;
  readonly cardCompany?: string;
}

interface PaymentRecord {
  readonly paymentId: string;
  readonly tossOrderId: string;
  readonly amount: number;
  readonly status: string;
  readonly paidAt: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly receiptUrl: string | null;
}

// ===========================
// 상수
// ===========================

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:    { label: '활성', color: '#16a34a' },
  cancelled: { label: '취소됨', color: '#6b7280' },
  past_due:  { label: '결제 실패', color: '#dc2626' },
  pending:   { label: '처리 중', color: '#d97706' },
};

// 토스페이먼츠 SDK 스크립트 동적 로드
function loadTossScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('toss-payments-sdk')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'toss-payments-sdk';
    script.src = 'https://js.tosspayments.com/v2/standard';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('토스페이먼츠 SDK 로드 실패'));
    document.head.appendChild(script);
  });
}

const PAYMENT_STATUS: Record<string, string> = {
  done:      '✅ 성공',
  failed:    '❌ 실패',
  pending:   '⏳ 대기',
  cancelled: '↩️ 취소',
};

// ===========================
// 메인 페이지
// ===========================

export default function SubscriptionPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);

  const { data: plansData } = useQuery<{ data: PlanData[] }>({
    queryKey: ['subscription-plans'],
    queryFn: () => apiGet('/payments/plans'),
    staleTime: Infinity,
  });

  const { data: subData, isLoading: subLoading } = useQuery<{ data: SubscriptionData | null }>({
    queryKey: ['my-subscription'],
    queryFn: () => apiGet('/payments/subscription'),
    staleTime: 60_000,
  });

  const { data: historyData } = useQuery<{ data: PaymentRecord[] }>({
    queryKey: ['payment-history'],
    queryFn: () => apiGet('/payments/history'),
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiDelete('/payments/subscription'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
    },
  });

  const plans = plansData?.data ?? [];
  const subscription = subData?.data ?? null;
  const history = historyData?.data ?? [];

  const handleSelectPlan = (planId: string) => {
    if (planId === 'enterprise') {
      window.open('mailto:ha@d2o.kr?subject=CowTalk 엔터프라이즈 문의', '_blank');
      return;
    }
    setSelectedPlan(planId);
    setShowCardForm(true);
  };

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>구독 관리</h1>

      {/* 현재 구독 카드 */}
      {!subLoading && subscription && (
        <CurrentSubscriptionCard
          subscription={subscription}
          onCancel={() => {
            if (window.confirm('구독을 취소하시겠습니까? 현재 기간 만료 후 서비스가 중단됩니다.')) {
              cancelMutation.mutate();
            }
          }}
          cancelling={cancelMutation.isPending}
        />
      )}

      {/* 플랜 선택 */}
      {!subscription && (
        <div>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>플랜 선택</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan === plan.id}
                onSelect={() => handleSelectPlan(plan.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 카드 등록 폼 */}
      {showCardForm && selectedPlan && selectedPlan !== 'enterprise' && (
        <BillingCardForm
          planId={selectedPlan}
          planName={plans.find((p) => p.id === selectedPlan)?.nameKo ?? selectedPlan}
          amount={plans.find((p) => p.id === selectedPlan)?.priceMonthly ?? 0}
          onSuccess={() => {
            setShowCardForm(false);
            setSelectedPlan(null);
            void queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
            void queryClient.invalidateQueries({ queryKey: ['payment-history'] });
          }}
          onCancel={() => {
            setShowCardForm(false);
            setSelectedPlan(null);
          }}
        />
      )}

      {/* 결제 내역 */}
      {history.length > 0 && (
        <PaymentHistoryTable history={history} />
      )}

      {/* 안내 */}
      <NoticeBox />
    </div>
  );
}

// ===========================
// 현재 구독 카드
// ===========================

function CurrentSubscriptionCard({
  subscription,
  onCancel,
  cancelling,
}: {
  readonly subscription: SubscriptionData;
  readonly onCancel: () => void;
  readonly cancelling: boolean;
}): React.JSX.Element {
  const statusInfo = STATUS_LABEL[subscription.status] ?? { label: subscription.status, color: '#6b7280' };

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'rgba(59,130,246,0.05)', border: '1.5px solid var(--ct-primary)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-lg" style={{ color: 'var(--ct-text)' }}>
              {subscription.planName} 플랜
            </p>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${statusInfo.color}18`, color: statusInfo.color }}
            >
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
            월 {subscription.priceMonthly.toLocaleString()}원
          </p>
          {subscription.currentPeriodEnd && (
            <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
              현재 기간: {fmtDate(subscription.currentPeriodStart)} ~ {fmtDate(subscription.currentPeriodEnd)}
            </p>
          )}
          {subscription.cardCompany && (
            <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
              결제 카드: {subscription.cardCompany} {subscription.cardMasked}
            </p>
          )}
        </div>
        {subscription.status === 'active' && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="text-sm px-3 py-1.5 rounded-lg border disabled:opacity-50 flex-shrink-0"
            style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            {cancelling ? '취소 중...' : '구독 취소'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================
// 플랜 카드
// ===========================

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  readonly plan: PlanData;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 cursor-pointer transition-all hover:opacity-90 relative"
      style={{
        border: selected ? '2px solid var(--ct-primary)' : '1px solid var(--ct-border)',
        background: selected ? 'rgba(59,130,246,0.06)' : 'var(--ct-card)',
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      aria-pressed={selected}
    >
      {plan.badge && (
        <span
          className="absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-full font-bold"
          style={{ background: 'var(--ct-primary)', color: '#fff' }}
        >
          {plan.badge}
        </span>
      )}
      <div>
        <p className="font-bold text-base" style={{ color: 'var(--ct-text)' }}>{plan.nameKo}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>{plan.description}</p>
      </div>

      <div>
        {plan.priceMonthly > 0 ? (
          <p className="text-2xl font-bold" style={{ color: 'var(--ct-primary)' }}>
            {plan.priceMonthly.toLocaleString()}
            <span className="text-sm font-normal ml-1" style={{ color: 'var(--ct-text-secondary)' }}>원/월</span>
          </p>
        ) : (
          <p className="text-base font-bold" style={{ color: 'var(--ct-text)' }}>별도 협의</p>
        )}
      </div>

      <ul className="space-y-1 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-colors"
        style={{
          background: plan.priceMonthly === 0 ? 'transparent' : 'var(--ct-primary)',
          color: plan.priceMonthly === 0 ? 'var(--ct-primary)' : '#fff',
          border: plan.priceMonthly === 0 ? '1.5px solid var(--ct-primary)' : 'none',
        }}
      >
        {plan.priceMonthly === 0 ? '문의하기' : '시작하기'}
      </button>
    </div>
  );
}

// ===========================
// 빌링 카드 등록 폼
// (실제 환경: 토스페이먼츠 SDK 로드 후 requestBillingAuth 호출)
// 시연 환경: authKey 직접 입력 또는 테스트 흐름
// ===========================

function BillingCardForm({
  planId,
  planName,
  amount,
  onSuccess,
  onCancel,
}: {
  readonly planId: string;
  readonly planName: string;
  readonly amount: number;
  readonly onSuccess: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState<'info' | 'processing' | 'done' | 'error'>('info');
  const [errorMsg, setErrorMsg] = useState('');

  // 토스페이먼츠 SDK 연동 시뮬레이션
  // 실제: loadTossPayments(clientKey).then(toss => toss.requestBillingAuth({...}))
  const handleStartBilling = async () => {
    setStep('processing');

    const clientKey = import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY as string | undefined;

    if (!clientKey || clientKey.startsWith('ck_test')) {
      // 테스트 모드: 시뮬레이션
      await new Promise((r) => setTimeout(r, 1500));

      try {
        await apiPost('/payments/billing/confirm', {
          authKey: `test_auth_key_${Date.now()}`,
          customerKey: `ct_customer_${Date.now()}`,
          plan: planId,
        });
        setStep('done');
        setTimeout(onSuccess, 1200);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다');
        setStep('error');
      }
      return;
    }

    // 실제 토스페이먼츠 SDK 연동
    // SDK를 <script> 태그로 동적 삽입 후 window.TossPayments 호출
    try {
      await loadTossScript();
      const tossInit = (window as unknown as Record<string, unknown>).TossPayments as
        | ((key: string) => { requestBillingAuth: (opts: Record<string, unknown>) => Promise<void> })
        | undefined;
      if (!tossInit) throw new Error('토스페이먼츠 SDK 로드 실패');

      const toss = tossInit(clientKey);
      const customerKey = `ct_${Date.now()}`;
      await toss.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/subscription/billing/success?plan=${planId}&customerKey=${customerKey}`,
        failUrl: `${window.location.origin}/subscription/billing/fail`,
        customerEmail: '',
        customerName: '',
        customerKey,
      });
      // requestBillingAuth는 리다이렉트이므로 이 이후 코드는 실행되지 않음
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '카드 등록 중 오류가 발생했습니다');
      setStep('error');
    }
  };

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ border: '1px solid var(--ct-border)', background: 'var(--ct-card)' }}
    >
      <p className="font-semibold text-sm" style={{ color: 'var(--ct-text)' }}>
        💳 {planName} 플랜 결제 등록
      </p>

      {step === 'info' && (
        <>
          <div
            className="rounded-xl p-4 text-sm space-y-1"
            style={{ background: 'rgba(59,130,246,0.06)' }}
          >
            <p style={{ color: 'var(--ct-text)' }}>
              <span className="font-semibold">첫 결제 금액:</span> {amount.toLocaleString()}원
            </p>
            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              매월 자동으로 결제됩니다. 언제든지 취소 가능하며, 취소 시 현재 기간까지 서비스가 유지됩니다.
            </p>
          </div>

          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: 'rgba(250,220,0,0.06)', border: '1px solid rgba(250,220,0,0.2)' }}
          >
            <p className="font-semibold mb-1" style={{ color: '#b45309' }}>🔒 안전한 결제</p>
            <p style={{ color: 'var(--ct-text-secondary)' }}>
              카드 정보는 토스페이먼츠가 PCI DSS 인증 환경에서 직접 관리합니다.
              CowTalk 서버에는 카드번호가 저장되지 않습니다.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleStartBilling()}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--ct-primary)' }}
            >
              카드 등록 및 결제 시작
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2.5 text-sm"
              style={{ border: '1px solid var(--ct-border)', color: 'var(--ct-text-secondary)' }}
            >
              취소
            </button>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--ct-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>결제를 처리하고 있습니다...</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-6 gap-2">
          <p className="text-3xl">✅</p>
          <p className="font-semibold" style={{ color: '#16a34a' }}>구독이 활성화되었습니다!</p>
          <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>잠시 후 페이지가 업데이트됩니다</p>
        </div>
      )}

      {step === 'error' && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <p className="text-sm font-semibold text-red-500 mb-1">❌ 결제 실패</p>
          <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{errorMsg}</p>
          <button type="button" onClick={() => setStep('info')} className="mt-3 text-xs underline" style={{ color: 'var(--ct-primary)' }}>
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

// ===========================
// 결제 내역 테이블
// ===========================

function PaymentHistoryTable({ history }: { readonly history: readonly PaymentRecord[] }): React.JSX.Element {
  return (
    <div>
      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>결제 내역</p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--ct-border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--ct-bg)', borderBottom: '1px solid var(--ct-border)' }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>날짜</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>금액</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>상태</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>영수증</th>
            </tr>
          </thead>
          <tbody>
            {history.map((record) => (
              <tr key={record.paymentId} style={{ borderBottom: '1px solid var(--ct-border)' }}>
                <td className="px-4 py-2.5" style={{ color: 'var(--ct-text)' }}>
                  {fmtDate(record.paidAt ?? record.periodStart ?? null)}
                </td>
                <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--ct-text)' }}>
                  {record.amount.toLocaleString()}원
                </td>
                <td className="px-4 py-2.5">
                  {PAYMENT_STATUS[record.status] ?? record.status}
                </td>
                <td className="px-4 py-2.5">
                  {record.receiptUrl ? (
                    <a
                      href={record.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: 'var(--ct-primary)' }}
                    >
                      보기
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================
// 안내 박스
// ===========================

function NoticeBox(): React.JSX.Element {
  return (
    <div
      className="rounded-xl p-4 text-xs space-y-1"
      style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
    >
      <p className="font-semibold" style={{ color: 'var(--ct-text)' }}>결제 관련 안내</p>
      <ul className="space-y-0.5 list-disc list-inside" style={{ color: 'var(--ct-text-secondary)' }}>
        <li>구독은 매월 자동 갱신됩니다</li>
        <li>취소 시 현재 결제 기간 만료일까지 서비스가 유지됩니다</li>
        <li>환불 정책: 결제일 7일 이내 100% 환불 (ha@d2o.kr)</li>
        <li>엔터프라이즈 플랜 및 정부·연구기관 할인 문의: ha@d2o.kr</li>
      </ul>
    </div>
  );
}

// ===========================
// 유틸
// ===========================

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
