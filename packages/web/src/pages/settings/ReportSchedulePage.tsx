// 보고서 자동 발송 — 주간/월간/분기/성과 보고서를 메일로 받는 구독 관리
//
// 이 화면이 필요한 이유: 자동 발송은 눈에 보이지 않는 기능이라, 발송 이력이 없으면
// "메일이 안 왔다"와 "발송했는데 스팸함에 있다"를 구분할 수 없다. 성공·실패·테스트모드를
// 그대로 노출한다 (SMTP 미설정이면 '실제 발송 안 됨'이라고 화면에 적는다).

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchReportSchedules,
  fetchReportDeliveries,
  saveReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  runReportNow,
  REPORT_KIND_LABELS,
  type ReportKind,
  type ReportSchedule,
  type RunNowResult,
} from '@web/api/report-schedule.api';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

const KINDS: readonly { kind: ReportKind; label: string; detail: string }[] = [
  { kind: 'weekly', label: '주간 보고서', detail: '매주 지난 월~일 집계 — 알림·번식·건강·유량 증감 (월요일 발송)' },
  { kind: 'monthly', label: '월간 보고서', detail: '지난 달 전체 집계 + 직전 달 대비 증감 (매월 1일 발송)' },
  { kind: 'quarterly', label: '분기 보고서', detail: '지난 분기 집계 + 직전 분기 대비 (1·4·7·10월 1일 발송)' },
  { kind: 'performance', label: '성과 보고서', detail: '월간 지표 + 파일럿 누적 성과 (조치율·치료·두당 마진) — 지자체 제출 근거용' },
];

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export function ReportSchedulePage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { selectedFarmId } = useFarmStore();
  const [email, setEmail] = useState('');
  const [sendHour, setSendHour] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunNowResult | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['report-schedules', selectedFarmId],
    queryFn: () => fetchReportSchedules(selectedFarmId ?? undefined),
  });
  const { data: deliveries } = useQuery({
    queryKey: ['report-deliveries', selectedFarmId],
    queryFn: () => fetchReportDeliveries(selectedFarmId ?? undefined),
    refetchInterval: 120_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    void queryClient.invalidateQueries({ queryKey: ['report-deliveries'] });
  };

  const onError = (fallback: string) => (e: unknown): void => {
    const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
    setError(msg ?? fallback);
  };

  const saveMutation = useMutation({
    mutationFn: saveReportSchedule,
    onSuccess: () => { setError(null); invalidate(); },
    onError: onError('구독 저장에 실패했습니다.'),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ scheduleId, enabled }: { scheduleId: string; enabled: boolean }) =>
      updateReportSchedule(scheduleId, { enabled }),
    onSuccess: invalidate,
    onError: onError('상태 변경에 실패했습니다.'),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteReportSchedule,
    onSuccess: invalidate,
    onError: onError('해지에 실패했습니다.'),
  });
  const runMutation = useMutation({
    mutationFn: runReportNow,
    onSuccess: (result) => { setRunResult(result); setError(null); invalidate(); },
    onError: onError('즉시 발송에 실패했습니다.'),
  });

  const byKind = new Map<ReportKind, ReportSchedule>();
  for (const s of schedules ?? []) byKind.set(s.kind, s);

  function handleSubscribe(kind: ReportKind): void {
    if (!selectedFarmId) {
      setError('먼저 목장을 선택해 주세요.');
      return;
    }
    const existing = byKind.get(kind);
    const recipients = email.trim() ? [email.trim()] : existing?.recipients;
    if (!recipients || recipients.length === 0) {
      setError('받을 이메일 주소를 입력해 주세요.');
      return;
    }
    saveMutation.mutate({
      farmId: selectedFarmId,
      kind,
      recipients,
      sendHourKst: sendHour,
      format: 'xlsx',
      enabled: true,
    });
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TitleAccentBar />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ct-text)', margin: 0 }}>보고서 자동 발송</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginBottom: 16 }}>
        기간이 끝나면 보고서를 자동으로 만들어 메일로 보냅니다(엑셀 첨부). 서버가 잠시 멈춰 있었다면 다음 점검 때 밀린 보고서가 나갑니다.
      </p>

      {/* 수신 설정 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>받는 사람</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--ct-text-muted)' }} htmlFor="report-email">이메일</label>
          <input
            id="report-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
            placeholder="name@example.com"
            style={{
              flex: '1 1 220px', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--ct-border)', background: 'transparent', color: 'var(--ct-text)', fontSize: 13,
            }}
          />
          <label style={{ fontSize: 12, color: 'var(--ct-text-muted)' }} htmlFor="report-hour">발송 시각(KST)</label>
          <select
            id="report-hour"
            value={sendHour}
            onChange={(e) => { setSendHour(Number(e.target.value)); }}
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ct-border)',
              background: 'transparent', color: 'var(--ct-text)', fontSize: 13,
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 8 }}>
          비워 두면 기존 수신자가 유지됩니다. 목장: {selectedFarmId ? '선택됨' : '미선택 — 상단에서 목장을 골라 주세요'}
        </div>
        {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>}
      </div>

      {/* 주기별 구독 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>보고서 종류</div>
        {isLoading && <div className="ct-shimmer" style={{ height: 60, borderRadius: 10 }} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {KINDS.map(({ kind, label, detail }) => {
            const s = byKind.get(kind);
            return (
              <div
                key={kind}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                  borderRadius: 10, border: '1px solid var(--ct-border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ct-text)' }}>
                    {label}
                    {s && !s.enabled && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ct-text-muted)' }}>(중지됨)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{detail}</div>
                  {s && (
                    <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 4 }}>
                      수신 {s.recipients.join(', ')} · {String(s.sendHourKst).padStart(2, '0')}시 · 마지막 발송 {fmtDateTime(s.lastSentAt)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => { handleSubscribe(kind); }}
                    disabled={saveMutation.isPending}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--ct-primary)', border: 'none', cursor: 'pointer' }}
                  >
                    {s ? '수정' : '구독'}
                  </button>
                  {s && (
                    <>
                      <button
                        type="button"
                        onClick={() => { toggleMutation.mutate({ scheduleId: s.scheduleId, enabled: !s.enabled }); }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'transparent', border: '1px solid var(--ct-border)', color: 'var(--ct-text)', cursor: 'pointer' }}
                      >
                        {s.enabled ? '중지' : '재개'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { runMutation.mutate(s.scheduleId); }}
                        disabled={runMutation.isPending}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'transparent', border: '1px solid var(--ct-border)', color: 'var(--ct-text)', cursor: 'pointer' }}
                      >
                        지금 보내기
                      </button>
                      <button
                        type="button"
                        onClick={() => { deleteMutation.mutate(s.scheduleId); }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'transparent', border: '1px solid var(--ct-border)', color: '#ef4444', cursor: 'pointer' }}
                      >
                        해지
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {runResult && (
          <div
            role="status"
            style={{
              marginTop: 10, fontSize: 12, padding: '8px 10px', borderRadius: 8,
              background: 'rgba(16,185,129,0.08)', color: 'var(--ct-text)',
            }}
          >
            {runResult.status === 'sent'
              ? runResult.testMode
                ? '보고서를 만들었지만 서버에 메일(SMTP) 설정이 없어 실제로 발송되지는 않았습니다. 관리자에게 SMTP 설정을 요청하세요.'
                : `발송했습니다 → ${runResult.recipients.join(', ')}`
              : `발송하지 못했습니다: ${runResult.reason ?? '알 수 없는 오류'}`}
          </div>
        )}
      </div>

      {/* 발송 이력 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>발송 이력</div>
        {(deliveries?.length ?? 0) === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>아직 발송 이력이 없습니다.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {deliveries?.slice(0, 30).map((d) => (
            <div
              key={d.deliveryId}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 8, border: '1px solid var(--ct-border)', fontSize: 12,
              }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                  color: '#fff', background: d.status === 'sent' ? (d.testMode ? '#f59e0b' : '#22c55e') : '#ef4444',
                }}
              >
                {d.status === 'sent' ? (d.testMode ? '미발송(설정없음)' : '발송') : '실패'}
              </span>
              <span style={{ color: 'var(--ct-text)' }}>
                {REPORT_KIND_LABELS[d.kind]} · {d.periodKey.split(':')[1]}
                {d.manual && <span style={{ color: 'var(--ct-text-muted)' }}> (수동)</span>}
              </span>
              <span style={{ color: 'var(--ct-text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.errorMessage ?? d.recipients.join(', ')}
              </span>
              <span style={{ color: 'var(--ct-text-muted)', flexShrink: 0 }}>{fmtDateTime(d.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReportSchedulePage;
