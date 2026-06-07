// /vet/profile — 수의사 면허/병원 마스터 등록·수정
// 여기서 저장한 면허번호·병원정보가 발행 문서(진료기록부·처방전·진단서)에 자동 기입된다.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vetApi, type VetProfilePayload } from '@web/api/vet.api';
import { VetCard, VetButton } from './vet-ui';

const EMPTY: VetProfilePayload = {
  licenseNumber: '', clinicName: '', clinicAddress: '', clinicPhone: '',
};

export default function VetProfilePage(): React.JSX.Element {
  const qc = useQueryClient();
  const [form, setForm] = useState<VetProfilePayload>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);

  const profileQuery = useQuery({ queryKey: ['vet', 'profile'], queryFn: () => vetApi.getProfile() });

  useEffect(() => {
    if (profileQuery.data) {
      setForm({
        licenseNumber: profileQuery.data.licenseNumber ?? '',
        clinicName: profileQuery.data.clinicName ?? '',
        clinicAddress: profileQuery.data.clinicAddress ?? '',
        clinicPhone: profileQuery.data.clinicPhone ?? '',
      });
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => vetApi.saveProfile(form),
    onSuccess: () => {
      setNotice('면허/병원 정보가 저장되었습니다. 이후 발행 문서에 자동 기입됩니다.');
      void qc.invalidateQueries({ queryKey: ['vet', 'profile'] });
    },
    onError: () => setNotice('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
  });

  const set = (k: keyof VetProfilePayload, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="mx-auto max-w-xl space-y-3 p-1 pb-10">
      <header className="space-y-1">
        <Link to="/vet" className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>← 진료센터</Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>면허 · 병원 정보</h1>
        <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          여기 등록한 정보가 진료기록부·처방전·진단서 발행 시 자동으로 기입됩니다.
        </p>
      </header>

      {notice && (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}>
          {notice}
        </div>
      )}

      <VetCard>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
          <Field label="수의사 면허번호" value={form.licenseNumber ?? ''} onChange={(v) => set('licenseNumber', v)} />
          <Field label="동물병원/소속명" value={form.clinicName ?? ''} onChange={(v) => set('clinicName', v)} />
          <Field label="병원 주소" value={form.clinicAddress ?? ''} onChange={(v) => set('clinicAddress', v)} />
          <Field label="병원 전화번호" value={form.clinicPhone ?? ''} onChange={(v) => set('clinicPhone', v)} />
          <VetButton variant="primary" type="submit" disabled={saveMutation.isPending} title="저장">
            {saveMutation.isPending ? '저장 중…' : '저장'}
          </VetButton>
        </form>
      </VetCard>
    </div>
  );
}

function Field({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-base"
        style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}
      />
    </label>
  );
}
