// /vet/farms/:farmId/animals/:animalId/chart — 개체 중심 진료차트 (1단계)
// 탭: 개체요약 / 센서·이력 / 과거기록 / 진료입력 / 대화형(2단계) / 문서(4단계)
// 하단 항상 접근 가능한 액션바: 불러오기·저장·수정·보내기·프린트·PDF발행
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vetApi, type SaveVisitPayload, type ConversationNoteResult, type StructuredNote } from '@web/api/vet.api';
import { VetCard, VetButton, VetTabBar, KeyValueList } from './vet-ui';

const CONFIRM_ITEMS = [
  { id: 'diagnosis', label: '최종 진단을 확인했습니다.' },
  { id: 'prescription', label: '처방 및 투약 내용을 확인했습니다.' },
  { id: 'withdrawal', label: '휴약기간을 확인하고 농장주에게 고지했습니다.' },
  { id: 'quarantine', label: '필요한 경우 방역 신고 여부를 확인했습니다.' },
] as const;

const TABS = [
  { id: 'summary', label: '개체요약' },
  { id: 'sensor', label: '센서·이력' },
  { id: 'history', label: '과거기록' },
  { id: 'input', label: '진료입력' },
  { id: 'conversation', label: '대화형' },
  { id: 'documents', label: '문서' },
] as const;

