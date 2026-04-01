// 카카오 알림톡 설정 + 테스트 발송 섹션
// 공모사업 시연용: "알람 → 카카오톡 즉시 전송" 30초 안에 보여줌

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '@web/api/client';

interface AlimtalkStatus {
  readonly testMode: boolean;
  readonly configured: boolean;
  readonly templates: readonly string[];
  readonly provider: string;
  readonly channelName: string;
  readonly approvalStatus: 'ready' | 'pending_registration';
}

interface TestResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly testMode: boolean;
  readonly error?: string;
}

const TEMPLATE_LABELS: Readonly<Record<string, { label: string; icon: string; desc: string }>> = {
  ESTRUS_ALERT:          { icon: '🔴', label: '발정 감지',     desc: '발정 알람 즉시 → 수정사 전송' },
  INSEMINATION_TIMING:   { icon: '💉', label: '수정 적기',     desc: '수정 최적 시간 도래 알림' },
  PREGNANCY_CHECK_DUE:   { icon: '🔍', label: '임신감정 예정', desc: '수정 28일 후 임신감정 알림' },
  CALVING_IMMINENT:      { icon: '🐄', label: '분만 임박',     desc: '예상 분만일 3일 전 알림' },
  DISEASE_SUSPECTED:     { icon: '⚠️', label: '질병 의심',     desc: 'AI 질병 의심 감지 즉시 알림' },
  QUARANTINE_ALERT:      { icon: '🛡️', label: '방역 경보',     desc: '지역 방역 경보 일괄 발송' },
};

const TEMPLATE_OPTIONS = [
  'ESTRUS_ALERT', 'INSEMINATION_TIMING', 'PREGNANCY_CHECK_DUE',
  'CALVING_IMMINENT', 'DISEASE_SUSPECTED', 'QUARANTINE_ALERT',
] as const;

type TemplateId = typeof TEMPLATE_OPTIONS[number];

const SAMPLE_VARIABLES: Readonly<Record<TemplateId, Record<string, string>>> = {
  ESTRUS_ALERT:        { farmName: '해돋이목장', earTag: '423', detectedAt: '오늘 03:42', optimalTime: '오늘 15:00~21:00' },
  INSEMINATION_TIMING: { farmName: '해돋이목장', earTag: '423', windowStart: '15:00', windowEnd: '21:00' },
  PREGNANCY_CHECK_DUE: { farmName: '해돋이목장', earTag: '423', inseminationDate: '3/10', checkDate: '4/7', days: '28' },
  CALVING_IMMINENT:    { farmName: '해돋이목장', earTag: '423', parity: '3', calvingDate: '4/5' },
  DISEASE_SUSPECTED:   { farmName: '해돋이목장', earTag: '423', symptom: '유방염', confidence: '87' },
  QUARANTINE_ALERT:    { region: '경기도 포천시', disease: '구제역', farmCount: '3', level: '경계' },
};