export default function VetChartPage(): React.JSX.Element {
  const { farmId = '', animalId = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('summary');
  const [notice, setNotice] = useState<string | null>(null);

  const ctxQuery = useQuery({
    queryKey: ['vet', 'clinical-context', farmId, animalId],
    queryFn: () => vetApi.clinicalContext(farmId, animalId),
    enabled: !!farmId && !!animalId,
  });
  const visitsQuery = useQuery({
    queryKey: ['vet', 'visits', farmId, animalId],
    queryFn: () => vetApi.listVisits(farmId, animalId),
    enabled: !!farmId && !!animalId,
  });

  const [form, setForm] = useState<SaveVisitPayload>({ status: 'saved', inputMethod: 'manual' });
  const setField = (k: keyof SaveVisitPayload, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  // 2단계 — 대화형 기록
  const [rawNote, setRawNote] = useState('');
  const [aiResult, setAiResult] = useState<ConversationNoteResult | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const structureMutation = useMutation({
    mutationFn: () => vetApi.structureConversationNote(farmId, animalId, rawNote),
    onSuccess: (res) => { setAiResult(res); setNotice(null); },
    onError: () => setNotice('AI 정리에 실패했습니다 (AI 엔진 비가용 또는 개체 확인 불가).'),
  });

  function applyDraft(n: StructuredNote): void {
    setForm((p) => ({
      ...p,
      chiefComplaint: n.chief_complaint || p.chiefComplaint,
      physicalExam: n.physical_exam || p.physicalExam,
      differentialDiagnosis: n.differential_diagnosis || p.differentialDiagnosis,
      finalDiagnosis: n.final_diagnosis || p.finalDiagnosis,
      treatment: n.treatment || p.treatment,
      prescription: n.prescription || p.prescription,
      medication: n.medication || p.medication,
      withdrawalPeriod: n.withdrawal_period || p.withdrawalPeriod,
      prognosis: n.prognosis || p.prognosis,
      farmerInstruction: n.farmer_instruction || p.farmerInstruction,
      quarantineRequired: n.quarantine_required,
      rawConversationNote: rawNote,
      inputMethod: 'conversation',
      aiStructuredNote: n as unknown as Record<string, unknown>,
    }));
    setNotice('AI 초안을 진료입력에 적용했습니다. 최종 진단·처방·투약을 확인하고 저장하세요.');
    setTab('input');
  }

  const saveMutation = useMutation({
    mutationFn: () => vetApi.saveVisit(farmId, animalId, {
      ...form,
      veterinarianConfirmedAiNote: form.inputMethod === 'conversation',
    }),
    onSuccess: (res) => {
      setNotice(`진료기록 저장 완료 (ID: ${res.visitId.slice(0, 8)}…). 저장 시점 데이터가 snapshot으로 동결되었습니다.`);
      setForm({ status: 'saved', inputMethod: 'manual' });
      setRawNote(''); setAiResult(null); setChecks({});
      void qc.invalidateQueries({ queryKey: ['vet', 'visits', farmId, animalId] });
      setTab('history');
    },
    onError: () => setNotice('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
  });

  function handleSave(): void {
    if (form.inputMethod === 'conversation') {
      const allChecked = CONFIRM_ITEMS.every((c) => checks[c.id]);
      if (!allChecked) {
        setNotice('대화형 기록 저장 전 필수 확인 항목을 모두 체크하세요.');
        setTab('input');
        return;
      }
    }
    saveMutation.mutate();
  }

  const todo = (label: string) => () => setNotice(`"${label}"는 다음 단계에서 제공됩니다 (1단계는 골격 + 진료 저장/불러오기).`);

  const ctx = ctxQuery.data;
  const animalTag = (ctx?.animal_snapshot?.['ear_tag_number'] as string) ?? animalId.slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-1 pb-28">
      <header className="space-y-1">
        <Link to={`/vet/farms/${farmId}/animals`} className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>← 개체 목록</Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>진료차트 · {animalTag}번</h1>
        {(ctx?.current_withdrawal_status?.['in_withdrawal'] === true) && (
          <p className="text-sm font-semibold" style={{ color: 'var(--ct-warning, #f59e0b)' }}>⚠ 휴약기간 진행 중 — 출하 전 확인 필요</p>
        )}
      </header>

      {notice && (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}>
          {notice}
        </div>
      )}

      <VetTabBar tabs={TABS} active={tab} onChange={setTab} />

      {ctxQuery.isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>통합 진료 데이터 불러오는 중…</p>}
      {ctxQuery.isError && <p className="text-sm" style={{ color: 'var(--ct-danger, #ef4444)' }}>개체 데이터를 불러오지 못했습니다.</p>}

      {ctx && tab === 'summary' && (
        <div className="space-y-3">
          <Section title="목장"><KeyValueList data={ctx.farm_snapshot} /></Section>
          <Section title="개체"><KeyValueList data={ctx.animal_snapshot} /></Section>
          <Section title="번식"><KeyValueList data={ctx.reproduction_snapshot} /></Section>
        </div>
      )}

      {ctx && tab === 'sensor' && (
        <div className="space-y-3">
          <Section title="센서 현황"><KeyValueList data={ctx.sensor_snapshot} /></Section>
          <Section title="활성 알림">
            {ctx.active_alerts.length === 0
              ? <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>활성 알림 없음</p>
              : <ul className="space-y-1 text-sm" style={{ color: 'var(--ct-text)' }}>
                  {ctx.active_alerts.map((a, i) => (
                    <li key={i}>· {String(a['event_type'])} ({String(a['severity'])})</li>
                  ))}
                </ul>}
          </Section>
          <Section title="공공데이터"><KeyValueList data={ctx.public_data_snapshot} /></Section>
        </div>
      )}

      {ctx && tab === 'history' && (
        <div className="space-y-3">
          <Section title="질병·치료 이력"><KeyValueList data={ctx.health_history_snapshot} /></Section>
          <Section title="과거 진료기록">
            {visitsQuery.isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>불러오는 중…</p>}
            {visitsQuery.data && visitsQuery.data.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>아직 진료기록이 없습니다.</p>
            )}
            <ul className="space-y-2">
              {(visitsQuery.data ?? []).map((v) => (
                <li key={v.visit_id} className="rounded-lg p-2 text-sm" style={{ border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}>
                  <div className="font-medium">{new Date(v.visit_datetime).toLocaleString('ko-KR')}</div>
                  <div style={{ color: 'var(--ct-text-secondary)' }}>
                    {v.final_diagnosis ?? v.chief_complaint ?? '기록'} · {v.status}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === 'input' && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="space-y-3"
        >
          <Field label="주증상" value={form.chiefComplaint ?? ''} onChange={(v) => setField('chiefComplaint', v)} />
          <Field label="신체검사 소견" value={form.physicalExam ?? ''} onChange={(v) => setField('physicalExam', v)} textarea />
          <Field label="최종 진단" value={form.finalDiagnosis ?? ''} onChange={(v) => setField('finalDiagnosis', v)} />
          <Field label="처치" value={form.treatment ?? ''} onChange={(v) => setField('treatment', v)} textarea />
          <Field label="처방·투약" value={form.prescription ?? ''} onChange={(v) => setField('prescription', v)} />
          <Field label="휴약기간" value={form.withdrawalPeriod ?? ''} onChange={(v) => setField('withdrawalPeriod', v)} />
          <Field label="예후" value={form.prognosis ?? ''} onChange={(v) => setField('prognosis', v)} />
          <Field label="농장주 지시사항" value={form.farmerInstruction ?? ''} onChange={(v) => setField('farmerInstruction', v)} />
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ct-text)' }}>
            <input type="checkbox" checked={form.quarantineRequired ?? false} onChange={(e) => setField('quarantineRequired', e.target.checked)} />
            방역 조치 필요
          </label>

          {form.inputMethod === 'conversation' && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--ct-warning, #f59e0b)' }}>
              <p className="mb-2 text-xs font-bold" style={{ color: 'var(--ct-warning, #f59e0b)' }}>
                AI 정리 초안입니다. 저장 전 아래를 확인하세요 (전부 체크해야 저장 가능).
              </p>
              <div className="space-y-1.5">
                {CONFIRM_ITEMS.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ct-text)' }}>
                    <input
                      type="checkbox"
                      checked={checks[c.id] ?? false}
                      onChange={(e) => setChecks((p) => ({ ...p, [c.id]: e.target.checked }))}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            저장 시 목장·개체·번식·이력·센서·공공데이터가 이 시점의 snapshot으로 함께 동결됩니다.
          </p>
        </form>
      )}

      {tab === 'conversation' && (
        <div className="space-y-3">
          <VetCard>
            <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>대화형 현장 진료기록</h2>
            <p className="mb-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              소 옆에서 말하듯 입력하면 AI가 진료차트 초안으로 정리합니다. (음성 입력은 다음 단계)
            </p>
            <textarea
              rows={4}
              value={rawNote}
              onChange={(e) => setRawNote(e.target.value)}
              placeholder="예: 분만 후 3일째 식욕저하, 체온 39.8도, 악취 나는 자궁분비물. 산후 자궁염 의심. 항생제와 소염제 투여, 3일 뒤 재진."
              className="w-full rounded-lg px-3 py-2 text-base"
              style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}
            />
            <div className="mt-2">
              <VetButton
                variant="primary"
                disabled={structureMutation.isPending || rawNote.trim().length === 0}
                onClick={() => structureMutation.mutate()}
                title="AI 정리"
              >
                {structureMutation.isPending ? 'AI 정리 중…' : 'AI로 정리하기'}
              </VetButton>
            </div>
          </VetCard>

          {aiResult && (
            <>
              <div
                className="rounded-lg p-2 text-xs"
                style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-warning, #f59e0b)', color: 'var(--ct-warning, #f59e0b)' }}
              >
                {aiResult.ai_disclaimer}
              </div>

              <Section title="① 수의사가 말한 내용">
                <KeyValueList data={aiResult.source_separation.veterinarian_spoken_content} />
              </Section>
              <Section title="② CowTalk가 자동으로 불러온 데이터">
                <KeyValueList data={aiResult.source_separation.cowtalk_auto_data} />
              </Section>
              <Section title="③ AI 제안 (수의사 최종 확인 필요)">
                <KeyValueList data={aiResult.source_separation.ai_suggestions} />
              </Section>

              <Section title="정리된 진료차트 초안">
                <KeyValueList data={aiResult.structured_note as unknown as Record<string, unknown>} />
                {aiResult.structured_note.missing_required_fields.length > 0 && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--ct-warning, #f59e0b)' }}>
                    누락: {aiResult.structured_note.missing_required_fields.join(', ')}
                  </p>
                )}
                {aiResult.structured_note.safety_warnings.length > 0 && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--ct-danger, #ef4444)' }}>
                    ⚠ {aiResult.structured_note.safety_warnings.join(' · ')}
                  </p>
                )}
                <div className="mt-3">
                  <VetButton variant="primary" onClick={() => applyDraft(aiResult.structured_note)} title="진료입력에 적용">
                    진료입력에 적용 →
                  </VetButton>
                </div>
              </Section>
            </>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <VetCard>
          <p className="text-sm" style={{ color: 'var(--ct-text)' }}>📄 진료기록부·처방전·진단서 PDF 발행은 <b>4~6단계</b>에서 제공됩니다.</p>
        </VetCard>
      )}

      {/* 항상 접근 가능한 현장 액션바 */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 overflow-x-auto p-2"
        style={{ background: 'var(--ct-bg, #0b0b12)', borderTop: '1px solid var(--ct-border)' }}
      >
        <VetButton onClick={() => { void ctxQuery.refetch(); void visitsQuery.refetch(); }} title="불러오기">불러오기</VetButton>
        <VetButton variant="primary" onClick={handleSave} disabled={saveMutation.isPending} title="저장하기">
          {saveMutation.isPending ? '저장 중…' : '저장하기'}
        </VetButton>
        <VetButton onClick={todo('수정하기')} title="수정하기">수정</VetButton>
        <VetButton onClick={todo('보내기')} title="보내기">보내기</VetButton>
        <VetButton onClick={todo('프린트하기')} title="프린트하기">프린트</VetButton>
        <VetButton onClick={todo('PDF 발행')} title="PDF 발행">PDF</VetButton>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <VetCard>
      <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>{title}</h2>
      {children}
    </VetCard>
  );
}

function Field({
  label, value, onChange, textarea = false,
}: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
}): React.JSX.Element {
  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: 'w-full rounded-lg px-3 py-2 text-base',
    style: { background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' } as React.CSSProperties,
  };
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
      {textarea ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
    </label>
  );
}