export function KakaoAlimtalkSettings(): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('ESTRUS_ALERT');
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const { data: status } = useQuery<AlimtalkStatus>({
    queryKey: ['alimtalk-status'],
    queryFn: () => apiGet<AlimtalkStatus>('/notifications/alimtalk/status'),
    staleTime: 60_000,
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiPost<{ data: TestResult }>('/notifications/alimtalk/test', {
        phone: phone.replace(/[-\s]/g, ''),
        templateId: selectedTemplate,
        variables: SAMPLE_VARIABLES[selectedTemplate],
      }),
    onSuccess: (res) => setLastResult(res.data),
    onError: () => setLastResult({ success: false, testMode: true, error: '발송 실패' }),
  });

  const isReady = status?.configured && !status.testMode;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--ct-border)' }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(250,220,0,0.08)', borderBottom: '1px solid var(--ct-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">💬</span>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>카카오 알림톡</p>
            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              {status?.provider ?? 'Solapi (솔라피)'} · {status?.channelName ?? 'CowTalk 공식채널'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: isReady ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                color: isReady ? '#16a34a' : '#d97706',
              }}
            >
              {status.testMode ? '테스트 모드' : '실발송'}
            </span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: status?.configured ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
              color: status?.configured ? '#16a34a' : '#dc2626',
            }}
          >
            {status?.approvalStatus === 'ready' ? '연동 완료' : '채널 등록 필요'}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* 등록 안내 (미연동 시) */}
        {status && !status.configured && (
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)' }}
          >
            <p className="text-xs font-semibold" style={{ color: '#d97706' }}>📋 카카오 알림톡 활성화 절차</p>
            <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: 'var(--ct-text-secondary)' }}>
              <li>카카오 비즈니스 채널 등록 → <strong>business.kakao.com</strong></li>
              <li>Solapi 계정 생성 → 카카오채널 연동 → API 키 발급</li>
              <li>6개 템플릿 심사 신청 (자동 승인 약 2~3일)</li>
              <li>.env에 KAKAO_ALIMTALK_API_KEY, PFID 등록 → 즉시 실발송 전환</li>
            </ol>
            <p className="text-[11px] mt-2" style={{ color: 'var(--ct-text-secondary)' }}>
              템플릿 승인 전까지 테스트 모드로 동작 — 메시지 내용은 서버 로그에서 확인
            </p>
          </div>
        )}

        {/* 템플릿 목록 */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>지원 알림 유형 (6종)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATE_OPTIONS.map((tid) => {
              const meta = TEMPLATE_LABELS[tid] ?? { icon: '📢', label: tid, desc: '' };
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setSelectedTemplate(tid)}
                  className="rounded-xl p-2.5 text-left transition-all hover:opacity-80"
                  style={{
                    background: selectedTemplate === tid ? 'rgba(59,130,246,0.08)' : 'var(--ct-bg)',
                    border: selectedTemplate === tid ? '1.5px solid var(--ct-primary)' : '1px solid var(--ct-border)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{meta.icon}</span>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>{meta.label}</p>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>{meta.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 테스트 발송 */}
        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>테스트 발송</p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              autoComplete="tel"
              className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
              style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
            />
            <button
              type="button"
              onClick={() => testMutation.mutate()}
              disabled={!phone.trim() || testMutation.isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex-shrink-0"
              style={{ background: 'var(--ct-primary)' }}
            >
              {testMutation.isPending ? '발송 중...' : '테스트 발송'}
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>
            {status?.testMode
              ? '테스트 모드: 실제 카카오톡이 발송되지 않으며, 서버 로그에서 내용 확인 가능'
              : '선택한 템플릿으로 실제 카카오톡 알림이 발송됩니다'}
          </p>

          {/* 결과 */}
          {lastResult && (
            <div
              className="rounded-xl p-3"
              style={{
                background: lastResult.success ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.06)',
                border: `1px solid ${lastResult.success ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
              }}
            >
              <p className="text-xs font-semibold" style={{ color: lastResult.success ? '#16a34a' : '#dc2626' }}>
                {lastResult.success ? '✅ 발송 완료' : '❌ 발송 실패'}
                {lastResult.testMode && ' (테스트 모드)'}
              </p>
              {lastResult.messageId && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                  메시지 ID: {lastResult.messageId}
                </p>
              )}
              {lastResult.error && (
                <p className="text-[11px] mt-0.5 text-red-500">{lastResult.error}</p>
              )}
            </div>
          )}
        </div>

        {/* 샘플 메시지 미리보기 */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'rgba(250,220,0,0.04)', border: '1px solid rgba(250,220,0,0.2)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: '#b45309' }}>
            💬 미리보기 — {TEMPLATE_LABELS[selectedTemplate]?.label}
          </p>
          <SampleMessage templateId={selectedTemplate} />
        </div>
      </div>
    </div>
  );
}

// ===========================
// 샘플 메시지 미리보기
// ===========================

function SampleMessage({ templateId }: { templateId: TemplateId }): React.JSX.Element {
  const vars = SAMPLE_VARIABLES[templateId];

  const PREVIEWS: Readonly<Record<TemplateId, string>> = {
    ESTRUS_ALERT:
      `[CowTalk] 발정 감지 알림\n\n목장: ${vars.farmName}\n개체: ${vars.earTag}번\n감지 시각: ${vars.detectedAt}\n\n수정 적기: ${vars.optimalTime}\n\n지금 바로 CowTalk에서 정액을 추천받으세요.`,
    INSEMINATION_TIMING:
      `[CowTalk] 수정 적기 도래\n\n목장: ${vars.farmName}\n개체: ${vars.earTag}번\n수정 가능 시간: ${vars.windowStart} ~ ${vars.windowEnd}\n\n지금이 최적의 수정 시간입니다.`,
    PREGNANCY_CHECK_DUE:
      `[CowTalk] 임신감정 예정 알림\n\n목장: ${vars.farmName}\n개체: ${vars.earTag}번\n수정일: ${vars.inseminationDate}\n임신감정 예정일: ${vars.checkDate} (수정 후 ${vars.days}일)`,
    CALVING_IMMINENT:
      `[CowTalk] 분만 임박 알림\n\n목장: ${vars.farmName}\n개체: ${vars.earTag}번 (${vars.parity}산)\n예상 분만일: ${vars.calvingDate}\n\n분만 준비를 확인해주세요.`,
    DISEASE_SUSPECTED:
      `[CowTalk] 질병 의심 알림\n\n목장: ${vars.farmName}\n개체: ${vars.earTag}번\n의심 증상: ${vars.symptom}\nAI 신뢰도: ${vars.confidence}%\n\n즉시 수의사에게 상담하세요.`,
    QUARANTINE_ALERT:
      `[CowTalk] 방역 경보\n\n지역: ${vars.region}\n의심 질병: ${vars.disease}\n발생 농장: ${vars.farmCount}개소\n경보 등급: ${vars.level}\n\n즉시 방역 조치를 시행하세요.`,
  };

  return (
    <pre
      className="text-xs whitespace-pre-wrap leading-relaxed"
      style={{ color: 'var(--ct-text)', fontFamily: 'inherit' }}
    >
      {PREVIEWS[templateId]}
    </pre>
  );
}
